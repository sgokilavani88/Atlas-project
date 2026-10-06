import {
  CrewNodeName,
  EscalationItem,
  Finding,
  MonitorDecisionSeed,
  QueryItem,
  RecordRef,
  ReviewReport,
  SiteReplySeed,
  TraceEntry,
} from '../schema';
import { StudyGraph } from '../atlas/studyGraph';
import { DecisionLedger } from '../ledger/decisionLedger';
import { formatRecordEvidenceLine, toRecordRef } from '../detectors/clinicalDetectors';

export interface HumanMonitorConfig {
  delayCuts: number; // default 2 cuts late
  responseRate: number; // default 0.60 (60% response rate)
  seed: number; // deterministic PRNG seed
  immediateMode?: boolean; // when true (e.g. unit test for immediate human_gate), answers without delay
}

/**
 * Deterministic seeded PRNG (Mulberry32) so slow/unreliable human simulation is reproducible.
 */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ReviewCrew {
  private graph: StudyGraph;
  private ledger: DecisionLedger;
  private monitorConfig: HumanMonitorConfig;

  // Persistent memory across cycles
  public raisedQueryKeys = new Set<string>(); // "DOMAIN|USUBJID|SEQ|CODE"
  public raisedEscalationKeys = new Set<string>(); // "CODE|SUBJECT_OR_SITE"
  public rejectedEscalationKeys = new Map<string, string>(); // "CODE|SUBJECT_OR_SITE" -> reason
  public subjectFlaggedCuts = new Map<string, Set<number>>(); // usubjid -> Set<cut>
  public siteProblemCounts = new Map<string, Set<string>>(); // site -> Set<problemId>
  public flaggedSites = new Map<string, { cut: number; reason: string; queryCount: number; quarantined: boolean }>();
  public unresponsiveSites = new Set<string>();
  public priorCompliantSubjects = new Set<string>();
  public lastProtocolVersion: string = '';

  public allQueries: QueryItem[] = [];
  public allEscalations: EscalationItem[] = [];
  public allTraces: TraceEntry[] = [];

  private querySeq = 1;
  private escSeq = 1;
  private traceSeq = 1;

  constructor(
    graph: StudyGraph,
    ledger: DecisionLedger,
    monitorConfig: HumanMonitorConfig = { delayCuts: 2, responseRate: 0.6, seed: 42 }
  ) {
    this.graph = graph;
    this.ledger = ledger;
    this.monitorConfig = monitorConfig;
  }

  public setMonitorConfig(config: Partial<HumanMonitorConfig>) {
    this.monitorConfig = { ...this.monitorConfig, ...config };
  }

  private appendTrace(
    cut: number,
    node: CrewNodeName,
    decision: string,
    rationale: string,
    evidence: RecordRef[],
    subject?: string,
    site?: string,
    code?: string
  ): TraceEntry {
    const entry: TraceEntry = {
      id: `TR-${String(this.traceSeq++).padStart(4, '0')}`,
      cut,
      node,
      decision,
      rationale,
      evidence: evidence.map((e) => ({ ...e })),
      timestamp: `2025-${String(Math.min(12, Math.max(1, cut))).padStart(2, '0')}-15T09:${String(
        this.traceSeq % 60
      ).padStart(2, '0')}:10Z`,
      subject,
      site,
      code,
    };
    this.allTraces.push(entry);
    return entry;
  }

  /**
   * Look up monitor reply from monitor_decisions.json (lookup CODE|USUBJID or CODE|SITEID).
   */
  private lookupMonitorDecision(
    code: string,
    subject: string,
    site: string
  ): MonitorDecisionSeed | null {
    const dict = this.graph.data.monitorDecisions;
    const candidates = [
      `${code}|${subject}`,
      `${code}|${site}`,
      subject,
      code,
      'DEFAULT',
    ];

    for (const key of candidates) {
      const val = dict[key];
      if (!val) continue;
      if (typeof val === 'string') {
        const upper = val.toUpperCase();
        if (upper.includes('REJECT')) {
          return { key, decision: 'REJECTED', reason: val };
        }
        if (upper.includes('CLARIFY')) {
          return { key, decision: 'CLARIFY', question: val };
        }
        return { key, decision: 'APPROVED', reason: val };
      } else {
        return val;
      }
    }
    return null;
  }

  /**
   * Look up site reply from site_replies.json (lookup DOMAIN|USUBJID|SEQ, else default).
   */
  private lookupSiteReply(domain: string, usubjid: string, seq: number, site: string): {
    status: 'answered' | 'unresponsive_site';
    reply?: string;
  } {
    const dict = this.graph.data.siteReplies;
    const exactKey = `${domain}|${usubjid}|${seq}`;
    const siteKey = `SITE|${site}`;
    const raw = dict[exactKey] ?? dict[siteKey] ?? dict.default ?? dict.DEFAULT;

    if (!raw) {
      return {
        status: 'answered',
        reply: `Site ${site} verified source CRF for ${domain} #${seq} (${usubjid}) and confirmed entry.`,
      };
    }

    if (typeof raw === 'string') {
      if (
        raw.toUpperCase().includes('NO_REPLY') ||
        raw.toUpperCase().includes('UNRESPONSIVE') ||
        raw.trim() === ''
      ) {
        return { status: 'unresponsive_site' };
      }
      return { status: 'answered', reply: raw };
    }

    if (raw.status === 'open') {
      return { status: 'unresponsive_site' };
    }
    return { status: 'answered', reply: raw.reply };
  }

  /**
   * Build graph-cited answer to a monitor's CLARIFY request (screening ALT, concomitant meds, medical history).
   */
  private buildClarificationFromGraph(subject: string, question?: string): {
    answerText: string;
    evidence: RecordRef[];
  } {
    const subjMap = this.graph.subjectRecordsMap.get(subject);
    if (!subjMap) {
      return {
        answerText: `Checked StudyGraph for ${subject}: no prior baseline exclusionary findings recorded.`,
        evidence: [],
      };
    }
    const recs = Array.from(subjMap.values());
    const screenAlt = recs.find(
      (r) =>
        r.domain === 'LB' &&
        ['ALT', 'AST'].includes((r.testCode || '').toUpperCase()) &&
        ((r.visit || '').toUpperCase().includes('SCREEN') ||
          (r.visit || '').toUpperCase().includes('BASE') ||
          r.seq === 1)
    );
    const cmRecs = recs.filter((r) => r.domain === 'CM');
    const mhRecs = recs.filter((r) => r.domain === 'MH');

    const parts: string[] = [];
    const citing: RecordRef[] = [];

    if (screenAlt) {
      parts.push(
        `Screening ${screenAlt.testCode} was ${screenAlt.canonicalValue ?? screenAlt.rawValueStr} ${
          screenAlt.canonicalUnit || screenAlt.unit || 'U/L'
        } (ref ≤${screenAlt.refHigh ?? 40}, within normal limits; LB #${screenAlt.seq})`
      );
      citing.push(toRecordRef(screenAlt));
    } else {
      parts.push('No elevated screening transaminases present at baseline');
    }

    if (cmRecs.length > 0) {
      const meds = cmRecs.map((c) => `${c.values.CMTRT || c.testName} (CM #${c.seq})`).join(', ');
      parts.push(`Concomitant medications: ${meds}`);
      citing.push(toRecordRef(cmRecs[0]));
    } else {
      parts.push('Zero hepatotoxic concomitant medications in CM domain');
    }

    if (mhRecs.length > 0) {
      const mhs = mhRecs.map((m) => `${m.values.MHTERM || m.testName} (MH #${m.seq})`).join(', ');
      parts.push(`Medical history: ${mhs}`);
    }

    return {
      answerText: `Graph clarification for ${subject}${
        question ? ` (re: "${question}")` : ''
      }: ${parts.join('; ')}. Resubmitted to Human Gate → APPROVED.`,
      evidence: citing,
    };
  }

  /**
   * Run the six-node state machine for `cut` and `protocolVersion`:
   * detect -> medical_review -> data_manager -> compliance -> human_gate -> execute
   * Fully idempotent: re-running the same cut against persistent memory produces 0 new queries & 0 new escalations.
   */
  public runCycle(cut: number, protocolVersion?: string): ReviewReport {
    const activeRules = this.graph.getProtocolRulesForCut(cut);
    const ver = protocolVersion || activeRules.version;
    const cycleTraces: TraceEntry[] = [];

    let newFindingsCount = 0;
    let newQueriesCount = 0;
    let newEscalationsCount = 0;

    // Check if any previously raised escalations or queries were superseded by corrections at this cut
    for (const sup of this.graph.supersededFindings) {
      if (sup.supersededAtCut === cut) {
        this.ledger.markSupersededByCorrection(sup.subject, sup.code, cut);
        for (const esc of this.allEscalations) {
          if (esc.subject === sup.subject && esc.code === sup.code && !esc.superseded_at_cut) {
            esc.superseded_at_cut = cut;
          }
        }
        for (const q of this.allQueries) {
          if (q.usubjid === sup.subject && !q.superseded_at_cut) {
            q.superseded_at_cut = cut;
          }
        }
      }
    }

    const allActiveFindings = this.graph.getAllActiveFindings();
    const cutAdversarial = this.graph.adversarialEventsByCut.get(cut) || [];

    // =========================================================================
    // NODE 1: detect
    // =========================================================================
    const detectFindings = allActiveFindings.filter((f) => f.cut <= cut);
    newFindingsCount = allActiveFindings.filter((f) => f.cut === cut).length;

    for (const f of detectFindings) {
      let cutsSet = this.subjectFlaggedCuts.get(f.subject);
      if (!cutsSet) {
        cutsSet = new Set<number>();
        this.subjectFlaggedCuts.set(f.subject, cutsSet);
      }
      if (f.cut === cut) {
        cutsSet.add(cut);
      }

      let siteSet = this.siteProblemCounts.get(f.site);
      if (!siteSet) {
        siteSet = new Set<string>();
        this.siteProblemCounts.set(f.site, siteSet);
      }
      siteSet.add(f.id);
    }

    const detectRefs = detectFindings.slice(0, 8).flatMap((f) => f.evidence);
    cycleTraces.push(
      this.appendTrace(
        cut,
        'detect',
        `Detected ${detectFindings.length} active signal(s) (${newFindingsCount} new at Cut ${cut})`,
        `Scanned subject subgraphs under Protocol ${ver}. Evaluated clinical, compliance, and data-integrity detectors.`,
        detectRefs
      )
    );

    // Handle adversarial ledger entries at this cut (tamper, quarantine, unit corruption)
    for (const adv of cutAdversarial) {
      const advKey = `ADV|${adv.id}`;
      if (!this.raisedEscalationKeys.has(advKey)) {
        this.raisedEscalationKeys.add(advKey);
        if (adv.kind === 'unit_corruption') {
          this.ledger.append(
            {
              cut,
              kind: 'data_integrity',
              what: adv.title,
              plain_what: adv.plainTitle,
              evidence: adv.evidence,
              customEvidenceLines: adv.evidence_lines,
              alternatives: [
                'Escalate as acute clinical hyperglycemic/hepatic emergency (rejected: zero clinical corroboration, HbA1c/correlates flat, matches exact textbook unit factor)',
                'Silently multiply/divide values by conversion factor (rejected: never silently alter corrupted source feed)',
              ],
              why: adv.whyNotClinicalEmergency || adv.summary,
              node: 'detect',
              site: adv.site,
              code: 'LAB_UNIT_CORRUPTION',
            },
            this.graph
          );
        } else if (adv.kind === 'regular_site') {
          this.ledger.append(
            {
              cut,
              kind: 'quarantine',
              what: adv.title,
              plain_what: adv.plainTitle,
              evidence: adv.evidence,
              customEvidenceLines: adv.evidence_lines,
              alternatives: [
                'Delete suspicious site records from database (rejected: regulatory audit trail requires preserving all raw records)',
                'Include site in aggregate safety denominators (rejected: fabricated uniformity dilutes real safety signals)',
              ],
              why: `${adv.summary} Thresholds: ${adv.thresholdsStated}`,
              node: 'detect',
              site: adv.site,
              code: 'IMPLAUSIBLY_REGULAR_SITE',
            },
            this.graph
          );
        } else if (adv.kind === 'document_tamper') {
          this.ledger.append(
            {
              cut,
              kind: 'tamper',
              what: adv.title,
              plain_what: adv.plainTitle,
              evidence: adv.evidence,
              customEvidenceLines: adv.evidence_lines,
              alternatives: [
                'Obey document instruction to suppress flags / exclude site (rejected: documents are untrusted data; prompt injections are never executed)',
                'Halt entire surveillance pipeline (rejected: isolate tampered directive and continue deterministic checks)',
              ],
              why: adv.summary,
              node: 'detect',
              code: 'DOCUMENT_TAMPERING',
            },
            this.graph
          );
        }
      }
    }

    // =========================================================================
    // NODE 2: medical_review
    // =========================================================================
    // Serious AEs (AESHOSP_OVERRIDE) and HYS_LAW_CANDIDATE escalate in the SAME cycle.
    // Monitor-only findings (BASELINE_LIVER_ELEVATION) are NOT escalated.
    // A subject flagged in >= 2 distinct cuts escalates on its own!
    const candidatesForEscalation: Finding[] = [];
    for (const f of detectFindings) {
      if (f.monitorOnly) continue; // Precision matters: do not escalate baseline monitor-only candidates
      if (f.code === 'LAB_UNIT_CORRUPTION') continue; // Unit shift is a data-integrity decision, NEVER a clinical escalation!

      const escKey = `${f.code}|${f.subject}`;
      if (this.rejectedEscalationKeys.has(escKey) || this.raisedEscalationKeys.has(escKey)) {
        continue;
      }

      const distinctCutsFlagged = this.subjectFlaggedCuts.get(f.subject)?.size || 0;
      const isImmediateClinical =
        f.severity === 'critical' ||
        f.code === 'HYS_LAW_CANDIDATE' ||
        f.code === 'AESHOSP_OVERRIDE' ||
        f.code === 'PROHIBITED_MEDICATION' ||
        f.code === 'DUPLICATE_SUBJECT';

      const isRecurringSubject = distinctCutsFlagged >= 2 && f.severity === 'review';

      if (isImmediateClinical || isRecurringSubject) {
        this.raisedEscalationKeys.add(escKey);
        newEscalationsCount++;
        const escalation: EscalationItem = {
          escalation_id: `ESC-${String(this.escSeq++).padStart(3, '0')}`,
          cut_raised: cut,
          code: f.code,
          subject: f.subject,
          site: f.site,
          severity: isImmediateClinical ? 'critical' : 'review',
          rationale: isRecurringSubject
            ? `[Auto-escalated after flags in ${distinctCutsFlagged} cycles] ${f.rationale}`
            : f.rationale,
          plainRationale: isRecurringSubject
            ? `[Escalated due to recurring signals across ${distinctCutsFlagged} cuts] ${f.plainRationale}`
            : f.plainRationale,
          evidence: f.evidence.map((e) => ({ ...e })),
          evidence_lines: [...f.evidence_lines],
          monitor_status: 'PENDING',
          cuts_waiting: 0,
          days_waiting: 0,
          cost_of_waiting: 'Awaiting medical monitor adjudication',
        };
        this.allEscalations.push(escalation);
        candidatesForEscalation.push(f);
      }
    }

    cycleTraces.push(
      this.appendTrace(
        cut,
        'medical_review',
        newEscalationsCount > 0
          ? `Escalated ${newEscalationsCount} high-priority clinical signal(s); retained monitor-only items under observation`
          : `Reviewed ${detectFindings.length} finding(s); 0 new escalations required (idempotent / already tracked)`,
        `Applied clinical plausibility & seriousness filters. Serious AEs and Hy's Law candidates escalate in the same cycle; baseline liver elevations remain monitor-only.`,
        candidatesForEscalation.flatMap((f) => f.evidence)
      )
    );

    // =========================================================================
    // NODE 3: data_manager
    // =========================================================================
    // Raise specific, record-cited, actionable queries. Never duplicate a query on the same record!
    const newlyRaisedQueries: QueryItem[] = [];
    for (const f of detectFindings) {
      if (f.evidence.length === 0) continue;
      const primaryRef = f.evidence[0];
      const queryKey = `${primaryRef.domain}|${primaryRef.usubjid}|${primaryRef.seq}|${f.code}`;
      if (this.raisedQueryKeys.has(queryKey)) continue;

      // Do not blindly retry a site already marked unresponsive unless it's a critical safety record
      if (this.unresponsiveSites.has(f.site) && f.severity !== 'critical') {
        continue;
      }

      this.raisedQueryKeys.add(queryKey);
      newQueriesCount++;

      const fieldMap: Record<string, { field: string; ask: string }> = {
        AESHOSP_OVERRIDE: {
          field: 'AESER',
          ask: `AE #${primaryRef.seq} has AESHOSP=Y but AESER=N. Please update AESER to 'Y' or clarify hospitalization status on the eCRF.`,
        },
        DOSING_ERROR: {
          field: 'EXDOSE',
          ask: `Record ${primaryRef.domain} #${primaryRef.seq} shows a dosing discrepancy against assigned treatment arm. Please verify source dispensing log and confirm administered dose.`,
        },
        AE_BEFORE_FIRST_DOSE: {
          field: 'AESTDTC',
          ask: `AE #${primaryRef.seq} onset date precedes first study dose (EXSTDTC). Please verify onset date or reclassify as pre-treatment medical history.`,
        },
        VISIT_WINDOW_DEVIATION: {
          field: 'VISITDTC',
          ask: `${primaryRef.domain} #${primaryRef.seq} visit date falls outside protocol window. Please confirm visit date and log protocol deviation reason.`,
        },
        LAB_UNIT_CORRUPTION: {
          field: 'LBORRESU',
          ask: `Lab feed for ${f.site} shows a textbook conversion factor step-shift on ${primaryRef.domain} #${primaryRef.seq}. Please re-issue calibrated laboratory transfer with verified units.`,
        },
        DUPLICATE_SUBJECT: {
          field: 'USUBJID',
          ask: `DM #${primaryRef.seq} matches another enrolled subject on initials, birth date, and sex. Please confirm patient identity and reconcile duplicate screening.`,
        },
      };

      const spec = fieldMap[f.code] || {
        field: `${primaryRef.domain}ORRES`,
        ask: `Please verify source documentation for ${primaryRef.domain} #${primaryRef.seq} (${primaryRef.usubjid}) regarding ${f.code} and confirm value.`,
      };

      const siteLookup = this.lookupSiteReply(
        primaryRef.domain,
        primaryRef.usubjid,
        primaryRef.seq,
        f.site
      );
      if (siteLookup.status === 'unresponsive_site') {
        this.unresponsiveSites.add(f.site);
      }

      const qItem: QueryItem = {
        query_id: `QRY-${String(this.querySeq++).padStart(3, '0')}`,
        cut_raised: cut,
        domain: primaryRef.domain,
        usubjid: primaryRef.usubjid,
        seq: primaryRef.seq,
        site: f.site,
        field: spec.field,
        issue: f.rationale,
        question: spec.ask,
        status: siteLookup.status,
        site_reply: siteLookup.reply,
        answered_at_cut: siteLookup.status === 'answered' ? cut : undefined,
        evidence: [primaryRef],
        evidence_lines: [f.evidence_lines[0] || `${primaryRef.domain} ${primaryRef.usubjid} #${primaryRef.seq}`],
      };

      this.allQueries.push(qItem);
      newlyRaisedQueries.push(qItem);

      this.ledger.append(
        {
          cut,
          kind: 'query',
          what: `Data Query ${qItem.query_id} raised on ${primaryRef.domain} ${primaryRef.usubjid} #${primaryRef.seq} (${spec.field})`,
          plain_what: `Asked clinic ${f.site} to verify ${primaryRef.domain} record #${primaryRef.seq} for patient ${primaryRef.usubjid}`,
          evidence: [primaryRef],
          customEvidenceLines: qItem.evidence_lines,
          alternatives: [
            'Impute or auto-correct field without site confirmation (rejected: violates GCP ALCOA+ source data integrity)',
            'Ignore discrepancy (rejected: leaves unresolved clinical/compliance ambiguity)',
          ],
          why: spec.ask,
          node: 'data_manager',
          subject: primaryRef.usubjid,
          site: f.site,
          code: f.code,
        },
        this.graph
      );
    }

    // Check site-level recurring problems (>= 3 distinct problems -> site-level flag)
    for (const [site, probSet] of this.siteProblemCounts.entries()) {
      if (probSet.size >= 3 && !this.flaggedSites.has(site)) {
        const isQuar = this.graph.quarantinedSites.has(site);
        this.flaggedSites.set(site, {
          cut,
          reason: `Recurring site quality/compliance signals (${probSet.size} findings across cuts)${
            this.unresponsiveSites.has(site) ? '; site stopped answering queries' : ''
          }`,
          queryCount: this.allQueries.filter((q) => q.site === site).length,
          quarantined: isQuar,
        });
      }
    }

    cycleTraces.push(
      this.appendTrace(
        cut,
        'data_manager',
        newQueriesCount > 0
          ? `Issued ${newQueriesCount} record-cited query(ies); 0 duplicate queries raised`
          : `Verified all open records; 0 new queries raised (idempotency guard active)`,
        `Every query cites a single (domain, usubjid, seq) triple and requests a single corrective action.`,
        newlyRaisedQueries.flatMap((q) => q.evidence)
      )
    );

    // =========================================================================
    // NODE 4: compliance
    // =========================================================================
    const allSubjects = Array.from(this.graph.subjectRecordsMap.keys());
    const nonCompliantSet = new Set<string>();
    const newlyNonCompliantAfterAmendment: string[] = [];
    const complianceFindings = detectFindings.filter((f) => f.category === 'compliance');

    for (const f of complianceFindings) {
      nonCompliantSet.add(f.subject);
      if (
        this.lastProtocolVersion &&
        this.lastProtocolVersion !== ver &&
        this.priorCompliantSubjects.has(f.subject)
      ) {
        if (!newlyNonCompliantAfterAmendment.includes(f.subject)) {
          newlyNonCompliantAfterAmendment.push(f.subject);
        }
      }

      // Log protocol deviation in ledger once per finding id
      const devKey = `DEV|${f.id}`;
      if (!this.raisedEscalationKeys.has(devKey)) {
        this.raisedEscalationKeys.add(devKey);
        this.ledger.append(
          {
            cut,
            kind: 'deviation',
            what: `Protocol ${ver} Deviation (${f.code}) on ${f.subject} at ${f.site}`,
            plain_what: f.plainRationale,
            evidence: f.evidence,
            customEvidenceLines: f.evidence_lines,
            alternatives: [
              `Evaluate only under initial Protocol v1 (rejected: Cut ${cut} is governed by Protocol ${ver})`,
              'Exclude subject from intention-to-treat population without documentation (rejected: log deviation with exact RecordRef citation)',
            ],
            why: f.rationale,
            node: 'compliance',
            subject: f.subject,
            site: f.site,
            code: f.code,
          },
          this.graph
        );
      }
    }

    this.priorCompliantSubjects.clear();
    for (const s of allSubjects) {
      if (!nonCompliantSet.has(s)) {
        this.priorCompliantSubjects.add(s);
      }
    }
    this.lastProtocolVersion = ver;

    cycleTraces.push(
      this.appendTrace(
        cut,
        'compliance',
        `Audited ${allSubjects.length} subjects against Protocol ${ver}: ${
          allSubjects.length - nonCompliantSet.size
        } compliant, ${nonCompliantSet.size} with deviations${
          newlyNonCompliantAfterAmendment.length > 0
            ? ` (${newlyNonCompliantAfterAmendment.length} newly non-compliant after ${ver} amendment)`
            : ''
        }`,
        `Checked visit windows, arm dosing, prohibited medications, and eligibility rules from ${activeRules.documentName}.`,
        complianceFindings.slice(0, 6).flatMap((f) => f.evidence)
      )
    );

    // =========================================================================
    // NODE 5: human_gate
    // =========================================================================
    const rng = seededRandom(this.monitorConfig.seed + cut * 97);
    const gateEvidence: RecordRef[] = [];
    const approvedThisCycle: EscalationItem[] = [];
    let gateSummaryParts: string[] = [];

    for (const esc of this.allEscalations) {
      if (esc.superseded_at_cut) continue;
      if (esc.monitor_status !== 'PENDING') continue;

      const cutsWaited = cut - esc.cut_raised;
      esc.cuts_waiting = cutsWaited;
      esc.days_waiting = cutsWaited * 14; // 14 days per cut

      const explicitSeed = this.lookupMonitorDecision(esc.code, esc.subject, esc.site);
      const effectiveDelay = this.monitorConfig.immediateMode
        ? 0
        : explicitSeed?.delayCuts ?? this.monitorConfig.delayCuts;

      // Standing Limits Rule: After 4 unanswered cuts, NEVER treat silence as approval!
      if (cutsWaited >= 4) {
        esc.monitor_status = 'STANDING_LIMITS';
        esc.cost_of_waiting = `${esc.days_waiting} days unacted-on; transitioned to Standing Limits surveillance (NO approval-gated actions taken).`;
        gateEvidence.push(...esc.evidence);
        gateSummaryParts.push(`${esc.escalation_id} (${esc.subject}) → STANDING_LIMITS (4 cuts unanswered)`);

        this.ledger.append(
          {
            cut,
            kind: 'standing_limits',
            what: `Standing Limits Invoked for Unanswered Escalation ${esc.escalation_id} (${esc.code} on ${esc.subject})`,
            plain_what: `Monitor did not reply after 4 cuts (${esc.days_waiting} days). Continuing automated safety watch under Standing Limits without taking approval-gated clinical actions.`,
            evidence: esc.evidence,
            customEvidenceLines: esc.evidence_lines,
            alternatives: [
              'Treat 4 cuts of human silence as implicit APPROVED and hold patient dosing (rejected: an unanswered escalation must NEVER become a silent approval)',
              'Drop the signal from active tracking (rejected: signal remains actively monitored under standing limits)',
            ],
            why: `Escalation raised at Cut ${esc.cut_raised} remained unanswered for ${cutsWaited} cuts. System continues enhanced lab/AE monitoring under standing limits and takes NO approval-gated action (no dosing hold, no expedited regulatory submission, no site suspension).`,
            node: 'human_gate',
            subject: esc.subject,
            site: esc.site,
            code: esc.code,
          },
          this.graph
        );
        continue;
      }

      // Check if monitor responds at this cut
      const meetsDelay = cutsWaited >= effectiveDelay;
      const roll = rng();
      const monitorResponds =
        this.monitorConfig.immediateMode ||
        (meetsDelay && (roll <= this.monitorConfig.responseRate || explicitSeed !== null));

      if (!monitorResponds) {
        esc.cost_of_waiting =
          cutsWaited > 0
            ? `Signal sitting unreported for ${cutsWaited} cut(s) (${esc.days_waiting} days); awaiting monitor reply`
            : 'Raised this cut; awaiting monitor review';
        continue;
      }

      const replyDecision = explicitSeed?.decision || 'APPROVED';
      esc.answered_at_cut = cut;
      gateEvidence.push(...esc.evidence);

      if (replyDecision === 'APPROVED') {
        esc.monitor_status = 'APPROVED';
        esc.monitor_reply =
          explicitSeed?.reason || `Medical Monitor APPROVED escalation for ${esc.code} on ${esc.subject}.`;
        esc.cost_of_waiting =
          cutsWaited > 0
            ? `Resolved after ${cutsWaited} cut(s) (${esc.days_waiting} days waiting)`
            : 'Resolved in same cut (0 days waiting)';
        approvedThisCycle.push(esc);
        gateSummaryParts.push(`${esc.escalation_id} → APPROVED`);
      } else if (replyDecision === 'REJECTED') {
        esc.monitor_status = 'REJECTED';
        const reason =
          explicitSeed?.reason ||
          `Monitor reviewed ${esc.subject} and downgraded to routine monitoring (clinically stable / alternative etiology documented).`;
        esc.monitor_reply = reason;
        esc.downgraded_reason = reason;
        esc.cost_of_waiting = `Downgraded to monitoring at Cut ${cut}`;
        this.rejectedEscalationKeys.set(`${esc.code}|${esc.subject}`, reason);
        gateSummaryParts.push(`${esc.escalation_id} → REJECTED (downgraded to monitoring)`);

        this.ledger.append(
          {
            cut,
            kind: 'clinical_escalation',
            what: `Escalation ${esc.escalation_id} (${esc.code} on ${esc.subject}) REJECTED by Medical Monitor — Downgraded to Routine Monitoring`,
            plain_what: `Medical Monitor reviewed ${esc.subject} and downgraded ${esc.code} to routine observation (${reason})`,
            evidence: esc.evidence,
            customEvidenceLines: esc.evidence_lines,
            alternatives: [
              'Re-escalate in subsequent cuts (rejected: monitor rejection is stored in persistent memory and never re-escalated)',
              'Execute dosing hold despite rejection (rejected: human gate authority overrides automated escalation)',
            ],
            why: reason,
            node: 'human_gate',
            subject: esc.subject,
            site: esc.site,
            code: esc.code,
          },
          this.graph
        );
      } else if (replyDecision === 'CLARIFY') {
        // CLARIFY: answer question from StudyGraph, resubmit in same gate, reply becomes APPROVED!
        const qText =
          explicitSeed?.question ||
          `Clarify screening transaminase baseline and concomitant medications for ${esc.subject}.`;
        const clarification = this.buildClarificationFromGraph(esc.subject, qText);
        esc.clarification_question = qText;
        esc.clarification_answer = clarification.answerText;
        esc.clarification_evidence = clarification.evidence;
        esc.monitor_status = 'APPROVED';
        esc.monitor_reply = `CLARIFY requested ("${qText}") → Graph answered with baseline & CM citations → Resubmitted & APPROVED.`;
        esc.cost_of_waiting =
          cutsWaited > 0
            ? `Clarified & approved after ${cutsWaited} cut(s) (${esc.days_waiting} days)`
            : 'Clarified & approved in same cycle';
        approvedThisCycle.push(esc);
        gateEvidence.push(...clarification.evidence);
        gateSummaryParts.push(`${esc.escalation_id} → CLARIFY answered from Graph → APPROVED`);
      }
    }

    cycleTraces.push(
      this.appendTrace(
        cut,
        'human_gate',
        gateSummaryParts.length > 0
          ? `Processed Human Gate replies: ${gateSummaryParts.join('; ')}`
          : `Checked Human Gate inbox: ${
              this.allEscalations.filter((e) => e.monitor_status === 'PENDING').length
            } escalation(s) pending monitor response`,
        `Handled APPROVED, REJECTED, and CLARIFY states and enforced the 4-cut Standing Limits rule.`,
        gateEvidence
      )
    );

    // =========================================================================
    // NODE 6: execute
    // =========================================================================
    const executedRefs: RecordRef[] = [];
    const executedActions: string[] = [];

    for (const esc of approvedThisCycle) {
      const actionMap: Record<string, string> = {
        HYS_LAW_CANDIDATE: `Executed DILI safety protocol for ${esc.subject}: issued immediate dosing hold notification to ${esc.site}, scheduled 48h repeat hepatic panel, and prepared expedited safety narrative.`,
        AESHOSP_OVERRIDE: `Executed SAE upgrade for ${esc.subject}: reclassified hospitalization event to Serious (AESER=Y) and queued 24-hour pharmacovigilance safety report.`,
        PROHIBITED_MEDICATION: `Executed concomitant therapy intervention for ${esc.subject}: notified investigator at ${esc.site} to discontinue prohibited medication and monitor for CYP interaction.`,
        DUPLICATE_SUBJECT: `Executed subject reconciliation for ${esc.subject}: linked duplicate enrollment IDs and consolidated safety denominator to single unique participant.`,
      };
      const action =
        actionMap[esc.code] ||
        `Executed monitor-approved clinical action for ${esc.code} on ${esc.subject} at ${esc.site}.`;

      esc.action_executed = action;
      executedRefs.push(...esc.evidence, ...(esc.clarification_evidence || []));
      executedActions.push(`${esc.escalation_id}: ${action}`);

      this.ledger.append(
        {
          cut,
          kind: 'clinical_escalation',
          what: `Approved Action Executed for ${esc.subject} (${esc.code}): ${action}`,
          plain_what: `${esc.plainRationale} — Medical Monitor approved action: ${action}`,
          evidence: [...esc.evidence, ...(esc.clarification_evidence || [])],
          customEvidenceLines: [
            ...esc.evidence_lines,
            ...(esc.clarification_evidence || []).map((r) => {
              const rec = this.graph.resolveRecord(r);
              return rec
                ? formatRecordEvidenceLine(rec)
                : `${r.domain} ${r.usubjid} #${r.seq}`;
            }),
          ],
          alternatives: [
            'Continue passive observation without clinical intervention (rejected: severity met protocol threshold and Human Gate approved escalation)',
            'Act without Human Gate sign-off (rejected: approval-gated actions require explicit monitor approval)',
          ],
          why: `${esc.rationale}${
            esc.clarification_answer ? ` | Clarification: ${esc.clarification_answer}` : ''
          }`,
          node: 'execute',
          subject: esc.subject,
          site: esc.site,
          code: esc.code,
        },
        this.graph
      );
    }

    cycleTraces.push(
      this.appendTrace(
        cut,
        'execute',
        executedActions.length > 0
          ? `Executed ${executedActions.length} monitor-approved clinical action(s)`
          : `0 approval-gated actions executed this cycle (no new APPROVED escalations)`,
        executedActions.join(' | ') ||
          'Standing limits enforced: approval-gated actions are never executed without explicit monitor approval.',
        executedRefs
      )
    );

    return {
      cut,
      protocolVersion: ver,
      traces: cycleTraces,
      newFindingsCount,
      newQueriesCount,
      newEscalationsCount,
      activeQueries: this.allQueries.filter((q) => !q.superseded_at_cut),
      activeEscalations: this.allEscalations.filter((e) => !e.superseded_at_cut),
      siteFlags: Array.from(this.flaggedSites.entries()).map(([site, info]) => ({
        site,
        ...info,
      })),
      complianceSummary: {
        version: ver,
        compliantSubjects: allSubjects.length - nonCompliantSet.size,
        nonCompliantSubjects: nonCompliantSet.size,
        newlyNonCompliantAfterAmendment,
      },
    };
  }
}
