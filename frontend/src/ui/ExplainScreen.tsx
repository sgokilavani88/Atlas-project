import React, { useMemo, useState } from 'react';
import {
  Decision,
  Explanation,
  RecordRef,
  SurveillanceReport,
} from '../engine/schema';
import { StudyWatch } from '../engine/watch/studyWatch';
import { CitationChip } from './RecordDrawer';
import { formatDecisionKind, formatNodeName } from './labels';
import {
  ShieldCheck,
  ShieldAlert,
  Scale,
  Shuffle,
  X,
  CheckCircle2,
  History,
  FileSearch,
} from 'lucide-react';

interface Props {
  report: SurveillanceReport;
  watch: StudyWatch;
  onInspectRecord: (ref: RecordRef) => void;
  plainEnglish: boolean;
}

export const ExplainScreen: React.FC<Props> = ({
  report,
  watch,
  onInspectRecord,
  plainEnglish,
}) => {
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>(
    report.ledger[0]?.decision_id || ''
  );
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [judgeModeOpen, setJudgeModeOpen] = useState(false);
  const [judgeDecisionIds, setJudgeDecisionIds] = useState<string[]>([]);

  const filteredDecisions = useMemo(() => {
    if (kindFilter === 'ALL') return report.ledger;
    return report.ledger.filter((d) => d.kind === kindFilter);
  }, [report.ledger, kindFilter]);

  const activeId =
    report.ledger.some((d) => d.decision_id === selectedDecisionId)
      ? selectedDecisionId
      : report.ledger[0]?.decision_id || '';

  const activeExplanation: Explanation | null = useMemo(
    () => (activeId ? watch.explain(activeId) : null),
    [watch, activeId, report]
  );

  const pickThreeRandomDecisions = () => {
    const pool = [...report.ledger];
    const picked: string[] = [];
    while (picked.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx].decision_id);
      pool.splice(idx, 1);
    }
    setJudgeDecisionIds(picked);
    setJudgeModeOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-8">
      {/* Header + Judge Mode Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div>
          <h1 className="font-serif text-2xl text-[#2C4675]">
            {plainEnglish
              ? 'Decision Ledger & Verbatim Evidence Readback'
              : 'Append-Only Decision Ledger & explain(decisionId) Verification'}
          </h1>
          <p className="mt-0.5 text-xs text-[#4263A0]">
            {plainEnglish
              ? 'Evidence is recorded at the exact moment a decision is made and read back verbatim later — never reconstructed afterwards.'
              : 'Zero LLM regeneration in explain(): reads frozen evidence_lines and computes consistent_with_trace against StudyGraph.'}
          </p>
        </div>

        <button
          type="button"
          onClick={pickThreeRandomDecisions}
          className="inline-flex items-center gap-2 rounded-xl bg-[#3F68A8] px-6 py-3 font-serif text-sm font-bold tracking-wider text-white uppercase shadow-md transition-all hover:bg-[#32548A]"
        >
          <Scale className="h-4 w-4" />
          <span>Judge Mode (Pick 3 Random Decisions)</span>
        </button>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#4263A0]/20 bg-white/65 p-2 backdrop-blur-md">
        {[
          { id: 'ALL', label: `All Decisions (${report.ledger.length})` },
          { id: 'clinical_escalation', label: 'Clinical Escalation' },
          { id: 'data_integrity', label: 'Data Integrity' },
          { id: 'quarantine', label: 'Site Quarantine' },
          { id: 'tamper', label: 'Tamper Blocked' },
          { id: 'standing_limits', label: 'Standing Limits' },
          { id: 'degradation', label: 'Budget Degradation' },
          { id: 'deviation', label: 'Protocol Deviation' },
          { id: 'query', label: 'Data Query' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setKindFilter(f.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              kindFilter === f.id
                ? 'bg-[#3F68A8] text-white shadow-2xs'
                : 'text-[#2C4675] hover:bg-white/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Split View: Left Ledger List (5 cols) + Right Verbatim Explanation (7 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Decision List */}
        <div className="max-h-[680px] space-y-2.5 overflow-y-auto rounded-2xl border border-[#4263A0]/25 bg-white/75 p-5 shadow-xs backdrop-blur-md lg:col-span-5">
          {filteredDecisions.map((d: Decision) => {
            const isSelected = d.decision_id === activeId;
            return (
              <button
                key={d.decision_id}
                type="button"
                onClick={() => setSelectedDecisionId(d.decision_id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-[#3F68A8] bg-[#3F68A8] text-white shadow-sm'
                    : 'border-[#4263A0]/20 bg-white/85 text-[#2C4675] hover:bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                  <span className="font-bold">
                    {d.decision_id} · Cut {d.cut}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E6F0EC] text-[#2C4675]'
                    }`}
                  >
                    {formatDecisionKind(d.kind, plainEnglish)}
                  </span>
                </div>

                <div className="mt-1.5 font-serif text-sm font-medium">
                  {plainEnglish ? d.plain_what : d.what}
                </div>

                {d.superseded_by_cut && (
                  <div
                    className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      isSelected
                        ? 'bg-amber-300 text-[#92400E]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    <History className="h-3 w-3" />
                    <span>superseded by correction at cut {d.superseded_by_cut}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Verbatim Explanation Inspector */}
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md lg:col-span-7">
          {activeExplanation ? (
            <div className="space-y-6">
              {/* Top Verified Seal */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#4263A0]/15 pb-4">
                <div>
                  <div className="font-mono text-xs text-[#4263A0]">
                    explain(&quot;{activeExplanation.decision_id}&quot;) · Cut{' '}
                    {activeExplanation.cut} · Node:{' '}
                    {formatNodeName(activeExplanation.node || '', plainEnglish)}
                  </div>
                  <h2 className="mt-1 font-serif text-2xl text-[#2C4675]">
                    Decision {activeExplanation.decision_id} Audit Proof
                  </h2>
                </div>

                {/* Computed consistent_with_trace Seal */}
                {activeExplanation.consistent_with_trace ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-[#84E1BC] bg-[#DEF7EC] px-4 py-2.5 text-[#1E4620] shadow-2xs">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="font-serif text-sm font-bold">
                        Verified against trace
                      </div>
                      <div className="font-mono text-[10px]">
                        {activeExplanation.verification_details.resolvedCount}/
                        {activeExplanation.verification_details.totalRefs} RecordRefs resolved ·
                        0 LLM calls
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-[#F8B4B4] bg-[#FDE8E8] px-4 py-2.5 text-[#9B2C2C]">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="font-serif text-sm font-bold">
                        Trace Mismatch Detected
                      </div>
                      <div className="font-mono text-[10px]">
                        Unresolved RecordRef or missing trace entry
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {activeExplanation.superseded_by_cut && (
                <div className="rounded-xl border border-[#FCD34D] bg-[#FEF3C7] p-3.5 text-xs text-[#92400E]">
                  <strong>Self-Correcting Data Log:</strong> This decision from Cut{' '}
                  {activeExplanation.cut} was{' '}
                  <strong>
                    superseded by correction at cut {activeExplanation.superseded_by_cut}
                  </strong>{' '}
                  when updated source data resolved the underlying discrepancy. Preserved in
                  append-only audit history.
                </div>
              )}

              {/* 1. WHAT */}
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-[#4263A0] uppercase">
                  1. What Was Decided
                </h3>
                <p className="mt-1.5 font-serif text-lg text-[#2C4675]">
                  {plainEnglish
                    ? activeExplanation.plain_what || activeExplanation.what
                    : activeExplanation.what}
                </p>
              </div>

              {/* 2. EVIDENCE (RecordRef[] + Frozen Evidence Lines) */}
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-[#4263A0] uppercase">
                  2. Evidence Recorded at Decision Time (Verbatim Readback)
                </h3>
                <div className="mt-2 space-y-2 rounded-xl border border-[#4263A0]/20 bg-[#E6F0EC]/70 p-4">
                  {activeExplanation.evidence_lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4263A0]/10 pb-2 last:border-none last:pb-0"
                    >
                      <code className="font-mono text-xs font-semibold text-[#2C4675]">
                        {line}
                      </code>
                      {activeExplanation.evidence[idx] && (
                        <CitationChip
                          recordRef={activeExplanation.evidence[idx]}
                          onInspect={onInspectRecord}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. ALTERNATIVES CONSIDERED */}
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-[#4263A0] uppercase">
                  3. Alternatives Considered &amp; Rejected
                </h3>
                <ul className="mt-2 space-y-2">
                  {activeExplanation.alternatives.map((alt, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl border border-[#4263A0]/15 bg-white/90 p-3 text-xs text-[#2C4675]"
                    >
                      • {alt}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 4. WHY */}
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-[#4263A0] uppercase">
                  4. Why This Decision Was Taken
                </h3>
                <p className="mt-1.5 rounded-xl border border-[#4263A0]/15 bg-white/90 p-4 text-sm leading-relaxed text-[#2C4675]">
                  {activeExplanation.why}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* =====================================================================
          FULL-SCREEN JUDGE MODE MODAL (3 RANDOM DECISIONS, BIG & READABLE)
         ===================================================================== */}
      {judgeModeOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-[#E6F0EC] to-[#BFE4E2] p-6 md:p-12"
          role="dialog"
          aria-modal="true"
          aria-label="Judge Mode — 3 Random Decisions Full-Screen Audit"
        >
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#4263A0]/25 pb-6">
              <div>
                <div className="font-mono text-xs font-bold tracking-widest text-[#3F68A8] uppercase">
                  STUDY SENTINEL · LIVE AUDIT VERIFICATION
                </div>
                <h2 className="mt-1 font-serif text-4xl text-[#2C4675]">
                  Judge Mode: Three Random Decisions
                </h2>
                <p className="mt-1 text-sm text-[#4263A0]">
                  Read back verbatim from the Decision Ledger with computed{' '}
                  <span className="font-mono">consistent_with_trace</span> verification.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={pickThreeRandomDecisions}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#3F68A8] px-5 py-3 text-xs font-semibold tracking-wider text-white uppercase shadow-sm hover:bg-[#32548A]"
                >
                  <Shuffle className="h-4 w-4" />
                  <span>Pick 3 New Random Decisions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJudgeModeOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#4263A0]/30 bg-white/85 px-5 py-3 text-xs font-semibold text-[#2C4675] hover:bg-white"
                >
                  <X className="h-4 w-4" />
                  <span>Exit Judge Mode</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {judgeDecisionIds.map((id) => {
                const exp = watch.explain(id);
                if (!exp) return null;
                return (
                  <div
                    key={id}
                    className="flex flex-col justify-between rounded-3xl border border-[#4263A0]/30 bg-white/85 p-7 shadow-lg backdrop-blur-md"
                  >
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-bold text-[#3F68A8]">
                          {exp.decision_id} (Cut {exp.cut})
                        </span>
                        {exp.consistent_with_trace && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#84E1BC] bg-[#DEF7EC] px-3 py-1 font-mono text-xs font-bold text-[#1E4620]">
                            <CheckCircle2 className="h-4 w-4" />
                            Verified against trace
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold tracking-wider text-[#4263A0] uppercase">
                          What
                        </div>
                        <h3 className="mt-1 font-serif text-2xl leading-snug text-[#2C4675]">
                          {plainEnglish ? exp.plain_what || exp.what : exp.what}
                        </h3>
                      </div>

                      <div>
                        <div className="text-xs font-bold tracking-wider text-[#4263A0] uppercase">
                          Evidence Lines (Frozen at Decision Time)
                        </div>
                        <div className="mt-2 space-y-2 rounded-2xl bg-[#E6F0EC] p-4 font-mono text-xs text-[#2C4675]">
                          {exp.evidence_lines.map((line, idx) => (
                            <div key={idx} className="leading-relaxed">
                              {line}
                            </div>
                          ))}
                        </div>
                        {exp.evidence.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {exp.evidence.map((ref, idx) => (
                              <CitationChip
                                key={idx}
                                recordRef={ref}
                                onInspect={onInspectRecord}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold tracking-wider text-[#4263A0] uppercase">
                          Alternatives Considered
                        </div>
                        <ul className="mt-1.5 space-y-1.5 text-sm text-[#2C4675]">
                          {exp.alternatives.map((a, idx) => (
                            <li key={idx}>• {a}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-xs font-bold tracking-wider text-[#4263A0] uppercase">
                          Why
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[#2C4675]">
                          {exp.why}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
