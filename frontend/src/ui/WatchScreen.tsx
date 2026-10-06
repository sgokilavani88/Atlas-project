import React, { useState } from 'react';
import {
  AdversarialEvent,
  CutSnapshot,
  RecordRef,
  SurveillanceReport,
} from '../engine/schema';
import { CitationChip } from './RecordDrawer';
import { getSeverityBadgeClass } from './labels';
import {
  Clock,
  ShieldAlert,
  Gauge,
  AlertTriangle,
  Lock,
  Sliders,
  CheckCircle2,
  FileWarning,
  Info,
} from 'lucide-react';

interface Props {
  report: SurveillanceReport;
  currentCut: number;
  onSelectCut: (cut: number) => void;
  monitorDelayCuts: number;
  monitorResponseRate: number;
  onUpdateSimulationParams: (params: {
    delayCuts: number;
    responseRate: number;
    totalTokensBudget?: number;
  }) => void;
  onRunTightBudgetStressTest: () => void;
  onRestoreNormalBudget: () => void;
  onInspectRecord: (ref: RecordRef) => void;
  plainEnglish: boolean;
}

const NEVER_WITHOUT_APPROVAL_LIST = [
  'Holding, interrupting, or modifying a subject’s study drug dosing regimen',
  'Submitting expedited regulatory safety reports (FDA IND / EMA SUSAR)',
  'Suspending clinical site enrollment or closing an investigative site',
  'Unblinding randomized treatment assignment for any enrolled subject',
];

export const WatchScreen: React.FC<Props> = ({
  report,
  currentCut,
  onSelectCut,
  monitorDelayCuts,
  monitorResponseRate,
  onUpdateSimulationParams,
  onRunTightBudgetStressTest,
  onRestoreNormalBudget,
  onInspectRecord,
  plainEnglish,
}) => {
  const snapshot: CutSnapshot =
    report.snapshots.get(currentCut) ||
    report.snapshots.get(report.currentCut)!;

  const [selectedAdversarial, setSelectedAdversarial] =
    useState<AdversarialEvent | null>(() => {
      const unitEv = report.adversarialEvents.find(
        (a) => a.kind === 'unit_corruption'
      );
      return unitEv || report.adversarialEvents[0] || null;
    });

  const cutsList = Array.from(report.snapshots.keys()).sort((a, b) => a - b);
  const budgetPct = Math.min(
    100,
    Math.round(
      (snapshot.budget.usedTokens /
        Math.max(1, snapshot.budget.totalTokensBudget)) *
        100
    )
  );

  const unitCorruptionEvent =
    snapshot.adversarialEvents.find((a) => a.kind === 'unit_corruption') ||
    report.adversarialEvents.find((a) => a.kind === 'unit_corruption');

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-8">
      {/* Graceful Degradation Banner when Budget Governor > 80% */}
      {snapshot.budget.tier === 'degraded' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#FCD34D] bg-[#FEF3C7] px-6 py-4 text-[#92400E] shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-serif text-lg font-semibold">
                {plainEnglish
                  ? `Budget Safeguard Active (Triggered at Cut ${snapshot.budget.degradedAtCut}) — All Patient Safety Checks Running`
                  : `Graceful Degradation Active (>80% Token Budget Reached at Cut ${snapshot.budget.degradedAtCut})`}
              </div>
              <p className="text-xs">
                Narrative prose generation is paused ({snapshot.budget.callsBlockedByGovernor} calls
                gated), while 100% of deterministic clinical, compliance, and adversarial safety
                checks continue through Cut 12 without going silent.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRestoreNormalBudget}
            className="rounded-xl border border-[#92400E]/30 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#92400E] hover:bg-white"
          >
            Restore Standard 6,000 Token Budget
          </button>
        </div>
      )}

      {/* =====================================================================
          12-CUT TIMELINE SCRUBBER WITH SIGNAL MARKERS
         ===================================================================== */}
      <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl text-[#2C4675]">
              {plainEnglish
                ? `12-Cut Longitudinal Study Watch (Viewing Cut ${currentCut} of ${cutsList.length})`
                : `Layer C — StudyWatch 12-Cut Scrubber · Cut ${currentCut} (${snapshot.date})`}
            </h1>
            <p className="text-xs text-[#4263A0]">
              Scrub across cuts 1–12 to inspect incremental state, protocol amendments, site
              quarantines, and standing limits as of that exact cut.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#E6F0EC] px-3 py-1.5 font-mono text-xs font-semibold text-[#2C4675]">
              Protocol {snapshot.protocolVersion} · {snapshot.findings.length} Active Signals ·{' '}
              {snapshot.decisions.length} Ledger Decisions
            </span>
          </div>
        </div>

        {/* Range Scrubber */}
        <div className="mt-5">
          <input
            type="range"
            min={1}
            max={cutsList.length || 12}
            value={currentCut}
            onChange={(e) => onSelectCut(Number(e.target.value))}
            aria-label="Scrub study cut 1 to 12"
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#4263A0]/25 accent-[#3F68A8]"
          />

          {/* 12 Cut Marker Buttons */}
          <div className="mt-3 grid grid-cols-6 gap-2 md:grid-cols-12">
            {cutsList.map((c) => {
              const snap = report.snapshots.get(c)!;
              const newSignalsAtCut = snap.findings.filter((f) => f.cut === c).length;
              const advAtCut = snap.adversarialEvents.filter((a) => a.cut === c).length;
              const isSelected = c === currentCut;

              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSelectCut(c)}
                  className={`flex flex-col items-center rounded-xl border p-2.5 text-center transition-all ${
                    isSelected
                      ? 'border-[#3F68A8] bg-[#3F68A8] text-white shadow-sm'
                      : 'border-[#4263A0]/20 bg-white/80 text-[#2C4675] hover:border-[#3F68A8]'
                  }`}
                >
                  <span className="font-mono text-xs font-bold">Cut {c}</span>
                  <span className="mt-0.5 font-mono text-[10px] opacity-80">
                    {snap.protocolVersion}
                  </span>
                  <div className="mt-1.5 flex items-center gap-1">
                    {newSignalsAtCut > 0 && (
                      <span
                        className={`rounded px-1 text-[10px] font-bold ${
                          isSelected
                            ? 'bg-white/25 text-white'
                            : 'bg-[#FDE8E8] text-[#9B2C2C]'
                        }`}
                        title={`${newSignalsAtCut} clinical/compliance signal(s) at Cut ${c}`}
                      >
                        +{newSignalsAtCut}
                      </span>
                    )}
                    {advAtCut > 0 && (
                      <span
                        className={`rounded px-1 text-[10px] font-bold ${
                          isSelected
                            ? 'bg-white/25 text-white'
                            : 'bg-[#FEF3C7] text-[#92400E]'
                        }`}
                        title={`${advAtCut} adversarial/amendment event(s) at Cut ${c}`}
                      >
                        ⚡{advAtCut}
                      </span>
                    )}
                    {newSignalsAtCut === 0 && advAtCut === 0 && (
                      <span className="font-mono text-[10px] opacity-50">—</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 2: SITE-RISK RANKING HEATMAP + BUDGET GOVERNOR RING
         ===================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Site-Risk Ranking & 12-Cut Signal Heatmap (8 cols) */}
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-xl text-[#2C4675]">
                {plainEnglish
                  ? 'Clinic Site Risk Ranking & 12-Cut Signal Heatmap'
                  : 'Site-Risk Ranking, Regularity Metrics & Per-Cut Signal Heatmap'}
              </h2>
              <p className="text-xs text-[#4263A0]">
                Tracks site onboarding cut, quarantine status, untrusted lab feeds, and signal
                density across cuts 1–12.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table
              className="w-full text-left text-xs"
              aria-label="Clinical site risk ranking and signal heatmap"
            >
              <thead>
                <tr className="border-b border-[#4263A0]/20 font-mono text-[11px] text-[#4263A0] uppercase">
                  <th className="pb-2.5 pr-3">Site</th>
                  <th className="pb-2.5 pr-3">Status &amp; Onboarding</th>
                  <th className="pb-2.5 pr-3">Regularity (Wkd / SD)</th>
                  <th className="pb-2.5 pr-3">Risk</th>
                  <th className="pb-2.5">Cuts 1..12 Signal Heatmap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4263A0]/10">
                {snapshot.siteProfiles.map((sp) => (
                  <tr key={sp.site} className="hover:bg-white/50">
                    <td className="py-3 pr-3 font-mono font-bold text-[#2C4675]">
                      {sp.site}
                      <div className="font-sans text-[11px] font-normal text-[#4263A0]">
                        {sp.subjectCount} subj · {sp.openQueries} open qry
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {sp.onboardedAtCut > 1 && (
                          <span className="rounded-md border border-[#FCD34D] bg-[#FEF3C7] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#92400E]">
                            Onboarded at Cut {sp.onboardedAtCut}
                          </span>
                        )}
                        {sp.quarantined && (
                          <span className="rounded-md border border-[#94A3B8] bg-[#E2E8F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#334155]">
                            QUARANTINED (Cut {sp.quarantinedAtCut})
                          </span>
                        )}
                        {sp.untrustedTests.length > 0 && (
                          <span className="rounded-md border border-[#94A3B8] bg-[#E2E8F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#334155]">
                            UNTRUSTED: {sp.untrustedTests.join(', ')}
                          </span>
                        )}
                        {!sp.quarantined &&
                          sp.untrustedTests.length === 0 &&
                          sp.onboardedAtCut === 1 && (
                            <span className="text-[#1E4620]">Active Surveillance</span>
                          )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[11px] tabular-nums">
                      <div>Wkd: {(sp.weekdayConcentration * 100).toFixed(0)}%</div>
                      <div className="text-[#4263A0]">BP SD: {sp.vitalsStdDev} mmHg</div>
                    </td>
                    <td className="py-3 pr-3 font-mono font-semibold tabular-nums">
                      <span
                        className={`inline-block rounded-md border px-2 py-0.5 text-[11px] ${getSeverityBadgeClass(
                          sp.riskLevel
                        )}`}
                      >
                        {sp.riskScore}/100
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {cutsList.map((c) => {
                          const count = sp.perCutSignals[c] || 0;
                          const cellClass =
                            c > currentCut
                              ? 'bg-[#E2E8F0]/40 text-transparent'
                              : count >= 2
                              ? 'bg-[#C53030] text-white'
                              : count === 1
                              ? 'bg-[#D97706] text-white'
                              : 'bg-[#DEF7EC] text-[#1E4620]';
                          return (
                            <div
                              key={c}
                              title={`Site ${sp.site} · Cut ${c}: ${count} signal(s)`}
                              className={`flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-bold ${cellClass}`}
                            >
                              {c <= currentCut ? count : ''}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Budget Governor Ring & Tight Budget Stress Test (4 cols) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-[#3F68A8]" />
                <h2 className="font-serif text-xl text-[#2C4675]">Budget Governor</h2>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                  snapshot.budget.tier === 'degraded'
                    ? 'border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]'
                    : 'border-[#84E1BC] bg-[#DEF7EC] text-[#1E4620]'
                }`}
              >
                Tier: {snapshot.budget.tier.toUpperCase()}
              </span>
            </div>

            {/* SVG Ring Gauge */}
            <div className="my-5 flex items-center justify-center gap-6">
              <div className="relative h-32 w-32">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    stroke="#E2E8F0"
                    strokeWidth="12"
                    fill="none"
                  />
                  {/* 80% threshold marker */}
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    stroke={snapshot.budget.tier === 'degraded' ? '#D97706' : '#3F68A8'}
                    strokeWidth="12"
                    strokeDasharray={`${(budgetPct / 100) * 301.6} 301.6`}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-2xl font-bold text-[#2C4675]">
                    {budgetPct}%
                  </span>
                  <span className="font-mono text-[10px] text-[#4263A0]">
                    80% Gate
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 font-mono text-xs text-[#2C4675]">
                <div>
                  <span className="text-[#4263A0]">Tokens:</span>{' '}
                  <strong>
                    {snapshot.budget.usedTokens} / {snapshot.budget.totalTokensBudget}
                  </strong>
                </div>
                <div>
                  <span className="text-[#4263A0]">Compute Time:</span>{' '}
                  <strong>{snapshot.budget.usedMs} ms</strong>
                </div>
                <div>
                  <span className="text-[#4263A0]">Prose Calls Permitted:</span>{' '}
                  <strong>{snapshot.budget.callsPermitted}</strong>
                </div>
                <div>
                  <span className="text-[#4263A0]">Blocked (&gt;80%):</span>{' '}
                  <strong>{snapshot.budget.callsBlockedByGovernor}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#4263A0]/15 pt-4">
            <button
              type="button"
              onClick={onRunTightBudgetStressTest}
              className="w-full rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs transition-colors hover:bg-[#32548A]"
            >
              Run Tight Budget Stress Test (1,500 Tokens)
            </button>
            <p className="text-[11px] text-[#4263A0]">
              Forces budget past 80% at Cut 4: verifies narrative generation stops while all 12
              cuts &amp; deterministic safety checks finish.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 3: PENDING ESCALATION CLOCK + SLOW HUMAN SLIDERS + NEVER WITHOUT APPROVAL
         ===================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Pending Escalation Clock & Slow Human Simulator (7 cols) */}
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#3F68A8]" />
              <h2 className="font-serif text-xl text-[#2C4675]">
                {plainEnglish
                  ? 'Pending-Escalation Clock & Monitor Response Simulator'
                  : 'Slow, Unreliable Human Gate Simulation & Cost of Waiting'}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#4263A0]">
              4 unanswered cuts → Standing Limits (Never Silent Approval)
            </span>
          </div>

          {/* Sliders for Monitor Delay & Response Rate */}
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-[#4263A0]/15 bg-[#E6F0EC]/70 p-4 sm:grid-cols-2">
            <div>
              <div className="flex justify-between text-xs font-medium text-[#2C4675]">
                <span>Monitor Reply Delay (Cuts Late)</span>
                <span className="font-mono font-bold">
                  {monitorDelayCuts} cuts ({monitorDelayCuts * 14} days)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                value={monitorDelayCuts}
                onChange={(e) =>
                  onUpdateSimulationParams({
                    delayCuts: Number(e.target.value),
                    responseRate: monitorResponseRate,
                  })
                }
                className="mt-2 h-1.5 w-full cursor-pointer accent-[#3F68A8]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-[#2C4675]">
                <span>Monitor Response Probability</span>
                <span className="font-mono font-bold">
                  {Math.round(monitorResponseRate * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={Math.round(monitorResponseRate * 100)}
                onChange={(e) =>
                  onUpdateSimulationParams({
                    delayCuts: monitorDelayCuts,
                    responseRate: Number(e.target.value) / 100,
                  })
                }
                className="mt-2 h-1.5 w-full cursor-pointer accent-[#3F68A8]"
              />
            </div>
          </div>

          {/* Escalation Clock Table */}
          <div className="mt-4 space-y-2.5">
            {snapshot.escalations.map((esc) => (
              <div
                key={esc.escalation_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4263A0]/15 bg-white/90 p-3.5 text-xs"
              >
                <div>
                  <div className="font-mono font-semibold text-[#2C4675]">
                    {esc.escalation_id} · {esc.subject} ({esc.site}) · Raised Cut {esc.cut_raised}
                  </div>
                  <div className="mt-0.5 text-[#4263A0]">{esc.cost_of_waiting}</div>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="rounded-md bg-[#E6F0EC] px-2.5 py-1 font-semibold text-[#2C4675]">
                    Waited: {esc.cuts_waiting} cuts ({esc.days_waiting}d)
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-1 font-bold ${
                      esc.monitor_status === 'APPROVED'
                        ? 'bg-[#DEF7EC] text-[#1E4620]'
                        : esc.monitor_status === 'STANDING_LIMITS'
                        ? 'bg-[#FDE8E8] text-[#9B2C2C]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {esc.monitor_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Visible "Never Without Approval" List (5 cols) */}
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-5">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#9B2C2C]" />
            <h2 className="font-serif text-xl text-[#2C4675]">
              Never Without Human Approval
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#4263A0]">
            An unanswered escalation must <strong>never</strong> become a silent approval. After 4
            unanswered cuts, Study Sentinel logs a <span className="font-mono">standing_limits</span>{' '}
            decision, continues enhanced surveillance, and strictly refuses the following actions:
          </p>

          <ul className="mt-4 space-y-2.5">
            {NEVER_WITHOUT_APPROVAL_LIST.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 rounded-xl border border-[#F8B4B4] bg-[#FDE8E8]/60 p-3 text-xs font-medium text-[#9B2C2C]"
              >
                <span className="font-mono font-bold">0{idx + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* =====================================================================
          ROW 4: ADVERSARIAL EVENTS STRIP + "WHY THIS WAS NOT A CLINICAL EMERGENCY" SIDE PANEL
         ===================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Adversarial Events Strip (7 cols) */}
        <div className="space-y-3 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#3F68A8]" />
              <h2 className="font-serif text-xl text-[#2C4675]">
                {plainEnglish
                  ? 'Adversarial Events, Amendments & Onboarding Strip'
                  : 'Deterministic Adversarial & Mid-Period Events Strip'}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#4263A0]">
              {snapshot.adversarialEvents.length} event(s) through Cut {currentCut}
            </span>
          </div>

          <div className="space-y-2.5">
            {snapshot.adversarialEvents.map((ev) => {
              const isSelected = selectedAdversarial?.id === ev.id;
              return (
                <div
                  key={ev.id}
                  onClick={() => setSelectedAdversarial(ev)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? 'border-[#3F68A8] bg-white shadow-sm'
                      : 'border-[#4263A0]/20 bg-white/80 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#3F68A8]">
                      Cut {ev.cut} · {ev.kind.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px] text-[#4263A0]">
                      Click to inspect details →
                    </span>
                  </div>
                  <div className="mt-1 font-serif text-base font-semibold text-[#2C4675]">
                    {plainEnglish ? ev.plainTitle : ev.title}
                  </div>
                  <p className="mt-1 text-xs text-[#2C4675]">{ev.summary}</p>
                  <div className="mt-2 text-[11px] font-medium text-[#1E4620]">
                    Action: {ev.actionTaken}
                  </div>
                  {ev.evidence.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {ev.evidence.map((ref, idx) => (
                        <CitationChip
                          key={idx}
                          recordRef={ref}
                          onInspect={onInspectRecord}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dedicated Side Panel: "Why this was not a clinical emergency" + Event Inspector (5 cols) */}
        <div className="space-y-4 rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-[#4263A0]/15 pb-3">
            <Info className="h-5 w-5 text-[#3F68A8]" />
            <h2 className="font-serif text-xl text-[#2C4675]">
              Why This Was Not a Clinical Emergency
            </h2>
          </div>

          {unitCorruptionEvent ? (
            <div className="space-y-4 text-xs text-[#2C4675]">
              <div className="rounded-xl border border-[#94A3B8] bg-[#E2E8F0]/70 p-3.5">
                <div className="font-mono font-bold text-[#334155]">
                  {unitCorruptionEvent.site} × {unitCorruptionEvent.test} · Cut{' '}
                  {unitCorruptionEvent.cut} · DATA-INTEGRITY DECISION (Not Clinical Escalation)
                </div>
                <p className="mt-1.5 leading-relaxed">
                  {unitCorruptionEvent.whyNotClinicalEmergency}
                </p>
              </div>

              {unitCorruptionEvent.corroborationChecks && (
                <div className="space-y-2">
                  <div className="font-semibold text-[#4263A0] uppercase">
                    Deterministic Corroboration Audit:
                  </div>
                  {unitCorruptionEvent.corroborationChecks.map((chk, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[#4263A0]/15 bg-white p-2.5"
                    >
                      <div>
                        <div className="font-semibold text-[#2C4675]">{chk.label}</div>
                        <div className="font-mono text-[11px] text-[#4263A0]">
                          {chk.result}
                        </div>
                      </div>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E4620]" />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-[#E6F0EC] p-3">
                <div className="font-semibold text-[#1E4620]">
                  Action Taken by Study Sentinel:
                </div>
                <p className="mt-1">{unitCorruptionEvent.actionTaken}</p>
              </div>
            </div>
          ) : null}

          {/* Selected Event Diff / Amendment Inspector */}
          {selectedAdversarial && selectedAdversarial.diffLines && (
            <div className="mt-4 border-t border-[#4263A0]/15 pt-4 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#9B2C2C] uppercase">
                <FileWarning className="h-4 w-4" />
                <span>
                  Document SHA-256 Tamper Diff ({selectedAdversarial.documentName})
                </span>
              </div>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#4263A0]/20 bg-white p-3 font-mono text-[11px]">
                {selectedAdversarial.diffLines.map((dl, i) => (
                  <div
                    key={i}
                    className={
                      dl.type === 'tamper'
                        ? 'rounded bg-[#FDE8E8] px-2 py-1 font-bold text-[#9B2C2C]'
                        : dl.type === 'added'
                        ? 'bg-[#DEF7EC] px-2 py-0.5 text-[#1E4620]'
                        : 'text-[#4263A0]'
                    }
                  >
                    {dl.type === 'tamper' ? '[TAMPER IGNORED] ' : ''}
                    {dl.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedAdversarial && selectedAdversarial.amendmentBeforeAfter && (
            <div className="mt-4 border-t border-[#4263A0]/15 pt-4 text-xs">
              <div className="font-semibold text-[#2C4675] uppercase">
                Protocol Amendment Re-Derivation (Before vs. After Counts):
              </div>
              <div className="mt-2 space-y-1.5">
                {selectedAdversarial.amendmentBeforeAfter.map((ba, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-[#E6F0EC] px-3 py-2 font-mono"
                  >
                    <span>{ba.metric}</span>
                    <span>
                      Before: <strong>{ba.before}</strong> → After:{' '}
                      <strong className="text-[#3F68A8]">{ba.after}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
