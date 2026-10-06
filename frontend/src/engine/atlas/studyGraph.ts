import {
  AdversarialEvent,
  BuildStats,
  DomainRecord,
  Finding,
  GraphEdge,
  GraphNode,
  IngestedStudyData,
  Patient360View,
  ProtocolRules,
  RecordRef,
} from '../schema';
import {
  buildUnitConversionRegistry,
  normalizeLabMeasurement,
  parseClinicalDate,
  parseClinicalValue,
} from './ingestion';
import {
  evaluateSubjectDetectors,
  formatRecordEvidenceLine,
} from '../detectors/clinicalDetectors';
import {
  detectLabUnitCorruption,
  evaluateDocumentTamperingAtCut,
  evaluateSiteRegularity,
} from '../detectors/adversarialDetectors';

export class StudyGraph {
  public readonly data: IngestedStudyData;
  public currentCut: number = 0;

  // Plain Maps as required by Layer A specification
  public activeRecordsByKey = new Map<string, DomainRecord>();
  public subjectRecordsMap = new Map<string, Map<string, DomainRecord>>();
  public subjectFindingsMap = new Map<string, Finding[]>();
  public supersededFindings: Finding[] = [];

  public nodesMap = new Map<string, GraphNode>();
  public edgesMap = new Map<string, GraphEdge>();

  public untrustedSiteTests = new Set<string>();
  public quarantinedSites = new Map<string, { cut: number; reason: string }>();
  public adversarialEventsByCut = new Map<number, AdversarialEvent[]>();

  private canonicalByTest: Map<string, any>;
  private lookupByLabAndTest: Map<string, any>;

  constructor(data: IngestedStudyData) {
    this.data = data;
    const convReg = buildUnitConversionRegistry(data.referenceRanges);
    this.canonicalByTest = convReg.canonicalByTest;
    this.lookupByLabAndTest = convReg.lookupByLabAndTest;
  }

  public getProtocolRulesForCut(cut: number): ProtocolRules {
    const cutDef = this.data.cuts.find((c) => c.cut === cut);
    const ver = cutDef?.protocol_version || 'v1';
    return (
      this.data.protocolVersions.get(ver) ||
      Array.from(this.data.protocolVersions.values())[0]
    );
  }

  private cloneRecord(rec: DomainRecord): DomainRecord {
    return {
      ...rec,
      raw: { ...rec.raw },
      values: { ...rec.values },
      history: rec.history.map((h) => ({ ...h })),
    };
  }

  private applyCorrectionToRecord(
    rec: DomainRecord,
    field: string,
    newValue: string,
    cut: number,
    reason?: string
  ) {
    const actualField =
      Object.keys(rec.values).find((k) => k.toUpperCase() === field.toUpperCase()) || field;
    const oldVal = rec.values[actualField] ?? '';
    if (oldVal === newValue) return;

    rec.history.push({
      cut,
      field: actualField,
      oldValue: oldVal,
      newValue,
      reason,
    });
    rec.values[actualField] = newValue;
    rec.corrected_at_cut = cut;

    // Re-parse clinical value / unit / date if affected
    const upperField = actualField.toUpperCase();
    if (
      upperField.endsWith('ORRES') ||
      upperField.endsWith('STRESC') ||
      upperField.endsWith('DOSE') ||
      upperField === 'VALUE'
    ) {
      const pv = parseClinicalValue(newValue);
      rec.rawValueStr = pv.rawValueStr;
      rec.numericValue = pv.numericValue;
      rec.censored = pv.censored;
      rec.censorThreshold = pv.censorThreshold;
      rec.notDone = pv.notDone;
    }

    if (upperField.endsWith('ORRESU') || upperField.endsWith('DOSU') || upperField === 'UNIT') {
      rec.unit = newValue;
    }

    if (upperField.endsWith('DTC') || upperField.endsWith('DT') || upperField.includes('DATE')) {
      const pd = parseClinicalDate(newValue);
      if (pd.valid && pd.iso) {
        rec.dateStr = pd.iso;
        rec.epochDays = pd.epochDays;
      }
    }

    if (rec.domain === 'LB') {
      const norm = normalizeLabMeasurement(
        rec.testCode || '',
        rec.numericValue,
        rec.unit,
        rec.labId,
        this.canonicalByTest,
        this.lookupByLabAndTest,
        this.data.unitConversions
      );
      rec.canonicalValue = norm.canonicalValue;
      rec.canonicalUnit = norm.canonicalUnit;
      rec.conversionFactorUsed = norm.conversionFactorUsed;
      rec.refLow = norm.refLow;
      rec.refHigh = norm.refHigh;
    }
  }

  /**
   * Build the graph as of `targetCut` from scratch (used for initial cut or full-rebuild verification).
   */
  public build(targetCut?: number): BuildStats {
    const maxCut =
      targetCut ??
      (this.data.cuts.length > 0 ? this.data.cuts[this.data.cuts.length - 1].cut : 12);

    this.currentCut = 0;
    this.activeRecordsByKey.clear();
    this.subjectRecordsMap.clear();
    this.subjectFindingsMap.clear();
    this.supersededFindings = [];
    this.nodesMap.clear();
    this.edgesMap.clear();
    this.untrustedSiteTests.clear();
    this.quarantinedSites.clear();
    this.adversarialEventsByCut.clear();

    const t0 = performance.now();
    let lastStats: BuildStats = {
      cut: maxCut,
      nodes: 0,
      edges: 0,
      subjects: 0,
      subjectsReDerived: 0,
      ms: 0,
      tokensUsed: 0,
      incremental: false,
    };

    for (let c = 1; c <= maxCut; c++) {
      lastStats = this.applyDelta(c);
    }

    const totalMs = Math.max(0.1, Number((performance.now() - t0).toFixed(2)));
    return {
      ...lastStats,
      ms: totalMs,
      incremental: false,
    };
  }

  /**
   * INCREMENTAL update for `cut`:
   * Adds only the new rows for `cut`, applies corrections for `cut`,
   * and re-derives only the affected subjects (or all subjects if protocol version amended at `cut`).
   * Never rebuilds the whole graph.
   */
  public applyDelta(cut: number): BuildStats {
    const t0 = performance.now();
    const prevRules = this.currentCut > 0 ? this.getProtocolRulesForCut(this.currentCut) : null;
    const activeRules = this.getProtocolRulesForCut(cut);
    const protocolAmended = prevRules !== null && prevRules.version !== activeRules.version;

    this.currentCut = cut;
    const affectedSubjects = new Set<string>();
    const correctedSubjectsAtCut = new Set<string>();

    // Attach ProtocolRule node for active version
    const ruleNodeId = `RULE:${activeRules.version}`;
    this.nodesMap.set(ruleNodeId, {
      id: ruleNodeId,
      type: 'rule',
      label: `Protocol ${activeRules.version}`,
      sublabel: `ALT >${activeRules.hysLawAltMultiplier}x, BILI >${activeRules.hysLawBiliMultiplier}x (${activeRules.hysLawWindowDays}d)`,
      cut,
      data: activeRules,
    });

    // 1. Add new rows arriving at `cut`
    const newRows = this.data.recordsByCut.get(cut) || [];
    for (const rawRec of newRows) {
      const rec = this.cloneRecord(rawRec);
      const key = `${rec.domain}|${rec.usubjid}|${rec.seq}`;
      this.activeRecordsByKey.set(key, rec);

      let subjMap = this.subjectRecordsMap.get(rec.usubjid);
      if (!subjMap) {
        subjMap = new Map<string, DomainRecord>();
        this.subjectRecordsMap.set(rec.usubjid, subjMap);
      }
      subjMap.set(key, rec);
      affectedSubjects.add(rec.usubjid);
    }

    // 2. Apply corrections arriving at `cut`
    const corrections = this.data.correctionsByCut.get(cut) || [];
    for (const corr of corrections) {
      const key = `${corr.domain.toUpperCase()}|${corr.usubjid}|${corr.seq}`;
      const existing = this.activeRecordsByKey.get(key);
      if (existing) {
        this.applyCorrectionToRecord(existing, corr.field, corr.new_value, cut, corr.reason);
        affectedSubjects.add(existing.usubjid);
        correctedSubjectsAtCut.add(existing.usubjid);
      }
    }

    // 3. Evaluate cut-level adversarial conditions (unit corruption, regular site, doc tampering, onboarding, amendment)
    const cutAdversarialEvents: AdversarialEvent[] = [];
    const allActiveRecords = Array.from(this.activeRecordsByKey.values());

    // 3a. Onboarding detection (sites and domains first appearing at cut > 1)
    if (cut > 1) {
      for (const [site, onboardCut] of this.data.siteOnboardCut.entries()) {
        if (onboardCut === cut) {
          const siteRecs = newRows.filter((r) => r.site === site).slice(0, 3);
          cutAdversarialEvents.push({
            id: `ADV-ONBOARD-SITE-${site}-C${cut}`,
            cut,
            kind: 'onboarding',
            title: `New Clinical Site Onboarded: ${site}`,
            plainTitle: `New Clinical Site Joined Mid-Study (${site})`,
            site,
            summary: `Site ${site} first transmitted clinical records at Cut ${cut} and was automatically absorbed by the dynamic registry with zero code change.`,
            thresholdsStated: 'Dynamic site discovery on incoming domain CSV records.',
            actionTaken: `Onboarded at cut ${cut}; initialized site surveillance profile and baseline reference range mappings.`,
            evidence: siteRecs.map((r) => ({ domain: r.domain, usubjid: r.usubjid, seq: r.seq })),
            evidence_lines: siteRecs.map(formatRecordEvidenceLine),
          });
        }
      }
      for (const [dom, onboardCut] of this.data.domainOnboardCut.entries()) {
        if (onboardCut === cut) {
          const domSchema = this.data.domains.get(dom);
          const domRecs = newRows.filter((r) => r.domain === dom).slice(0, 3);
          cutAdversarialEvents.push({
            id: `ADV-ONBOARD-DOM-${dom}-C${cut}`,
            cut,
            kind: 'onboarding',
            title: `New Domain Absorbed Mid-Period: ${dom}.csv`,
            plainTitle: `New Assessment Type Added Mid-Study (${dom})`,
            summary: `Domain ${dom} appeared at Cut ${cut}. Dynamic Domain Registry inferred sequence column (${domSchema?.seqColumn}), date columns (${domSchema?.dateColumns.join(', ') || 'none'}), and value columns (${domSchema?.valueColumns.join(', ') || 'none'}).`,
            thresholdsStated: 'Schema-driven dynamic domain inference (USUBJID + <DOMAIN>SEQ).',
            actionTaken: `Onboarded at cut ${cut} into StudyGraph and Patient 360 views.`,
            evidence: domRecs.map((r) => ({ domain: r.domain, usubjid: r.usubjid, seq: r.seq })),
            evidence_lines: domRecs.map(formatRecordEvidenceLine),
          });
        }
      }
    }

    // 3b. Lab unit corruption check
    const unitCorruptions = detectLabUnitCorruption(allActiveRecords, cut);
    for (const uc of unitCorruptions) {
      const stKey = `${uc.site}|${uc.test}`;
      if (!this.untrustedSiteTests.has(stKey)) {
        this.untrustedSiteTests.add(stKey);
        cutAdversarialEvents.push(uc.event);
        // Mark all subjects at this site as affected so their safety findings reflect untrusted exclusion
        for (const r of allActiveRecords) {
          if (r.site === uc.site) affectedSubjects.add(r.usubjid);
        }
      }
    }

    // 3c. Implausibly regular site check
    const sitesAtCut = new Set(newRows.map((r) => r.site).filter(Boolean));
    for (const site of sitesAtCut) {
      if (this.quarantinedSites.has(site)) continue;
      const siteRecs = allActiveRecords.filter((r) => r.site === site);
      const reg = evaluateSiteRegularity(site, siteRecs, cut);
      if (reg.isImplausiblyRegular && reg.event) {
        this.quarantinedSites.set(site, {
          cut,
          reason: reg.event.summary,
        });
        cutAdversarialEvents.push(reg.event);
        for (const r of siteRecs) affectedSubjects.add(r.usubjid);
      }
    }

    // 3d. Document tampering check at `cut`
    const docSnapshots = this.data.documentsByCut.get(cut) || [];
    const tamperEvents = evaluateDocumentTamperingAtCut(docSnapshots, cut);
    cutAdversarialEvents.push(...tamperEvents);

    // 4. Determine subjects to re-derive
    const subjectsToProcess = protocolAmended
      ? Array.from(this.subjectRecordsMap.keys())
      : Array.from(affectedSubjects);

    const beforeAmendmentCounts = {
      visitWindow: 0,
      prohibitedMed: 0,
      eligibility: 0,
    };
    if (protocolAmended) {
      for (const fList of this.subjectFindingsMap.values()) {
        for (const f of fList) {
          if (f.code === 'VISIT_WINDOW_DEVIATION') beforeAmendmentCounts.visitWindow++;
          if (f.code === 'PROHIBITED_MEDICATION') beforeAmendmentCounts.prohibitedMed++;
          if (f.code === 'ELIGIBILITY_VIOLATION') beforeAmendmentCounts.eligibility++;
        }
      }
    }

    const quarantinedSet = new Set(this.quarantinedSites.keys());

    // 5. Incremental graph node & finding re-derivation ONLY for `subjectsToProcess`
    for (const usubjid of subjectsToProcess) {
      const subjRecMap = this.subjectRecordsMap.get(usubjid);
      if (!subjRecMap) continue;
      const subjRecords = Array.from(subjRecMap.values());

      // Update graph nodes and edges for this subject
      this.updateSubjectGraphNodes(usubjid, subjRecords, activeRules.version, cut);

      const priorFindings = this.subjectFindingsMap.get(usubjid) || [];
      const dupPair = this.data.duplicateSubjectPairs.find(
        (p) => p.duplicate === usubjid || p.primary === usubjid
      );

      const nextFindings = evaluateSubjectDetectors(
        usubjid,
        subjRecords,
        activeRules,
        cut,
        this.untrustedSiteTests,
        quarantinedSet,
        dupPair,
        (ref) => this.resolveRecord(ref)
      );

      // Preserve the original detection cut for findings that already existed before this cut
      for (const nf of nextFindings) {
        const matchPrior = priorFindings.find(
          (pf) =>
            pf.code === nf.code &&
            pf.evidence.map((e) => `${e.domain}:${e.seq}`).join(',') ===
              nf.evidence.map((e) => `${e.domain}:${e.seq}`).join(',')
        );
        if (matchPrior) {
          nf.cut = matchPrior.cut;
          nf.id = matchPrior.id;
        }
      }

      // Check if any prior finding was undone by a correction at this cut
      if (correctedSubjectsAtCut.has(usubjid)) {
        for (const pf of priorFindings) {
          const stillExists = nextFindings.some((nf) => nf.code === pf.code);
          if (!stillExists) {
            const superseded: Finding = {
              ...pf,
              supersededAtCut: cut,
              supersededReason: `Superseded by data correction at Cut ${cut}`,
            };
            this.supersededFindings.push(superseded);
          }
        }
      }

      this.subjectFindingsMap.set(usubjid, nextFindings);
    }

    // Add unit corruption findings to site representative subject so they are tracked in findings
    for (const uc of unitCorruptions) {
      const subjList = this.subjectFindingsMap.get(uc.finding.subject) || [];
      if (!subjList.some((f) => f.id === uc.finding.id)) {
        subjList.push(uc.finding);
        this.subjectFindingsMap.set(uc.finding.subject, subjList);
      }
    }

    if (protocolAmended && prevRules) {
      const afterAmendmentCounts = {
        visitWindow: 0,
        prohibitedMed: 0,
        eligibility: 0,
      };
      for (const fList of this.subjectFindingsMap.values()) {
        for (const f of fList) {
          if (f.code === 'VISIT_WINDOW_DEVIATION') afterAmendmentCounts.visitWindow++;
          if (f.code === 'PROHIBITED_MEDICATION') afterAmendmentCounts.prohibitedMed++;
          if (f.code === 'ELIGIBILITY_VIOLATION') afterAmendmentCounts.eligibility++;
        }
      }
      cutAdversarialEvents.push({
        id: `ADV-AMEND-${activeRules.version}-C${cut}`,
        cut,
        kind: 'protocol_amendment',
        title: `Protocol Amendment Effective: ${prevRules.version} → ${activeRules.version}`,
        plainTitle: `Study Protocol Updated (${prevRules.version} → ${activeRules.version})`,
        documentName: activeRules.documentName,
        summary: `Protocol ${activeRules.version} took effect at Cut ${cut}. All ${subjectsToProcess.length} subjects were re-evaluated against the amended rules (${activeRules.diffFromPrevious.map((d) => `${d.label}: ${d.before} → ${d.after}`).join('; ')}).`,
        thresholdsStated:
          activeRules.diffFromPrevious
            .map((d) => `${d.label}: ${d.before} → ${d.after}`)
            .join(' | ') || 'Updated protocol thresholds parsed from document.',
        actionTaken: `Re-derived compliance flags across all enrolled subjects under ${activeRules.version}.`,
        evidence: [],
        evidence_lines: activeRules.diffFromPrevious.map(
          (d) => `RULE DIFF (${prevRules.version}→${activeRules.version}): ${d.label} changed from [${d.before}] to [${d.after}]`
        ),
        amendmentBeforeAfter: [
          {
            metric: 'Visit Window Deviations',
            before: beforeAmendmentCounts.visitWindow,
            after: afterAmendmentCounts.visitWindow,
          },
          {
            metric: 'Prohibited Medication Flags',
            before: beforeAmendmentCounts.prohibitedMed,
            after: afterAmendmentCounts.prohibitedMed,
          },
          {
            metric: 'Eligibility / Screening Exceptions',
            before: beforeAmendmentCounts.eligibility,
            after: afterAmendmentCounts.eligibility,
          },
        ],
      });
    }

    this.adversarialEventsByCut.set(cut, cutAdversarialEvents);

    const ms = Math.max(0.05, Number((performance.now() - t0).toFixed(2)));
    return {
      cut,
      nodes: this.nodesMap.size,
      edges: this.edgesMap.size,
      subjects: this.subjectRecordsMap.size,
      subjectsReDerived: subjectsToProcess.length,
      ms,
      tokensUsed: 0,
      incremental: true,
    };
  }

  private updateSubjectGraphNodes(
    usubjid: string,
    records: DomainRecord[],
    protocolVersion: string,
    cut: number
  ) {
    const subjNodeId = `SUBJ:${usubjid}`;
    const dm = records.find((r) => r.domain === 'DM');
    this.nodesMap.set(subjNodeId, {
      id: subjNodeId,
      type: 'subject',
      label: usubjid,
      sublabel: dm ? `${dm.site} · ${dm.values.ARM || dm.values.ACTARM || 'Enrolled'}` : usubjid,
      usubjid,
      cut,
      data: dm,
    });

    const ruleEdgeId = `EDGE:${subjNodeId}->RULE:${protocolVersion}`;
    this.edgesMap.set(ruleEdgeId, {
      id: ruleEdgeId,
      source: subjNodeId,
      target: `RULE:${protocolVersion}`,
      label: 'governed_by',
    });

    for (const rec of records) {
      const visitLabel = rec.visit || rec.dateStr || 'Unscheduled';
      const visitNodeId = `VISIT:${usubjid}:${visitLabel}`;
      if (!this.nodesMap.has(visitNodeId)) {
        this.nodesMap.set(visitNodeId, {
          id: visitNodeId,
          type: 'visit',
          label: visitLabel,
          sublabel: rec.dateStr || '',
          usubjid,
          cut: rec.cut_available,
        });
        this.edgesMap.set(`EDGE:${subjNodeId}->${visitNodeId}`, {
          id: `EDGE:${subjNodeId}->${visitNodeId}`,
          source: subjNodeId,
          target: visitNodeId,
          label: 'visit',
        });
      }

      const recNodeId = `REC:${rec.domain}:${usubjid}:${rec.seq}`;
      this.nodesMap.set(recNodeId, {
        id: recNodeId,
        type: 'record',
        label: `${rec.domain} #${rec.seq}`,
        sublabel:
          rec.testCode ||
          rec.values.AETERM ||
          rec.values.CMTRT ||
          rec.values.EXTRT ||
          rec.rawValueStr ||
          rec.domain,
        domain: rec.domain,
        usubjid,
        seq: rec.seq,
        cut: rec.cut_available,
        data: rec,
      });

      this.edgesMap.set(`EDGE:${visitNodeId}->${recNodeId}`, {
        id: `EDGE:${visitNodeId}->${recNodeId}`,
        source: visitNodeId,
        target: recNodeId,
        label: rec.domain,
      });
    }
  }

  public resolveRecord(ref: RecordRef): DomainRecord | undefined {
    return this.activeRecordsByKey.get(`${ref.domain.toUpperCase()}|${ref.usubjid}|${ref.seq}`);
  }

  public getAllActiveFindings(): Finding[] {
    const out: Finding[] = [];
    for (const list of this.subjectFindingsMap.values()) {
      out.push(...list);
    }
    return out;
  }

  /**
   * Build the complete Patient 360 view for a single subject (`usubjid`),
   * including visit timeline, grouped domain records, active findings, and interactive graph nodes/edges.
   */
  public patient360(usubjid: string): Patient360View | null {
    const subjMap = this.subjectRecordsMap.get(usubjid);
    if (!subjMap) return null;

    const records = Array.from(subjMap.values()).sort(
      (a, b) => (a.epochDays ?? 0) - (b.epochDays ?? 0) || a.seq - b.seq
    );
    const dm = records.find((r) => r.domain === 'DM');
    const ex = records.find((r) => r.domain === 'EX');
    const site = dm?.site || records[0]?.site || 'UNKNOWN';

    const recordsByDomain: Record<string, DomainRecord[]> = {};
    const visitMap = new Map<
      string,
      { visitName: string; date: string; epochDays: number | null; records: DomainRecord[] }
    >();

    for (const r of records) {
      if (!recordsByDomain[r.domain]) recordsByDomain[r.domain] = [];
      recordsByDomain[r.domain].push(r);

      const vKey = r.visit || r.dateStr || 'Baseline / Unscheduled';
      let vEntry = visitMap.get(vKey);
      if (!vEntry) {
        vEntry = {
          visitName: vKey,
          date: r.dateStr || '',
          epochDays: r.epochDays ?? null,
          records: [],
        };
        visitMap.set(vKey, vEntry);
      }
      vEntry.records.push(r);
    }

    const visits = Array.from(visitMap.values()).sort(
      (a, b) => (a.epochDays ?? 0) - (b.epochDays ?? 0)
    );

    const findings = this.subjectFindingsMap.get(usubjid) || [];
    const dupPair = this.data.duplicateSubjectPairs.find(
      (p) => p.duplicate === usubjid || p.primary === usubjid
    );

    // Filter graph nodes and edges for this subject + active protocol rule
    const activeRule = this.getProtocolRulesForCut(this.currentCut || 1);
    const ruleNodeId = `RULE:${activeRule.version}`;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    for (const n of this.nodesMap.values()) {
      if (n.usubjid === usubjid || n.id === ruleNodeId) {
        nodes.push(n);
        nodeIds.add(n.id);
      }
    }
    for (const f of findings) {
      const fNodeId = `FINDING:${f.id}`;
      nodes.push({
        id: fNodeId,
        type: 'finding',
        label: f.code,
        sublabel: f.plainRationale,
        usubjid,
        severity: f.severity,
        cut: f.cut,
        data: f,
      });
      nodeIds.add(fNodeId);
      for (const ev of f.evidence) {
        const targetId = `REC:${ev.domain}:${ev.usubjid}:${ev.seq}`;
        if (nodeIds.has(targetId)) {
          edges.push({
            id: `EDGE:${fNodeId}->${targetId}`,
            source: fNodeId,
            target: targetId,
            label: 'cites',
          });
        }
      }
    }

    for (const e of this.edgesMap.values()) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        edges.push(e);
      }
    }

    return {
      usubjid,
      site,
      age: dm?.values.AGE ? Number(dm.values.AGE) : undefined,
      sex: dm?.values.SEX,
      arm: dm?.values.ACTARM || dm?.values.ARM,
      initials: dm?.values.SUBJINIT || dm?.values.INITIALS,
      birthDate: dm?.values.BRTHDTC || dm?.values.BIRTHDATE,
      firstDoseDate: ex?.dateStr,
      isDuplicateOf: dupPair?.duplicate === usubjid ? dupPair.primary : undefined,
      hasDuplicate: dupPair?.primary === usubjid ? dupPair.duplicate : undefined,
      visits,
      recordsByDomain,
      findings,
      nodes,
      edges,
    };
  }
}
