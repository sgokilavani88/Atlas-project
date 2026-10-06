import {
  Decision,
  DecisionKind,
  Explanation,
  RecordRef,
  TraceEntry,
} from '../schema';
import { StudyGraph } from '../atlas/studyGraph';
import { formatRecordEvidenceLine } from '../detectors/clinicalDetectors';

export class DecisionLedger {
  private entries: Decision[] = [];
  private seq = 1;

  public clear() {
    this.entries = [];
    this.seq = 1;
  }

  public getAll(): Decision[] {
    return [...this.entries];
  }

  public getUpToCut(cut: number): Decision[] {
    return this.entries.filter((d) => d.cut <= cut);
  }

  public getById(decisionId: string): Decision | undefined {
    return this.entries.find((d) => d.decision_id === decisionId);
  }

  /**
   * Append a new Decision to the immutable log.
   * Evidence and evidence_lines are materialized AT DECISION TIME from the exact records in StudyGraph.
   */
  public append(
    params: {
      cut: number;
      kind: DecisionKind;
      what: string;
      plain_what?: string;
      evidence: RecordRef[];
      customEvidenceLines?: string[];
      alternatives: string[];
      why: string;
      node: string;
      subject?: string;
      site?: string;
      code?: string;
      timestamp?: string;
    },
    graph: StudyGraph
  ): Decision {
    const decision_id = `D-${String(this.seq++).padStart(3, '0')}`;

    // Freeze evidence and format evidence_lines AT DECISION TIME
    const frozenEvidence: RecordRef[] = params.evidence.map((r) => ({
      domain: r.domain,
      usubjid: r.usubjid,
      seq: r.seq,
    }));

    const frozenEvidenceLines: string[] =
      params.customEvidenceLines && params.customEvidenceLines.length > 0
        ? [...params.customEvidenceLines]
        : frozenEvidence.map((ref) => {
            const rec = graph.resolveRecord(ref);
            return rec
              ? formatRecordEvidenceLine(rec)
              : `${ref.domain} ${ref.usubjid} #${ref.seq}`;
          });

    const entry: Decision = {
      decision_id,
      cut: params.cut,
      kind: params.kind,
      what: params.what,
      plain_what: params.plain_what || params.what,
      evidence: frozenEvidence,
      evidence_lines: frozenEvidenceLines,
      alternatives: [...params.alternatives],
      why: params.why,
      node: params.node,
      timestamp:
        params.timestamp ||
        `2025-${String(Math.min(12, Math.max(1, params.cut))).padStart(2, '0')}-15T09:${String(
          this.seq % 60
        ).padStart(2, '0')}:00Z`,
      subject: params.subject,
      site: params.site,
      code: params.code,
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Mark earlier decisions whose underlying finding was undone by a correction at `cut`
   * as "superseded by correction at cut N" while keeping them in the append-only ledger.
   */
  public markSupersededByCorrection(
    subject: string,
    code: string,
    cut: number
  ): Decision[] {
    const affected: Decision[] = [];
    for (const d of this.entries) {
      if (
        d.cut < cut &&
        d.subject === subject &&
        d.code === code &&
        !d.superseded_by_cut
      ) {
        d.superseded_by_cut = cut;
        d.superseded_reason = `superseded by correction at cut ${cut}`;
        affected.push(d);
      }
    }
    return affected;
  }

  /**
   * Read the ledger entry back verbatim (NEVER calls a model, NEVER regenerates).
   * Computes `consistent_with_trace`:
   * Every RecordRef in `decision.evidence` must resolve to a real record in `graph`
   * AND match the ReviewCrew trace / ledger provenance.
   */
  public explain(
    decisionId: string,
    graph: StudyGraph,
    traces: TraceEntry[]
  ): Explanation | null {
    const d = this.entries.find((item) => item.decision_id === decisionId);
    if (!d) return null;

    let resolvedCount = 0;
    for (const ref of d.evidence) {
      const rec = graph.resolveRecord(ref);
      if (rec && rec.usubjid === ref.usubjid && rec.seq === ref.seq) {
        resolvedCount++;
      }
    }

    const allRecordsResolved = resolvedCount === d.evidence.length;

    // Verify trace correspondence: check if trace entries for that cut & node exist and include the cited refs
    const matchingTraces = traces.filter(
      (t) => t.cut === d.cut && (t.node === d.node || d.node === 'watch_governor')
    );

    let traceEntryFound = d.node === 'watch_governor' || matchingTraces.length > 0;
    if (d.evidence.length > 0 && matchingTraces.length > 0) {
      const traceRefKeys = new Set(
        matchingTraces.flatMap((t) =>
          t.evidence.map((r) => `${r.domain.toUpperCase()}|${r.usubjid}|${r.seq}`)
        )
      );
      const everyRefInTrace = d.evidence.every((r) =>
        traceRefKeys.has(`${r.domain.toUpperCase()}|${r.usubjid}|${r.seq}`)
      );
      traceEntryFound = everyRefInTrace;
    }

    const ledgerImmutableCheck =
      d.evidence_lines.length >= d.evidence.length && Boolean(d.what) && Boolean(d.why);

    const consistent_with_trace =
      allRecordsResolved && traceEntryFound && ledgerImmutableCheck;

    return {
      decision_id: d.decision_id,
      what: d.what,
      plain_what: d.plain_what,
      kind: d.kind,
      cut: d.cut,
      node: d.node,
      timestamp: d.timestamp,
      evidence: d.evidence.map((r) => ({ ...r })),
      evidence_lines: [...d.evidence_lines],
      alternatives: [...d.alternatives],
      why: d.why,
      consistent_with_trace,
      superseded_by_cut: d.superseded_by_cut,
      verification_details: {
        allRecordsResolved,
        resolvedCount,
        totalRefs: d.evidence.length,
        traceEntryFound,
        ledgerImmutableCheck,
      },
    };
  }
}
