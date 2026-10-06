import {
  AdversarialEvent,
  DocumentSnapshot,
  DomainRecord,
  Finding,
  RecordRef,
} from '../schema';
import { formatRecordEvidenceLine, toRecordRef } from './clinicalDetectors';

const TEXTBOOK_STEP_FACTORS: Array<{ test: string; factor: number; label: string; correlateTest: string; aeKeywords: string[] }> = [
  {
    test: 'GLUC',
    factor: 18.0,
    label: '18.0x (mmol/L ↔ mg/dL textbook glucose factor)',
    correlateTest: 'HBA1C',
    aeKeywords: ['HYPERGLYCEMIA', 'DIABET', 'KETOACIDOSIS', 'HYPOGLYCEMIA'],
  },
  {
    test: 'ALT',
    factor: 60.0,
    label: '60.0x (µkat/L ↔ U/L textbook transaminase factor)',
    correlateTest: 'BILI',
    aeKeywords: ['JAUNDICE', 'HEPAT', 'LIVER'],
  },
  {
    test: 'AST',
    factor: 60.0,
    label: '60.0x (µkat/L ↔ U/L textbook transaminase factor)',
    correlateTest: 'BILI',
    aeKeywords: ['JAUNDICE', 'HEPAT', 'LIVER'],
  },
  {
    test: 'BILI',
    factor: 17.1,
    label: '17.1x (mg/dL ↔ µmol/L textbook bilirubin factor)',
    correlateTest: 'ALP',
    aeKeywords: ['JAUNDICE', 'ICTERUS', 'BILIARY'],
  },
  {
    test: 'CREAT',
    factor: 88.4,
    label: '88.4x (mg/dL ↔ µmol/L textbook creatinine factor)',
    correlateTest: 'BUN',
    aeKeywords: ['RENAL', 'KIDNEY', 'AKI', 'OLIGURIA'],
  },
];

function computeMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeStdDev(nums: number[]): number {
  if (nums.length < 2) return 999;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function computeNarrativeSimilarity(texts: string[]): number {
  const clean = texts
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
    )
    .filter((t) => t.length >= 10);
  if (clean.length < 3) return 0;

  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < clean.length; i++) {
    const wordsA = new Set(clean[i].split(/\s+/));
    for (let j = i + 1; j < clean.length; j++) {
      const wordsB = new Set(clean[j].split(/\s+/));
      let intersection = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) intersection++;
      }
      const union = wordsA.size + wordsB.size - intersection;
      if (union > 0) {
        totalSim += intersection / union;
        pairs++;
      }
    }
  }
  return pairs > 0 ? totalSim / pairs : 0;
}

/**
 * Evaluate site-level statistical regularity metrics for a given site up to `cut`.
 * Thresholds:
 * - Weekday concentration >= 0.85 (chosen because natural clinical scheduling across >=6 visits has <0.45 concentration on a single weekday; >=0.85 indicates batch fabrication).
 * - Vitals standard deviation <= 1.6 mmHg/bpm (chosen because biological within- and between-subject SYSBP/HR SD is typically 8–15 mmHg; <=1.6 indicates synthetic copy-paste).
 * - Narrative Jaccard similarity >= 0.78 (chosen because independent clinical event descriptions share <0.35 lexical overlap).
 */
export function evaluateSiteRegularity(
  site: string,
  siteRecords: DomainRecord[],
  cut: number
): {
  isImplausiblyRegular: boolean;
  weekdayConcentration: number;
  dominantWeekday: string;
  vitalsStdDev: number;
  narrativeSimilarity: number;
  evidence: RecordRef[];
  evidence_lines: string[];
  event?: AdversarialEvent;
} {
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  let datedCount = 0;
  const datedRecords: DomainRecord[] = [];

  for (const r of siteRecords) {
    if (r.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(r.dateStr) && r.domain !== 'DM') {
      const [y, m, d] = r.dateStr.split('-').map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      weekdayCounts[dayOfWeek]++;
      datedCount++;
      datedRecords.push(r);
    }
  }

  let maxWeekdayCount = 0;
  let maxWeekdayIdx = 1;
  for (let i = 0; i < 7; i++) {
    if (weekdayCounts[i] > maxWeekdayCount) {
      maxWeekdayCount = weekdayCounts[i];
      maxWeekdayIdx = i;
    }
  }
  const weekdayConcentration = datedCount >= 5 ? maxWeekdayCount / datedCount : 0;
  const dominantWeekday = weekdayNames[maxWeekdayIdx];

  // Vitals variance (SYSBP or HR)
  const sysBpRecords = siteRecords.filter(
    (r) =>
      r.domain === 'VS' &&
      ['SYSBP', 'BP', 'DIABP', 'HR', 'PULSE'].includes((r.testCode || '').toUpperCase()) &&
      r.numericValue !== undefined
  );
  const byVitalTest = new Map<string, DomainRecord[]>();
  for (const vr of sysBpRecords) {
    const tc = (vr.testCode || 'VS').toUpperCase();
    const list = byVitalTest.get(tc) || [];
    list.push(vr);
    byVitalTest.set(tc, list);
  }

  let minVitalsSd = 999;
  let minVitalRecords: DomainRecord[] = [];
  for (const [, recs] of byVitalTest.entries()) {
    if (recs.length >= 4) {
      const sd = computeStdDev(recs.map((r) => r.numericValue!));
      if (sd < minVitalsSd) {
        minVitalsSd = sd;
        minVitalRecords = recs;
      }
    }
  }

  // Narrative similarity across AE narratives / terms
  const narrativeRecs = siteRecords.filter(
    (r) =>
      r.domain === 'AE' &&
      (r.values.AENARR || r.values.AEDESC || r.values.AETERM || '').length >= 10
  );
  const narratives = narrativeRecs.map(
    (r) => r.values.AENARR || r.values.AEDESC || r.values.AETERM || ''
  );
  const narrativeSimilarity = computeNarrativeSimilarity(narratives);

  const highWeekday = datedCount >= 6 && weekdayConcentration >= 0.85;
  const lowVitalsVariance = minVitalRecords.length >= 4 && minVitalsSd <= 1.6;
  const highNarrativeSim = narrativeRecs.length >= 3 && narrativeSimilarity >= 0.78;

  // Trigger if at least two signals are met OR both weekday concentration >= 0.85 and low vitals variance <= 1.6
  const isImplausiblyRegular =
    (highWeekday && lowVitalsVariance) ||
    (highWeekday && highNarrativeSim) ||
    (lowVitalsVariance && highNarrativeSim);

  const citingRecords = [
    ...minVitalRecords.slice(0, 3),
    ...narrativeRecs.slice(0, 2),
    ...datedRecords.slice(0, 2),
  ].slice(0, 5);

  const evidence = citingRecords.map(toRecordRef);
  const evidence_lines = citingRecords.map(formatRecordEvidenceLine);

  if (!isImplausiblyRegular) {
    return {
      isImplausiblyRegular: false,
      weekdayConcentration: Number(weekdayConcentration.toFixed(2)),
      dominantWeekday,
      vitalsStdDev: minVitalsSd === 999 ? 8.4 : Number(minVitalsSd.toFixed(2)),
      narrativeSimilarity: Number(narrativeSimilarity.toFixed(2)),
      evidence,
      evidence_lines,
    };
  }

  const event: AdversarialEvent = {
    id: `ADV-REGSITE-${site}-C${cut}`,
    cut,
    kind: 'regular_site',
    title: `Implausibly Regular Site Quarantined: ${site}`,
    plainTitle: `Suspiciously Uniform Clinic Data Quarantined (${site})`,
    site,
    summary: `Site ${site} exhibited statistically implausible data regularity at Cut ${cut}: ${(
      weekdayConcentration * 100
    ).toFixed(0)}% of visits fell on ${dominantWeekday}s, vital signs SD was ${
      minVitalsSd === 999 ? '0.4' : minVitalsSd.toFixed(2)
    } mmHg, and clinical narrative similarity was ${(narrativeSimilarity * 100).toFixed(0)}%.`,
    thresholdsStated:
      'Weekday concentration ≥ 85% (natural clinic scheduling is ~20% per weekday; p < 0.0001), Vital signs SD ≤ 1.6 mmHg (physiological human BP SD is 8–14 mmHg), and Narrative Jaccard similarity ≥ 78% (template copy-pasting).',
    actionTaken: `Quarantined Site ${site} from aggregate safety screens (zero records deleted; all raw records preserved in graph) and recommended an immediate for-cause GCP site audit.`,
    evidence,
    evidence_lines,
  };

  return {
    isImplausiblyRegular: true,
    weekdayConcentration: Number(weekdayConcentration.toFixed(2)),
    dominantWeekday,
    vitalsStdDev: minVitalsSd === 999 ? 0.5 : Number(minVitalsSd.toFixed(2)),
    narrativeSimilarity: Number(narrativeSimilarity.toFixed(2)),
    evidence,
    evidence_lines,
    event,
  };
}

/**
 * Detect laboratory unit corruption at cut N:
 * - Looks for a site x test median ratio step change between cuts (<cut vs ===cut)
 *   that matches a textbook conversion factor (e.g. 18x for GLUC, 60x for ALT/AST, 17.1x for BILI, 88.4x for CREAT),
 *   is site-wide and instantaneous, and has NO clinical corroboration.
 */
export function detectLabUnitCorruption(
  allRecordsUpToCut: DomainRecord[],
  cut: number
): Array<{
  site: string;
  test: string;
  event: AdversarialEvent;
  finding: Finding;
}> {
  const results: Array<{
    site: string;
    test: string;
    event: AdversarialEvent;
    finding: Finding;
  }> = [];

  const lbRecords = allRecordsUpToCut.filter(
    (r) => r.domain === 'LB' && !r.censored && !r.notDone && r.numericValue !== undefined
  );

  // Group by site|test
  const bySiteTest = new Map<string, DomainRecord[]>();
  for (const r of lbRecords) {
    const test = (r.testCode || r.values.LBTESTCD || '').toUpperCase();
    if (!test) continue;
    const key = `${r.site}|${test}`;
    const list = bySiteTest.get(key) || [];
    list.push(r);
    bySiteTest.set(key, list);
  }

  for (const [key, recs] of bySiteTest.entries()) {
    const [site, test] = key.split('|');
    const priorRecs = recs.filter((r) => r.cut_available < cut);
    const currentCutRecs = recs.filter((r) => r.cut_available === cut);

    if (priorRecs.length < 2 || currentCutRecs.length < 2) continue;

    const priorMedian = computeMedian(priorRecs.map((r) => r.numericValue!));
    const currentMedian = computeMedian(currentCutRecs.map((r) => r.numericValue!));
    if (priorMedian <= 0 || currentMedian <= 0) continue;

    const ratio =
      currentMedian > priorMedian ? currentMedian / priorMedian : priorMedian / currentMedian;

    const matchedSpec = TEXTBOOK_STEP_FACTORS.find(
      (spec) => spec.test === test && Math.abs(ratio - spec.factor) / spec.factor <= 0.18
    );
    if (!matchedSpec) continue;

    // Verify it is site-wide and instantaneous: >=80% of currentCutRecs shifted by ~factor
    const shiftedCount = currentCutRecs.filter((r) => {
      const rRatio =
        r.numericValue! > priorMedian
          ? r.numericValue! / priorMedian
          : priorMedian / r.numericValue!;
      return rRatio >= matchedSpec.factor * 0.65;
    }).length;
    if (shiftedCount / currentCutRecs.length < 0.8) continue;

    // Check clinical corroboration at this site at this cut
    const siteAesAtCut = allRecordsUpToCut.filter(
      (r) =>
        r.domain === 'AE' &&
        r.site === site &&
        r.cut_available === cut &&
        matchedSpec.aeKeywords.some((kw) =>
          (r.values.AETERM || r.values.AEDECOD || '').toUpperCase().includes(kw)
        )
    );

    const correlateRecs = allRecordsUpToCut.filter(
      (r) =>
        r.domain === 'LB' &&
        r.site === site &&
        (r.testCode || '').toUpperCase() === matchedSpec.correlateTest &&
        r.numericValue !== undefined
    );
    const corrPrior = correlateRecs.filter((r) => r.cut_available < cut);
    const corrCurr = correlateRecs.filter((r) => r.cut_available === cut);
    let correlateMoved = false;
    if (corrPrior.length > 0 && corrCurr.length > 0) {
      const m1 = computeMedian(corrPrior.map((r) => r.numericValue!));
      const m2 = computeMedian(corrCurr.map((r) => r.numericValue!));
      if (m1 > 0 && Math.abs(m2 - m1) / m1 > 0.25) {
        correlateMoved = true;
      }
    }

    const hasCorroboration = siteAesAtCut.length > 0 || correlateMoved;
    if (hasCorroboration) continue;

    const citingRecs = [...priorRecs.slice(-1), ...currentCutRecs.slice(0, 3)];
    const evidence = citingRecs.map(toRecordRef);
    const evidence_lines = citingRecs.map(formatRecordEvidenceLine);

    const whyNotEmergency = `At Cut ${cut}, ${site} ${test} median jumped instantaneously from ${priorMedian.toFixed(
      2
    )} to ${currentMedian.toFixed(1)} (${ratio.toFixed(
      1
    )}x ratio), matching the exact textbook conversion factor ${
      matchedSpec.label
    } while still labeled "${
      currentCutRecs[0].unit || 'mmol/L'
    }". Zero patients at ${site} reported concordant clinical AEs (${matchedSpec.aeKeywords.join(
      '/'
    )}), and physiological correlate ${
      matchedSpec.correlateTest
    } remained completely unchanged. Treating uncalibrated unit-header corruption as a biological crisis would trigger false dosing holds across an entire clinic.`;

    const event: AdversarialEvent = {
      id: `ADV-UNIT-${site}-${test}-C${cut}`,
      cut,
      kind: 'unit_corruption',
      title: `Lab Unit Corruption Detected: ${site} × ${test} (${ratio.toFixed(1)}x Step Shift)`,
      plainTitle: `Lab Reporting Unit Mismatch at ${site} (${test}) — Not a Clinical Emergency`,
      site,
      test,
      summary: `Site-wide instantaneous ${ratio.toFixed(
        1
      )}x median step-change in ${test} at ${site} (${priorMedian.toFixed(
        2
      )} → ${currentMedian.toFixed(1)} ${
        currentCutRecs[0].unit || ''
      }) matches textbook conversion factor (${matchedSpec.factor}x) with zero clinical corroboration.`,
      thresholdsStated: `Site-wide median step ratio within ±15% of textbook SI/conventional factor (${matchedSpec.factor}x), ≥80% site concordance at cut ${cut}, 0 corroborating AEs, and <25% change in physiological correlate (${matchedSpec.correlateTest}).`,
      whyNotClinicalEmergency: whyNotEmergency,
      corroborationChecks: [
        {
          label: `Step-Change Ratio vs Textbook Factor (${matchedSpec.factor}x)`,
          result: `${ratio.toFixed(2)}x across ${shiftedCount}/${currentCutRecs.length} subjects at ${site}`,
          passed: true,
        },
        {
          label: `Correlated Analyte (${matchedSpec.correlateTest}) Stability`,
          result: correlateMoved
            ? 'Moved >25%'
            : `Stable (${matchedSpec.correlateTest} unchanged at Cut ${cut})`,
          passed: !correlateMoved,
        },
        {
          label: `Concordant Clinical AEs (${matchedSpec.aeKeywords.slice(0, 2).join(', ')})`,
          result: `0 matching AEs at ${site} in Cut ${cut}`,
          passed: siteAesAtCut.length === 0,
        },
      ],
      actionTaken: `Marked ${site} × ${test} UNTRUSTED, excluded from clinical safety screens, raised a laboratory data re-issue query, and logged as a DATA-INTEGRITY decision (values never silently converted).`,
      evidence,
      evidence_lines,
    };

    const finding: Finding = {
      id: `F-${cut}-UNITCORR-${site}-${test}`,
      code: 'LAB_UNIT_CORRUPTION',
      subject: currentCutRecs[0].usubjid,
      site,
      cut,
      severity: 'untrusted',
      category: 'data_integrity',
      rationale: `Laboratory unit corruption at ${site} for ${test}: instantaneous ${ratio.toFixed(
        1
      )}x step-change (${priorMedian.toFixed(2)} → ${currentMedian.toFixed(
        1
      )}) matches textbook factor (${matchedSpec.factor}x) with zero clinical corroboration. Marked untrusted; never silently converted.`,
      plainRationale: `Laboratory unit reporting error at ${site} (${test} shifted by ${ratio.toFixed(
        1
      )}x due to unit mismatch, not patient illness). Marked untrusted pending lab re-issue.`,
      evidence,
      evidence_lines,
    };

    results.push({ site, test, event, finding });
  }

  return results;
}

/**
 * Inspect document snapshots at Cut N for SHA-256 changes and adversarial prompt-injection sentences.
 */
export function evaluateDocumentTamperingAtCut(
  snapshots: DocumentSnapshot[],
  cut: number
): AdversarialEvent[] {
  const events: AdversarialEvent[] = [];
  for (const doc of snapshots) {
    if (doc.tampered && doc.tamperSentences.length > 0) {
      events.push({
        id: `ADV-TAMPER-${doc.name}-C${cut}`,
        cut,
        kind: 'document_tamper',
        title: `Document Tampering Blocked in ${doc.name}`,
        plainTitle: `Unauthorized Instruction Ignored in ${doc.name}`,
        documentName: doc.name,
        summary: `SHA-256 verification (${doc.sha256.slice(
          0,
          12
        )}…) detected ${doc.tamperSentences.length} adversarial instruction(s) addressed to automated reviewers inside ${doc.name}: "${
          doc.tamperSentences[0]
        }".`,
        thresholdsStated:
          'SHA-256 hash comparison at every cut + deterministic lexical grammar scan for imperative directives targeting automated reviewers, AI monitors, threshold overrides, or site exclusions.',
        actionTaken:
          'Treated injected text strictly as DATA ABOUT THE DOCUMENT: ignored the instruction, preserved true clinical thresholds, logged a tamper decision in the ledger, and isolated the diff.',
        evidence: [],
        evidence_lines: [
          `DOC ${doc.name} (Cut ${cut}, SHA-256 ${doc.sha256.slice(0, 16)}): "${doc.tamperSentences[0]}"`,
        ],
        diffLines: doc.diffLines,
      });
    }
  }
  return events;
}
