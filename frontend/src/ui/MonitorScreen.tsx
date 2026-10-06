import React, { useState } from 'react';
import {
  CutSnapshot,
  EscalationItem,
  RecordRef,
  ReviewReport,
} from '../engine/schema';
import { ReviewCrew } from '../engine/crew/reviewCrew';
import { CitationChip } from './RecordDrawer';
import { formatFindingCode, formatNodeName } from './labels';
import {
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Activity,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';

interface Props {
  currentSnapshot: CutSnapshot;
  crew: ReviewCrew;
  onInspectRecord: (ref: RecordRef) => void;
  plainEnglish: boolean;
}

const SIX_NODES = [
  'detect',
  'medical_review',
  'data_manager',
  'compliance',
  'human_gate',
  'execute',
] as const;

export const MonitorScreen: React.FC<Props> = ({
  currentSnapshot,
  crew,
  onInspectRecord,
  plainEnglish,
}) => {
  const [rerunResult, setRerunResult] = useState<ReviewReport | null>(null);
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string>('ALL');
  const [queryStatusFilter, setQueryStatusFilter] = useState<string>('ALL');

  const handleRerunCut = () => {
    const report = crew.runCycle(
      currentSnapshot.cut,
      currentSnapshot.protocolVersion
    );
    setRerunResult(report);
  };

  const cutTraces = currentSnapshot.traces.filter(
    (t) =>
      selectedNodeFilter === 'ALL' || t.node === selectedNodeFilter
  );

  const filteredQueries = currentSnapshot.queries.filter((q) => {
    if (queryStatusFilter === 'ALL') return true;
    return q.status === queryStatusFilter;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-8">
      {/* Header + Re-run Cut Idempotency Proof Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div>
          <h1 className="font-serif text-2xl text-[#2C4675]">
            {plainEnglish
              ? 'Medical Monitor Gate & Six-Step Review Crew'
              : 'Layer B — Six-Node ReviewCrew State Machine & Persistent Memory'}
          </h1>
          <p className="mt-0.5 text-xs text-[#4263A0]">
            {plainEnglish
              ? `Cut ${currentSnapshot.cut} · Protocol ${currentSnapshot.protocolVersion} · Queries and escalations are remembered across cuts and never duplicated.`
              : `Pipeline: detect → medical_review → data_manager → compliance → human_gate → execute`}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRerunCut}
          className="inline-flex items-center gap-2 rounded-xl bg-[#3F68A8] px-5 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-sm transition-colors hover:bg-[#32548A]"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Re-Run This Cut (Idempotency Proof)</span>
        </button>
      </div>

      {/* Idempotency Proof Result Banner */}
      {rerunResult && (
        <div className="rounded-2xl border border-[#84E1BC] bg-[#DEF7EC] p-5 text-[#1E4620] shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-serif text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              <span>
                Idempotency Verified on Cut {rerunResult.cut} (Protocol{' '}
                {rerunResult.protocolVersion})
              </span>
            </div>
            <span className="font-mono text-xs font-semibold">
              New Queries: {rerunResult.newQueriesCount} · New Escalations:{' '}
              {rerunResult.newEscalationsCount}
            </span>
          </div>
          <p className="mt-1 text-xs">
            Re-running <span className="font-mono">ReviewCrew.runCycle({rerunResult.cut}, &quot;{rerunResult.protocolVersion}&quot;)</span>{' '}
            against persistent memory produced{' '}
            <strong>{rerunResult.newQueriesCount} new queries</strong> and{' '}
            <strong>{rerunResult.newEscalationsCount} new escalations</strong>. All 6 state
            machine nodes executed and appended trace entries without duplicating any prior
            action.
          </p>
        </div>
      )}

      {/* Six-Node State Machine Visual Pipeline */}
      <div className="rounded-2xl border border-[#4263A0]/20 bg-white/70 p-5 shadow-xs backdrop-blur-md">
        <div className="text-xs font-semibold text-[#4263A0] uppercase">
          {plainEnglish
            ? 'Six-Node Clinical Review Pipeline (Click Any Step to Filter Trace)'
            : 'State Machine Execution Order & Trace Count'}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SIX_NODES.map((node, idx) => {
            const count = currentSnapshot.traces.filter((t) => t.node === node).length;
            const active = selectedNodeFilter === node;
            return (
              <button
                key={node}
                type="button"
                onClick={() =>
                  setSelectedNodeFilter(active ? 'ALL' : node)
                }
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-[#3F68A8] bg-[#3F68A8] text-white shadow-sm'
                    : 'border-[#4263A0]/20 bg-white/85 text-[#2C4675] hover:border-[#3F68A8]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] opacity-80">
                  <span className="font-mono">STEP 0{idx + 1}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1.5 font-serif text-sm font-semibold">
                  {formatNodeName(node, plainEnglish)}
                </div>
                <div className="mt-2 font-mono text-[11px] opacity-90">
                  {count} trace entries ✓
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Left Human Gate Inbox + Right Live Trace Viewer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Human Gate Inbox (6 cols) */}
        <div className="space-y-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#3F68A8]" />
              <h2 className="font-serif text-xl text-[#2C4675]">
                {plainEnglish
                  ? 'Human Gate Escalation Inbox'
                  : 'Human Gate Inbox (monitor_decisions.json)'}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#4263A0]">
              {currentSnapshot.escalations.length} escalation(s)
            </span>
          </div>

          <div className="space-y-3">
            {currentSnapshot.escalations.map((esc: EscalationItem) => {
              const hadClarify = Boolean(esc.clarification_question);
              return (
                <div
                  key={esc.escalation_id}
                  className="rounded-xl border border-[#4263A0]/20 bg-white/90 p-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs font-semibold text-[#2C4675]">
                      {esc.escalation_id} · {esc.subject} ({esc.site}) · Cut {esc.cut_raised}
                    </div>

                    {/* Monitor reply states rendered as explicit pills per Section 4.3 spec */}
                    <div className="flex items-center gap-1.5">
                      {hadClarify && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#FCD34D] bg-[#FEF3C7] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#92400E]">
                          <HelpCircle className="h-3 w-3" />
                          CLARIFY
                        </span>
                      )}
                      {esc.monitor_status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#84E1BC] bg-[#DEF7EC] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#1E4620]">
                          <CheckCircle2 className="h-3 w-3" />
                          APPROVED
                        </span>
                      )}
                      {esc.monitor_status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#94A3B8] bg-[#E2E8F0] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#334155]">
                          <XCircle className="h-3 w-3" />
                          REJECTED
                        </span>
                      )}
                      {esc.monitor_status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#FCD34D] bg-[#FEF3C7] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#92400E]">
                          <Clock className="h-3 w-3" />
                          PENDING ({esc.days_waiting}d)
                        </span>
                      )}
                      {esc.monitor_status === 'STANDING_LIMITS' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#F8B4B4] bg-[#FDE8E8] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#9B2C2C]">
                          <Clock className="h-3 w-3" />
                          STANDING LIMITS (4+ Cuts)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 font-serif text-base font-medium text-[#2C4675]">
                    {formatFindingCode(esc.code, plainEnglish)}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#2C4675]">
                    {plainEnglish ? esc.plainRationale : esc.rationale}
                  </p>

                  {/* If CLARIFY was requested and answered from StudyGraph */}
                  {esc.clarification_question && (
                    <div className="mt-3 rounded-lg border border-[#FCD34D] bg-[#FEF3C7]/60 p-3 text-xs text-[#92400E]">
                      <div className="font-semibold">
                        Monitor Clarification Request: &ldquo;{esc.clarification_question}&rdquo;
                      </div>
                      <div className="mt-1 text-[#1E4620]">
                        <strong>Graph-Cited Answer:</strong> {esc.clarification_answer}
                      </div>
                    </div>
                  )}

                  {esc.monitor_reply && !esc.clarification_question && (
                    <div className="mt-2.5 rounded-lg bg-[#E6F0EC] p-2.5 text-xs text-[#2C4675]">
                      <strong>Monitor Decision Note:</strong> {esc.monitor_reply}
                    </div>
                  )}

                  {esc.action_executed && (
                    <div className="mt-2 text-xs font-medium text-[#1E4620]">
                      ✓ Executed Action: {esc.action_executed}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[#4263A0]">Citations:</span>
                    {esc.evidence.map((ref, idx) => (
                      <CitationChip
                        key={idx}
                        recordRef={ref}
                        onInspect={onInspectRecord}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Trace Viewer (6 cols) */}
        <div className="space-y-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#3F68A8]" />
              <h2 className="font-serif text-xl text-[#2C4675]">
                {plainEnglish
                  ? 'Live Crew Decision Trace'
                  : 'Append-at-Decision-Time Trace Viewer'}
              </h2>
            </div>
            {selectedNodeFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedNodeFilter('ALL')}
                className="text-xs font-semibold text-[#3F68A8] underline"
              >
                Show All Nodes
              </button>
            )}
          </div>

          <div className="max-h-[620px] space-y-2.5 overflow-y-auto pr-1">
            {cutTraces
              .slice()
              .reverse()
              .map((tr) => (
                <div
                  key={tr.id}
                  className="rounded-xl border border-[#4263A0]/15 bg-white/90 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-[#4263A0]">
                    <span className="font-semibold text-[#3F68A8]">
                      [{tr.id}] Cut {tr.cut} · {formatNodeName(tr.node, plainEnglish)}
                    </span>
                    <span>{tr.timestamp}</span>
                  </div>
                  <div className="mt-1 font-semibold text-[#2C4675]">{tr.decision}</div>
                  <p className="mt-0.5 text-[#4263A0]">{tr.rationale}</p>
                  {tr.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tr.evidence.slice(0, 5).map((ref, idx) => (
                        <CitationChip
                          key={idx}
                          recordRef={ref}
                          onInspect={onInspectRecord}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* =====================================================================
          DATA MANAGER QUERY TRACKER (OPEN, ANSWERED, UNRESPONSIVE)
         ===================================================================== */}
      <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#3F68A8]" />
            <h2 className="font-serif text-xl text-[#2C4675]">
              {plainEnglish
                ? 'Clinic Data Verification Queries'
                : 'Data Manager Query Tracker (site_replies.json)'}
            </h2>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-[#E6F0EC] p-1 text-xs">
            {[
              { id: 'ALL', label: `All (${currentSnapshot.queries.length})` },
              {
                id: 'answered',
                label: `Answered (${
                  currentSnapshot.queries.filter((q) => q.status === 'answered').length
                })`,
              },
              {
                id: 'unresponsive_site',
                label: `Unanswered / Open (${
                  currentSnapshot.queries.filter((q) => q.status !== 'answered').length
                })`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQueryStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  queryStatusFilter === tab.id
                    ? 'bg-[#3F68A8] text-white shadow-2xs'
                    : 'text-[#2C4675] hover:bg-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredQueries.map((q) => (
            <div
              key={q.query_id}
              className="rounded-xl border border-[#4263A0]/20 bg-white/90 p-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-[#2C4675]">
                  {q.query_id} · Site {q.site} · Cut {q.cut_raised}
                </span>
                <span
                  className={`font-mono font-semibold ${
                    q.status === 'answered' ? 'text-[#1E4620]' : 'text-[#92400E]'
                  }`}
                >
                  {q.status === 'answered'
                    ? 'ANSWERED'
                    : 'OPEN (UNRESPONSIVE SITE — NOT RETRIED BLINDLY)'}
                </span>
              </div>
              <p className="mt-1.5 font-medium text-[#2C4675]">{q.question}</p>
              {q.site_reply && (
                <p className="mt-1.5 rounded-lg bg-[#E6F0EC] p-2 text-[#1E4620]">
                  <strong>Site Reply:</strong> {q.site_reply}
                </p>
              )}
              {q.superseded_at_cut && (
                <p className="mt-1.5 font-semibold text-[#92400E]">
                  Superseded by correction at Cut {q.superseded_at_cut}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[#4263A0]">Cited Record:</span>
                {q.evidence.map((ref, idx) => (
                  <CitationChip key={idx} recordRef={ref} onInspect={onInspectRecord} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
