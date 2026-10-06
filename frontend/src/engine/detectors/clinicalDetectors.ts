import {
  DomainRecord,
  Finding,
  ProtocolRules,
  RecordRef,
} from '../schema';

/**
 * Format a RecordRef + DomainRecord into the canonical human-readable evidence line:
 * "LB <subject> #<seq>: <test> <value> <unit> on <date>"
 */
export function formatRecordEvidenceLine(rec: DomainRecord): string {
  const datePart = rec.dateStr ? ` on ${rec.dateStr}` : '';
  if (rec.domain === 'LB') {
    const test = rec.testCode || rec.values.LBTESTCD || rec.values.LBTEST || 'LAB';
    const val =
      rec.censored && rec.censorThreshold !== undefined
        ? `<${rec.censorThreshold}`
        : rec.notDone
        ? 'ND'
        : rec.canonicalValue !== undefined
        ? String(rec.canonicalValue)
        : rec.rawValueStr || '';
    const unit = rec.canonicalUnit || rec.unit || '';
    const ulnNote =
      rec.refHigh && rec.canonicalValue !== undefined
        ? ` (${(rec.canonicalValue / rec.refHigh).toFixed(1)}x ULN, ref ≤${rec.refHigh} ${unit})`
        : '';
    return `LB ${rec.usubjid} #${rec.seq}: ${test} ${val} ${unit}${ulnNote}${datePart}`.trim();
  }

  if (rec.domain === 'AE') {
    const term = rec.values.AETERM || rec.values.AEDECOD || rec.testName || 'Adverse Event';
    const ser = rec.values.AESER ? ` [AESER=${rec.values.AESER}` : '';
    const hosp = rec.values.AESHOSP ? `, AESHOSP=${rec.values.AESHOSP}]` : ser ? ']' : '';
    return `AE ${rec.usubjid} #${rec.seq}: ${term}${ser}${hosp}${datePart}`.trim();
  }

  if (rec.domain === 'EX') {
    const trt = rec.values.EXTRT || 'Study Drug';
    const dose = rec.numericValue ?? rec.values.EXDOSE ?? '';
    const unit = rec.unit || rec.values.EXDOSU || 'mg';
    return `EX ${rec.usubjid} #${rec.seq}: ${trt} ${dose} ${unit}${datePart}`.trim();
  }

  if (rec.domain === 'CM') {
    const med = rec.values.CMTRT || rec.values.CMDECOD || rec.testName || 'Medication';
    const ind = rec.values.CMINDC ? ` for ${rec.values.CMINDC}` : '';
    return `CM ${rec.usubjid} #${rec.seq}: ${med}${ind}${datePart}`.trim();
  }

  if (rec.domain === 'DM') {
    const age = rec.values.AGE ? `Age ${rec.values.AGE}` : '';
    const sex = rec.values.SEX ? `Sex ${rec.values.SEX}` : '';
    const init = rec.values.SUBJINIT || rec.values.INITIALS || '';
    const arm = rec.values.ACTARM || rec.values.ARM || '';
    const details = [init ? `Init ${init}` : '', age, sex, arm ? `Arm ${arm}` : '']
      .filter(Boolean)
      .join(', ');
    return `DM ${rec.usubjid} #${rec.seq}: ${details}${datePart}`.trim();
  }

  if (rec.domain === 'VS') {
    const test = rec.testCode || rec.values.VSTESTCD || 'Vitals';
    const val = rec.numericValue ?? rec.rawValueStr ?? '';
    const unit = rec.unit || rec.values.VSORRESU || '';
    const visit = rec.visit ? ` (${rec.visit})` : '';
    return `VS ${rec.usubjid} #${rec.seq}: ${test} ${val} ${unit}${visit}${datePart}`.trim();
  }

  const label =
    rec.testCode ||
    rec.testName ||
    rec.rawValueStr ||
    Object.entries(rec.values)
      .filter(([k]) => !['USUBJID', 'SITEID', 'cut_available', 'corrected_at_cut'].includes(k))
      .slice(0, 2)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  return `${rec.domain} ${rec.usubjid} #${rec.seq}: ${label}${datePart}`.trim();
}

export function toRecordRef(rec: DomainRecord): RecordRef {
  return {
    domain: rec.domain,
    usubjid: rec.usubjid,
    seq: rec.seq,
  };
}

/**
 * Evaluate all deterministic clinical and compliance detectors for a single subject
 * at a given cut under the active ProtocolRules.
 */
export function evaluateSubjectDetectors(
  usubjid: string,
  subjectRecords: DomainRecord[],
  rules: ProtocolRules,
  cut: number,
  untrustedSiteTests: Set<string>,
  quarantinedSites: Set<string>,
  duplicatePair?: { primary: string; duplicate: string; matchKey: string; refs: RecordRef[] },
  resolveRecord?: (ref: RecordRef) => DomainRecord | undefined
): Finding[] {
  const findings: Finding[] = [];
  if (subjectRecords.length === 0) return findings;

  const dmRec = subjectRecords.find((r) => r.domain === 'DM');
  const site = dmRec?.site || subjectRecords[0]?.site || 'UNKNOWN';

  // Filter out untrusted laboratory site x test records from clinical safety screens
  const lbRecords = subjectRecords.filter((r) => {
    if (r.domain !== 'LB') return false;
    const test = (r.testCode || r.values.LBTESTCD || '').toUpperCase();
    if (untrustedSiteTests.has(`${r.site}|${test}`)) {
      return false;
    }
    return true;
  });

  const aeRecords = subjectRecords.filter((r) => r.domain === 'AE');
  const exRecords = subjectRecords
    .filter((r) => r.domain === 'EX')
    .sort((a, b) => (a.epochDays ?? 0) - (b.epochDays ?? 0));
  const cmRecords = subjectRecords.filter((r) => r.domain === 'CM');
  const mhRecords = subjectRecords.filter((r) => r.domain === 'MH');

  const firstEx = exRecords.find((ex) => (ex.numericValue ?? 1) > 0) || exRecords[0];
  const firstDoseEpoch = firstEx?.epochDays ?? null;

  // -------------------------------------------------------------------------
  // 1. DUPLICATE SUBJECT DETECTOR
  // -------------------------------------------------------------------------
  if (duplicatePair && duplicatePair.duplicate === usubjid) {
    const refs = duplicatePair.refs;
    const evLines = refs.map((ref) => {
      const rec = resolveRecord ? resolveRecord(ref) : subjectRecords.find((r) => r.domain === ref.domain && r.seq === ref.seq);
      return rec ? formatRecordEvidenceLine(rec) : `${ref.domain} ${ref.usubjid} #${ref.seq}`;
    });
    findings.push({
      id: `F-${cut}-DUP-${usubjid}`,
      code: 'DUPLICATE_SUBJECT',
      subject: usubjid,
      site,
      cut,
      severity: 'critical',
      category: 'data_integrity',
      rationale: `Subject ${usubjid} matches already-enrolled subject ${duplicatePair.primary} on initials, birth date, and sex (${duplicatePair.matchKey}). Counted once in study denominators.`,
      plainRationale: `Duplicate enrollment detected: ${usubjid} has the exact same initials, birth date, and sex as ${duplicatePair.primary}.`,
      evidence: refs,
      evidence_lines: evLines,
      protocolVersion: rules.version,
    });
  }

  // -------------------------------------------------------------------------
  // 2. POTENTIAL HY'S LAW & BASELINE LIVER CANDIDATE DETECTOR
  // -------------------------------------------------------------------------
  const isScreeningRecord = (r: DomainRecord) => {
    const v = (r.visit || r.values.VISIT || '').toUpperCase();
    if (v.includes('SCREEN') || v.includes('BASE') || v === 'DAY -7' || v === 'VISIT 1') {
      return true;
    }
    if (firstDoseEpoch !== null && r.epochDays !== null && r.epochDays !== undefined) {
      return r.epochDays < firstDoseEpoch;
    }
    return false;
  };

  const screeningTransaminases = lbRecords.filter(
    (r) =>
      ['ALT', 'AST'].includes((r.testCode || '').toUpperCase()) &&
      isScreeningRecord(r) &&
      !r.censored &&
      !r.notDone &&
      r.canonicalValue !== undefined &&
      r.refHigh &&
      r.refHigh > 0
  );

  const highScreeningRec = screeningTransaminases.find(
    (r) => (r.canonicalValue! / r.refHigh!) > rules.exclusionCriteria.maxScreeningAltUln
  );

  const postBaselineTransaminases = lbRecords.filter(
    (r) =>
      ['ALT', 'AST'].includes((r.testCode || '').toUpperCase()) &&
      !isScreeningRecord(r) &&
      !r.censored &&
      !r.notDone &&
      r.canonicalValue !== undefined &&
      r.refHigh &&
      r.refHigh > 0
  );

  const elevatedTrans = postBaselineTransaminases.filter((r) => {
    const mult =
      (r.testCode || '').toUpperCase() === 'ALT'
        ? rules.hysLawAltMultiplier
        : rules.hysLawAstMultiplier;
    return r.canonicalValue! / r.refHigh! > mult;
  });

  const elevatedBili = lbRecords.filter(
    (r) =>
      ['BILI', 'TBILI'].includes((r.testCode || '').toUpperCase()) &&
      !r.censored &&
      !r.notDone &&
      r.canonicalValue !== undefined &&
      r.refHigh &&
      r.refHigh > 0 &&
      r.canonicalValue! / r.refHigh! > rules.hysLawBiliMultiplier
  );

  if (elevatedTrans.length > 0 && elevatedBili.length > 0) {
    // Find pair within rules.hysLawWindowDays
    let matchedPair: { trans: DomainRecord; bili: DomainRecord; daysApart: number } | null = null;
    for (const tr of elevatedTrans) {
      for (const bi of elevatedBili) {
        const daysApart =
          tr.epochDays !== null &&
          tr.epochDays !== undefined &&
          bi.epochDays !== null &&
          bi.epochDays !== undefined
            ? Math.abs(tr.epochDays - bi.epochDays)
            : 0;
        if (daysApart <= rules.hysLawWindowDays) {
          matchedPair = { trans: tr, bili: bi, daysApart };
          break;
        }
      }
      if (matchedPair) break;
    }

    if (matchedPair) {
      const { trans, bili, daysApart } = matchedPair;
      const transRatio = (trans.canonicalValue! / trans.refHigh!).toFixed(1);
      const biliRatio = (bili.canonicalValue! / bili.refHigh!).toFixed(1);

      // Check ALP for cholestasis (>2x ULN)
      const concomitantAlp = lbRecords.find(
        (r) =>
          ['ALP', 'ALKP'].includes((r.testCode || '').toUpperCase()) &&
          r.canonicalValue !== undefined &&
          r.refHigh &&
          r.refHigh > 0 &&
          r.canonicalValue / r.refHigh > rules.hysLawAlpMaxMultiplier
      );

      if (highScreeningRec) {
        // Liver candidate whose screening value was already high -> monitor-only with reason stated
        const screenRatio = (highScreeningRec.canonicalValue! / highScreeningRec.refHigh!).toFixed(1);
        const evRecords = [highScreeningRec, trans, bili];
        findings.push({
          id: `F-${cut}-BASELIVER-${usubjid}`,
          code: 'BASELINE_LIVER_ELEVATION',
          subject: usubjid,
          site,
          cut,
          severity: 'review',
          category: 'clinical',
          monitorOnly: true,
          rationale: `Monitor-only liver elevation: ${trans.testCode} reached ${transRatio}x ULN and Bilirubin reached ${biliRatio}x ULN (${daysApart}d apart), but screening ${highScreeningRec.testCode} was already elevated at ${screenRatio}x ULN prior to dosing.`,
          plainRationale: `Pre-existing liver elevation (Monitor Only): Liver enzymes are high, but screening ${highScreeningRec.testCode} was already ${screenRatio}x normal before treatment started.`,
          evidence: evRecords.map(toRecordRef),
          evidence_lines: evRecords.map(formatRecordEvidenceLine),
          protocolVersion: rules.version,
        });
      } else if (!concomitantAlp && !quarantinedSites.has(site)) {
        const evRecords = [trans, bili];
        findings.push({
          id: `F-${cut}-HYS-${usubjid}`,
          code: 'HYS_LAW_CANDIDATE',
          subject: usubjid,
          site,
          cut,
          severity: 'critical',
          category: 'clinical',
          rationale: `Potential Hy's Law met: ${trans.testCode} = ${trans.canonicalValue} ${trans.canonicalUnit} (${transRatio}x ULN, threshold >${rules.hysLawAltMultiplier}x) and Total Bilirubin = ${bili.canonicalValue} ${bili.canonicalUnit} (${biliRatio}x ULN, threshold >${rules.hysLawBiliMultiplier}x) within ${daysApart} days (window ≤${rules.hysLawWindowDays}d), without cholestatic ALP elevation.`,
          plainRationale: `Possible drug-induced liver injury (Hy's Law): ${trans.testCode} rose to ${transRatio}x upper normal alongside Bilirubin at ${biliRatio}x upper normal within ${daysApart} days.`,
          evidence: evRecords.map(toRecordRef),
          evidence_lines: evRecords.map(formatRecordEvidenceLine),
          protocolVersion: rules.version,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. MIS-CODED SERIOUS AE (AESHOSP = Y overrides AESER = N)
  // -------------------------------------------------------------------------
  if (rules.hospOverridesSerious) {
    for (const ae of aeRecords) {
      const aeshosp = (ae.values.AESHOSP || '').toUpperCase();
      const aeser = (ae.values.AESER || '').toUpperCase();
      if (aeshosp === 'Y' && aeser === 'N') {
        const term = ae.values.AETERM || ae.values.AEDECOD || 'Adverse Event';
        findings.push({
          id: `F-${cut}-AESHOSP-${usubjid}-${ae.seq}`,
          code: 'AESHOSP_OVERRIDE',
          subject: usubjid,
          site,
          cut,
          severity: 'critical',
          category: 'clinical',
          rationale: `Mis-coded serious AE on ${usubjid} (AE #${ae.seq} "${term}"): AESHOSP=Y (hospitalisation required/prolonged) overrides AESER=N per ICH E2A and Protocol ${rules.version}.`,
          plainRationale: `Hospitalization miscoded as non-serious: "${term}" required hospitalization (AESHOSP=Y) and must be classified and escalated as a Serious Adverse Event.`,
          evidence: [toRecordRef(ae)],
          evidence_lines: [formatRecordEvidenceLine(ae)],
          protocolVersion: rules.version,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. DOSING ERROR & MISSING EXPOSURE
  // -------------------------------------------------------------------------
  const assignedArm = (dmRec?.values.ACTARM || dmRec?.values.ARM || '').trim().toUpperCase();
  const armRule =
    rules.dosingByArm[assignedArm] ||
    Object.entries(rules.dosingByArm).find(
      ([k]) => assignedArm.includes(k) || k.includes(assignedArm)
    )?.[1];

  if (exRecords.length === 0) {
    // Check if subject has post-screening clinical records proving active study participation without EX
    const postScreenRec = [...aeRecords, ...lbRecords].find((r) => !isScreeningRecord(r));
    if (postScreenRec && dmRec) {
      findings.push({
        id: `F-${cut}-MISSEX-${usubjid}`,
        code: 'DOSING_ERROR',
        subject: usubjid,
        site,
        cut,
        severity: 'review',
        category: 'compliance',
        rationale: `Missing exposure record: Subject ${usubjid} (${assignedArm || 'Enrolled'}) has post-baseline clinical assessments (${postScreenRec.domain} #${postScreenRec.seq}) with zero EX exposure records logged.`,
        plainRationale: `Missing medication dosing record: Patient has follow-up study visits recorded, but no drug administration (EX) row is present.`,
        evidence: [toRecordRef(postScreenRec)],
        evidence_lines: [formatRecordEvidenceLine(postScreenRec)],
        protocolVersion: rules.version,
      });
    }
  } else if (armRule) {
    for (const ex of exRecords) {
      if (ex.numericValue !== undefined && ex.numericValue !== armRule.dose) {
        const isHighOverdose = armRule.dose > 0 && ex.numericValue >= armRule.dose * 1.5;
        findings.push({
          id: `F-${cut}-DOSE-${usubjid}-${ex.seq}`,
          code: 'DOSING_ERROR',
          subject: usubjid,
          site,
          cut,
          severity: isHighOverdose ? 'critical' : 'review',
          category: 'compliance',
          rationale: `Dosing error on ${usubjid} (EX #${ex.seq}): administered ${ex.numericValue} ${ex.unit || armRule.unit}, whereas assigned arm "${assignedArm}" specifies ${armRule.dose} ${armRule.unit} under Protocol ${rules.version}.`,
          plainRationale: `Incorrect dose administered: Patient received ${ex.numericValue} ${ex.unit || armRule.unit} instead of the protocol-specified ${armRule.dose} ${armRule.unit} for ${assignedArm}.`,
          evidence: [toRecordRef(ex)],
          evidence_lines: [formatRecordEvidenceLine(ex)],
          protocolVersion: rules.version,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. AE BEFORE FIRST DOSE
  // -------------------------------------------------------------------------
  if (firstEx && firstDoseEpoch !== null) {
    for (const ae of aeRecords) {
      if (ae.epochDays !== null && ae.epochDays !== undefined && ae.epochDays < firstDoseEpoch) {
        const term = ae.values.AETERM || ae.values.AEDECOD || 'Adverse Event';
        const evRecords = [ae, firstEx];
        findings.push({
          id: `F-${cut}-PREAE-${usubjid}-${ae.seq}`,
          code: 'AE_BEFORE_FIRST_DOSE',
          subject: usubjid,
          site,
          cut,
          severity: 'review',
          category: 'compliance',
          rationale: `Pre-treatment AE on ${usubjid}: AE #${ae.seq} ("${term}") started on ${ae.dateStr}, prior to first study drug exposure on ${firstEx.dateStr} (EX #${firstEx.seq}). Must not be counted as treatment-emergent.`,
          plainRationale: `Symptom occurred before first dose: "${term}" (${ae.dateStr}) happened before the first medication dose (${firstEx.dateStr}).`,
          evidence: evRecords.map(toRecordRef),
          evidence_lines: evRecords.map(formatRecordEvidenceLine),
          protocolVersion: rules.version,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. PROHIBITED MEDICATION
  // -------------------------------------------------------------------------
  if (rules.prohibitedMeds.length > 0) {
    for (const cm of cmRecords) {
      const medName = (cm.values.CMTRT || cm.values.CMDECOD || cm.testName || '')
        .trim()
        .toUpperCase();
      const matchedProhib = rules.prohibitedMeds.find(
        (pm) => medName.includes(pm) || pm.includes(medName)
      );
      if (matchedProhib && medName.length > 0) {
        findings.push({
          id: `F-${cut}-PROHIB-${usubjid}-${cm.seq}`,
          code: 'PROHIBITED_MEDICATION',
          subject: usubjid,
          site,
          cut,
          severity: 'critical',
          category: 'compliance',
          rationale: `Prohibited concomitant medication on ${usubjid}: CM #${cm.seq} records "${medName}" on ${cm.dateStr || 'study period'}, which is prohibited under Protocol ${rules.version} (${matchedProhib}).`,
          plainRationale: `Restricted medication taken: Patient took "${medName}", which is prohibited by Protocol ${rules.version} due to drug-interaction risk.`,
          evidence: [toRecordRef(cm)],
          evidence_lines: [formatRecordEvidenceLine(cm)],
          protocolVersion: rules.version,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. VISIT WINDOW DEVIATION
  // -------------------------------------------------------------------------
  if (firstDoseEpoch !== null && Object.keys(rules.visitWindows).length > 0) {
    const seenVisitChecks = new Set<string>();
    for (const rec of subjectRecords) {
      if (!rec.visit || rec.epochDays === null || rec.epochDays === undefined) continue;
      const vUpper = rec.visit.trim().toUpperCase();
      if (seenVisitChecks.has(vUpper)) continue;

      const winRule = rules.visitWindows[vUpper];
      if (winRule) {
        seenVisitChecks.add(vUpper);
        const studyDay = rec.epochDays - firstDoseEpoch + 1;
        const minAllowed = winRule.targetDay - winRule.windowMinus;
        const maxAllowed = winRule.targetDay + winRule.windowPlus;
        if (studyDay < minAllowed || studyDay > maxAllowed) {
          const delta = studyDay < minAllowed ? studyDay - minAllowed : studyDay - maxAllowed;
          findings.push({
            id: `F-${cut}-VISWIN-${usubjid}-${rec.domain}-${rec.seq}`,
            code: 'VISIT_WINDOW_DEVIATION',
            subject: usubjid,
            site,
            cut,
            severity: 'review',
            category: 'compliance',
            rationale: `Visit window deviation on ${usubjid}: ${rec.visit} occurred on Study Day ${studyDay} (${rec.dateStr}), outside Protocol ${rules.version} window of Day ${winRule.targetDay} ± ${winRule.windowPlus}d (${delta > 0 ? `+${delta}` : delta} days out of window).`,
            plainRationale: `Off-schedule clinic visit: ${rec.visit} took place on Study Day ${studyDay}, outside the allowed Day ${minAllowed}–${maxAllowed} protocol window.`,
            evidence: [toRecordRef(rec)],
            evidence_lines: [formatRecordEvidenceLine(rec)],
            protocolVersion: rules.version,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. ELIGIBILITY AND EXCLUSION AT SCREENING
  // -------------------------------------------------------------------------
  if (dmRec) {
    const age = Number(dmRec.values.AGE || 0);
    if (
      age > 0 &&
      (age < rules.exclusionCriteria.minAge || age > rules.exclusionCriteria.maxAge)
    ) {
      findings.push({
        id: `F-${cut}-ELIG-AGE-${usubjid}`,
        code: 'ELIGIBILITY_VIOLATION',
        subject: usubjid,
        site,
        cut,
        severity: 'review',
        category: 'compliance',
        rationale: `Eligibility violation on ${usubjid}: Age at enrollment is ${age} years (DM #${dmRec.seq}), outside Protocol ${rules.version} eligible range of ${rules.exclusionCriteria.minAge}–${rules.exclusionCriteria.maxAge} years.`,
        plainRationale: `Enrollment age outside protocol limits: Patient age (${age}) is outside the ${rules.exclusionCriteria.minAge}–${rules.exclusionCriteria.maxAge} year eligibility criteria in Protocol ${rules.version}.`,
        evidence: [toRecordRef(dmRec)],
        evidence_lines: [formatRecordEvidenceLine(dmRec)],
        protocolVersion: rules.version,
      });
    }
  }

  if (highScreeningRec) {
    const ratio = (highScreeningRec.canonicalValue! / highScreeningRec.refHigh!).toFixed(2);
    findings.push({
      id: `F-${cut}-ELIG-LAB-${usubjid}-${highScreeningRec.seq}`,
      code: 'ELIGIBILITY_VIOLATION',
      subject: usubjid,
      site,
      cut,
      severity: 'review',
      category: 'compliance',
      rationale: `Screening exclusion violation on ${usubjid}: Screening ${highScreeningRec.testCode} was ${highScreeningRec.canonicalValue} ${highScreeningRec.canonicalUnit} (${ratio}x ULN), exceeding Protocol ${rules.version} exclusion limit of >${rules.exclusionCriteria.maxScreeningAltUln}x ULN.`,
      plainRationale: `Screening lab exclusion: Baseline ${highScreeningRec.testCode} (${ratio}x normal) exceeded the Protocol ${rules.version} limit (${rules.exclusionCriteria.maxScreeningAltUln}x normal).`,
      evidence: [toRecordRef(highScreeningRec)],
      evidence_lines: [formatRecordEvidenceLine(highScreeningRec)],
      protocolVersion: rules.version,
    });
  }

  if (rules.exclusionCriteria.excludedConditions.length > 0) {
    for (const mh of mhRecords) {
      const cond = (mh.values.MHTERM || mh.values.MHDECOD || '').toUpperCase();
      const matchedExcl = rules.exclusionCriteria.excludedConditions.find(
        (ec) => cond.includes(ec) || ec.includes(cond)
      );
      if (matchedExcl && cond.length > 0) {
        findings.push({
          id: `F-${cut}-ELIG-MH-${usubjid}-${mh.seq}`,
          code: 'ELIGIBILITY_VIOLATION',
          subject: usubjid,
          site,
          cut,
          severity: 'review',
          category: 'compliance',
          rationale: `Medical history exclusion on ${usubjid}: MH #${mh.seq} documents "${cond}", which matches exclusion criterion "${matchedExcl}" in Protocol ${rules.version}.`,
          plainRationale: `Excluded medical history condition: Patient has documented history of "${cond}" (MH #${mh.seq}).`,
          evidence: [toRecordRef(mh)],
          evidence_lines: [formatRecordEvidenceLine(mh)],
          protocolVersion: rules.version,
        });
      }
    }
  }

  return findings;
}
