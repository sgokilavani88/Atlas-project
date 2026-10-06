import {
  AdversarialEvent,
  BudgetState,
  CutSnapshot,
  Decision,
  Explanation,
  Finding,
  IngestedStudyData,
  SiteRiskProfile,
  SurveillanceReport,
} from '../schema';
import { StudyGraph } from '../atlas/studyGraph';
import { DecisionLedger } from '../ledger/decisionLedger';
import { HumanMonitorConfig, ReviewCrew } from '../crew/reviewCrew';
import { evaluateSiteRegularity } from '../detectors/adversarialDetectors';

export interface WatchOptions {
  totalTokensBudget?: number;
  totalMsBudget?: number;
  tokensPerNarrativeCut?: number;
  monitorConfig?: HumanMonitorConfig;
}

export class StudyWatch {
  public readonly data: IngestedStudyData;
  public readonly graph: StudyGraph;
  public readonly ledger: DecisionLedger;
  public readonly crew: ReviewCrew;

  private options: Required<WatchOptions>;
  private lastReport: SurveillanceReport | null = null;

  constructor(data: IngestedStudyData, options: WatchOptions = {}) {
    this.data = data;
    this.options = {
      totalTokensBudget: options.totalTokensBudget ?? 6000,
      totalMsBudget: options.totalMsBudget ?? 60000,
      tokensPerNarrativeCut: options.tokensPerNarrativeCut ?? 380,
      monitorConfig: options.monitorConfig ?? {
        delayCuts: 2,
        responseRate: 0.6,
        seed: 42,
      },
    };
    this.graph = new StudyGraph(data);
    this.ledger = new DecisionLedger();
    this.crew = new ReviewCrew(this.graph, this.ledger, this.options.monitorConfig);
  }

  public setOptions(opts: Partial<WatchOptions>) {
    if (opts.totalTokensBudget !== undefined) {
      this.options.totalTokensBudget = opts.totalTokensBudget;
    }
    if (opts.totalMsBudget !== undefined) {
      this.options.totalMsBudget = opts.totalMsBudget;
    }
    if (opts.tokensPerNarrativeCut !== undefined) {
      this.options.tokensPerNarrativeCut = opts.tokensPerNarrativeCut;
    }
    if (opts.monitorConfig) {
      this.options.monitorConfig = { ...this.options.monitorConfig, ...opts.monitorConfig };
      this.crew.setMonitorConfig(this.options.monitorConfig);
    }
  }

  /**
   * Run the full surveillance period across cuts (default 1..12).
   * Uses incremental StudyGraph.applyDelta(cut), runs the 6-node ReviewCrew,
   * enforces the 80% Budget Governor tier, and records snapshots for every cut.
   */
  public runPeriod(cutsRange?: number[]): SurveillanceReport {
    const cutsToRun =
      cutsRange ||
      (this.data.cuts.length > 0
        ? this.data.cuts.map((c) => c.cut)
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    // Reset state for clean full-period run
    this.graph.currentCut = 0;
    this.graph.activeRecordsByKey.clear();
    this.graph.subjectRecordsMap.clear();
    this.graph.subjectFindingsMap.clear();
    this.graph.supersededFindings = [];
    this.graph.nodesMap.clear();
    this.graph.edgesMap.clear();
    this.graph.untrustedSiteTests.clear();
    this.graph.quarantinedSites.clear();
    this.graph.adversarialEventsByCut.clear();

    this.ledger.clear();
    this.crew.raisedQueryKeys.clear();
    this.crew.raisedEscalationKeys.clear();
    this.crew.rejectedEscalationKeys.clear();
    this.crew.subjectFlaggedCuts.clear();
    this.crew.siteProblemCounts.clear();
    this.crew.flaggedSites.clear();
    this.crew.unresponsiveSites.clear();
    this.crew.priorCompliantSubjects.clear();
    this.crew.lastProtocolVersion = '';
    this.crew.allQueries = [];
    this.crew.allEscalations = [];
    this.crew.allTraces = [];

    const budget: BudgetState = {
      totalTokensBudget: this.options.totalTokensBudget,
      usedTokens: 0,
      totalMsBudget: this.options.totalMsBudget,
      usedMs: 0,
      tier: 'normal',
      callsPermitted: 0,
      callsBlockedByGovernor: 0,
      perCutCost: [],
    };

    const snapshots = new Map<number, CutSnapshot>();
    const allAdversarialEvents: AdversarialEvent[] = [];

    for (const cut of cutsToRun) {
      // 1. Incremental StudyGraph delta
      const buildStats = this.graph.applyDelta(cut);

      // 2. Check Budget Governor BEFORE narrative generation
      const tokenRatio = budget.usedTokens / Math.max(1, budget.totalTokensBudget);
      const msRatio = budget.usedMs / Math.max(1, budget.totalMsBudget);

      let cutTokens = 0;
      if (tokenRatio >= 0.8 || msRatio >= 0.8) {
        if (budget.tier === 'normal') {
          budget.tier = 'degraded';
          budget.degradedAtCut = cut;
          // Record degradation decision in ledger
          this.ledger.append(
            {
              cut,
              kind: 'degradation',
              what: `Budget Governor crossed 80% threshold at Cut ${cut} (${Math.round(
                Math.max(tokenRatio, msRatio) * 100
              )}% used) — Graceful Degradation Activated`,
              plain_what: `Resource budget reached 80% at Cut ${cut}. Model prose generation paused so 100% of deterministic patient safety checks finish without interruption.`,
              evidence: [],
              customEvidenceLines: [
                `GOVERNOR Cut ${cut}: ${budget.usedTokens}/${budget.totalTokensBudget} tokens (${Math.round(
                  tokenRatio * 100
                )}%), ${budget.usedMs.toFixed(1)}/${budget.totalMsBudget} ms`,
              ],
              alternatives: [
                'Abort surveillance run when budget runs low (rejected: never go silent or leave late cuts unmonitored)',
                'Skip deterministic safety detectors to save compute (rejected: safety rules are non-negotiable; only prose generation is shed)',
              ],
              why: `Budget Governor exceeded 80% capacity at Cut ${cut}. Halted LLM narrative generation (0 tokens spent on Cut ${cut}..${
                cutsToRun[cutsToRun.length - 1]
              }) while keeping all deterministic clinical, compliance, and adversarial detectors active through Cut ${
                cutsToRun[cutsToRun.length - 1]
              }.`,
              node: 'watch_governor',
              code: 'BUDGET_DEGRADATION',
            },
            this.graph
          );
        }
        budget.callsBlockedByGovernor++;
        cutTokens = 0; // Zero narrative tokens spent in degraded tier
      } else {
        // Check if adding this cut's narrative would cross 80%
        const projectedRatio =
          (budget.usedTokens + this.options.tokensPerNarrativeCut) /
          Math.max(1, budget.totalTokensBudget);
        cutTokens = this.options.tokensPerNarrativeCut;
        budget.usedTokens += cutTokens;
        budget.callsPermitted++;
        if (projectedRatio >= 0.8 && budget.tier === 'normal' && cut < cutsToRun[cutsToRun.length - 1]) {
          // Will trigger degradation on next cut
        }
      }

      budget.usedMs = Number((budget.usedMs + buildStats.ms).toFixed(2));
      buildStats.tokensUsed = cutTokens;

      // 3. Run 6-node ReviewCrew cycle (always runs 100% deterministically even in degraded tier!)
      const activeRules = this.graph.getProtocolRulesForCut(cut);
      this.crew.runCycle(cut, activeRules.version);

      const cutAdv = this.graph.adversarialEventsByCut.get(cut) || [];
      allAdversarialEvents.push(...cutAdv);

      budget.perCutCost.push({
        cut,
        ms: buildStats.ms,
        tokens: cutTokens,
        cumulativeTokens: budget.usedTokens,
        cumulativeMs: budget.usedMs,
        tier: budget.tier,
        subjectsReDerived: buildStats.subjectsReDerived,
        nodes: buildStats.nodes,
      });

      const siteProfilesAtCut = this.computeSiteProfiles(cut);
      const cutDef = this.data.cuts.find((c) => c.cut === cut);

      const snapshot: CutSnapshot = {
        cut,
        date: cutDef?.date || `2025-${String(cut).padStart(2, '0')}-15`,
        protocolVersion: activeRules.version,
        stats: { ...buildStats },
        findings: this.graph.getAllActiveFindings().map((f) => ({ ...f })),
        queries: this.crew.allQueries
          .filter((q) => q.cut_raised <= cut)
          .map((q) => ({ ...q })),
        escalations: this.crew.allEscalations
          .filter((e) => e.cut_raised <= cut)
          .map((e) => ({ ...e })),
        decisions: this.ledger.getUpToCut(cut).map((d) => ({ ...d })),
        traces: this.crew.allTraces.filter((t) => t.cut <= cut).map((t) => ({ ...t })),
        adversarialEvents: allAdversarialEvents
          .filter((a) => a.cut <= cut)
          .map((a) => ({ ...a })),
        siteProfiles: siteProfilesAtCut,
        budget: {
          ...budget,
          perCutCost: budget.perCutCost.map((p) => ({ ...p })),
        },
      };

      snapshots.set(cut, snapshot);
    }

    const finalCut = cutsToRun[cutsToRun.length - 1] || 12;
    const finalSnapshot = snapshots.get(finalCut)!;

    this.lastReport = {
      studyName: this.data.studyName,
      totalCuts: cutsToRun.length,
      currentCut: finalCut,
      snapshots,
      ledger: this.ledger.getAll(),
      allFindings: finalSnapshot.findings,
      allQueries: this.crew.allQueries,
      allEscalations: this.crew.allEscalations,
      allTraces: this.crew.allTraces,
      adversarialEvents: allAdversarialEvents,
      siteProfiles: finalSnapshot.siteProfiles,
      budget,
      dataQualityIssues: this.data.dataQualityIssues,
    };

    return this.lastReport;
  }

  /**
   * Read decision explanation verbatim from the DecisionLedger and verify trace consistency.
   */
  public explain(decisionId: string): Explanation | null {
    return this.ledger.explain(decisionId, this.graph, this.crew.allTraces);
  }

  private computeSiteProfiles(upToCut: number): SiteRiskProfile[] {
    const allRecs = Array.from(this.graph.activeRecordsByKey.values());
    const allFindings = this.graph.getAllActiveFindings();
    const sites = Array.from(this.data.siteOnboardCut.keys()).filter(
      (s) => (this.data.siteOnboardCut.get(s) ?? 1) <= upToCut
    );

    const profiles: SiteRiskProfile[] = [];
    for (const site of sites) {
      const siteRecs = allRecs.filter((r) => r.site === site);
      const subjSet = new Set(siteRecs.map((r) => r.usubjid));
      const siteFindings = allFindings.filter((f) => f.site === site);
      const critCount = siteFindings.filter((f) => f.severity === 'critical').length;
      const openQ = this.crew.allQueries.filter(
        (q) => q.site === site && q.cut_raised <= upToCut && q.status !== 'answered'
      ).length;

      const reg = evaluateSiteRegularity(site, siteRecs, upToCut);
      const quarInfo = this.graph.quarantinedSites.get(site);
      const untrustedTests: string[] = [];
      for (const st of this.graph.untrustedSiteTests) {
        const [s, t] = st.split('|');
        if (s === site) untrustedTests.push(t);
      }

      const perCutSignals: Record<number, number> = {};
      for (let c = 1; c <= 12; c++) {
        if (c > upToCut) {
          perCutSignals[c] = 0;
        } else {
          const fAtC = siteFindings.filter((f) => f.cut === c).length;
          const advAtC = (this.graph.adversarialEventsByCut.get(c) || []).filter(
            (a) => a.site === site
          ).length;
          perCutSignals[c] = fAtC + advAtC;
        }
      }

      const riskScore = Math.min(
        100,
        critCount * 28 +
          siteFindings.length * 9 +
          openQ * 8 +
          (quarInfo ? 45 : 0) +
          untrustedTests.length * 25
      );

      const riskLevel = quarInfo || untrustedTests.length > 0
        ? 'untrusted'
        : critCount > 0 || riskScore >= 60
        ? 'critical'
        : siteFindings.length > 0 || openQ > 0
        ? 'review'
        : 'ok';

      profiles.push({
        site,
        onboardedAtCut: this.data.siteOnboardCut.get(site) || 1,
        subjectCount: subjSet.size,
        quarantined: Boolean(quarInfo),
        quarantinedAtCut: quarInfo?.cut,
        quarantineReason: quarInfo?.reason,
        untrustedTests,
        openQueries: openQ,
        totalFindings: siteFindings.length,
        criticalFindings: critCount,
        weekdayConcentration: reg.weekdayConcentration,
        vitalsStdDev: reg.vitalsStdDev,
        narrativeSimilarity: reg.narrativeSimilarity,
        riskScore,
        riskLevel,
        perCutSignals,
      });
    }

    return profiles.sort((a, b) => b.riskScore - a.riskScore);
  }
}
