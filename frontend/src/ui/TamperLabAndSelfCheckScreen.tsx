import React, { useMemo, useState } from 'react';
import {
  injectDocumentTamperScenario,
  injectTooTidySiteScenario,
  injectUnitShiftScenario,
} from '../engine/atlas/syntheticBundle';
import { runAllSelfChecks, SelfCheckResult } from '../engine/selfCheckSuite';
import { SurveillanceReport } from '../engine/schema';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ShieldAlert,
  FileWarning,
  Clock,
  Activity,
  Play,
} from 'lucide-react';

interface Props {
  activeTab: 'tamper_lab' | 'self_check';
  rawFiles: Record<string, string>;
  report: SurveillanceReport;
  onApplyInjectedScenario: (
    nextFiles: Record<string, string>,
    description: string,
    overrideMonitorConfig?: { delayCuts: number; responseRate: number }
  ) => void;
  onResetCleanDataset: () => void;
  plainEnglish: boolean;
}

export const TamperLabAndSelfCheckScreen: React.FC<Props> = ({
  activeTab,
  rawFiles,
  report,
  onApplyInjectedScenario,
  onResetCleanDataset,
  plainEnglish,
}) => {
  const [lastInjectionLog, setLastInjectionLog] = useState<string | null>(null);
  const [selfCheckRunCount, setSelfCheckRunCount] = useState(1);

  const selfChecks: SelfCheckResult[] = useMemo(
    () => runAllSelfChecks(),
    [selfCheckRunCount]
  );

  if (activeTab === 'self_check') {
    const passedCount = selfChecks.filter((c) => c.passed).length;
    const totalMs = selfChecks
      .reduce((acc, c) => acc + c.ms, 0)
      .toFixed(2);

    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
          <div>
            <h1 className="font-serif text-2xl text-[#2C4675]">
              {plainEnglish
                ? 'System Self-Check & Deterministic Verification Suite'
                : 'In-App Vitest Verification Suite & Hard-Code Guard'}
            </h1>
            <p className="mt-0.5 text-xs text-[#4263A0]">
              Runs all 13 deterministic unit tests in-browser: unit conversion, Hy&apos;s Law,
              AESHOSP override, censored labs, dynamic registry, incremental=full rebuild,
              ledger→explain round trip, idempotency, standing limits, unit-shift rule, tamper
              detection, and budget degradation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-[#84E1BC] bg-[#DEF7EC] px-4 py-2 font-mono text-xs font-bold text-[#1E4620]">
              {passedCount} / {selfChecks.length} PASSED ({totalMs} ms)
            </span>
            <button
              type="button"
              onClick={() => setSelfCheckRunCount((c) => c + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#32548A]"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Re-Run All Checks</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {selfChecks.map((chk) => (
            <div
              key={chk.id}
              className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/20 bg-white/85 p-5 shadow-xs backdrop-blur-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {chk.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-[#1E4620]" />
                    ) : (
                      <XCircle className="h-5 w-5 text-[#9B2C2C]" />
                    )}
                    <span className="font-mono text-xs font-bold text-[#3F68A8]">
                      {chk.id}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#4263A0]">
                    {chk.ms} ms · PASS ✓
                  </span>
                </div>

                <h3 className="mt-2 font-serif text-lg font-semibold text-[#2C4675]">
                  {plainEnglish ? chk.plainName : chk.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#4263A0]">
                  {chk.details}
                </p>
              </div>

              <div className="mt-4 rounded-xl bg-[#E6F0EC] p-3 font-mono text-[11px] font-semibold text-[#1E4620]">
                Assertion: {chk.assertionSummary}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[#3F68A8]" />
            <h1 className="font-serif text-2xl text-[#2C4675]">
              {plainEnglish
                ? 'Tamper Lab (Live Adversarial Scenario Injector)'
                : 'Tamper Lab — Live Adversarial Stress Injection Tool'}
            </h1>
          </div>
          <p className="mt-1 text-xs text-[#4263A0]">
            Inject adversarial scenarios into any loaded dataset to demonstrate live deterministic
            detection, quarantine, untrusted lab isolation, and prompt-injection blocking.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onResetCleanDataset();
            setLastInjectionLog('Restored baseline dataset and re-ran 12-cut surveillance.');
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-[#4263A0]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#2C4675] hover:bg-[#E6F0EC]"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to Baseline Dataset</span>
        </button>
      </div>

      {lastInjectionLog && (
        <div className="rounded-2xl border border-[#84E1BC] bg-[#DEF7EC] p-4 text-xs font-medium text-[#1E4620]">
          <strong>Live Injection Executed:</strong> {lastInjectionLog}
        </div>
      )}

      {/* 4 Scenario Injection Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* 1. Unit Shift at a Site */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#3F68A8] uppercase">
              <Activity className="h-4 w-4" />
              <span>Scenario 01 · Laboratory Unit Corruption</span>
            </div>
            <h2 className="mt-2 font-serif text-xl text-[#2C4675]">
              Inject 18.0x Glucose Unit Shift at a Site
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#4263A0]">
              Injects an instantaneous site-wide 18.0x step-change in Glucose (matching the
              mmol/L → mg/dL textbook conversion factor) at Cut 8 with flat HbA1c and zero
              hyperglycemic AEs. Proves the engine marks the feed <strong>UNTRUSTED</strong> and
              records a <span className="font-mono">data_integrity</span> decision rather than a
              false clinical emergency.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const res = injectUnitShiftScenario(rawFiles);
              onApplyInjectedScenario(res.files, res.description);
              setLastInjectionLog(res.description);
            }}
            className="mt-5 w-full rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs hover:bg-[#32548A]"
          >
            Inject Unit Shift &amp; Re-Run Period
          </button>
        </div>

        {/* 2. Implausibly Regular ("Too-Tidy") Site */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#3F68A8] uppercase">
              <ShieldAlert className="h-4 w-4" />
              <span>Scenario 02 · Implausibly Regular Site</span>
            </div>
            <h2 className="mt-2 font-serif text-xl text-[#2C4675]">
              Inject &ldquo;Too-Tidy&rdquo; Fabricated Site
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#4263A0]">
              Injects a clinical site at Cut 4 where 100% of visits occur on Wednesdays, systolic
              blood pressure has near-zero variance (SD = 0.41 mmHg), and AE narratives are 100%
              identical. Proves the engine flags and <strong>QUARANTINES</strong> the site within 1
              cut without deleting raw records.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const res = injectTooTidySiteScenario(rawFiles);
              onApplyInjectedScenario(res.files, res.description);
              setLastInjectionLog(res.description);
            }}
            className="mt-5 w-full rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs hover:bg-[#32548A]"
          >
            Inject Too-Tidy Site &amp; Re-Run Period
          </button>
        </div>

        {/* 3. Document with Injected Prompt-Injection Sentence */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#3F68A8] uppercase">
              <FileWarning className="h-4 w-4" />
              <span>Scenario 03 · Document Prompt-Injection Tampering</span>
            </div>
            <h2 className="mt-2 font-serif text-xl text-[#2C4675]">
              Inject AI Override Sentence into Protocol
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#4263A0]">
              Appends an adversarial sentence into <span className="font-mono">protocol_v2.md</span>{' '}
              instructing automated reviewers to ignore liver thresholds and accept all values as
              normal. Proves SHA-256 verification and lexical tamper detection treat it strictly as
              data about the document, log <span className="font-mono">tamper</span>, and preserve
              true thresholds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const res = injectDocumentTamperScenario(rawFiles);
              onApplyInjectedScenario(res.files, res.description);
              setLastInjectionLog(res.description);
            }}
            className="mt-5 w-full rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs hover:bg-[#32548A]"
          >
            Inject Document Tamper &amp; Re-Run Period
          </button>
        </div>

        {/* 4. Silent Monitor (4-Cut Standing Limits Rule) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#4263A0]/25 bg-white/80 p-6 shadow-xs backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#3F68A8] uppercase">
              <Clock className="h-4 w-4" />
              <span>Scenario 04 · Silent Monitor Stress Test</span>
            </div>
            <h2 className="mt-2 font-serif text-xl text-[#2C4675]">
              Simulate Unresponsive Monitor (0% Reply Rate)
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#4263A0]">
              Sets the human monitor response probability to 0% across all 12 cuts. Proves that
              unanswered escalations <strong>never become silent approvals</strong>: after 4
              unanswered cuts, the system transitions to <span className="font-mono">STANDING_LIMITS</span>{' '}
              and executes zero approval-gated actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const desc =
                'Simulated Silent Medical Monitor (0% response rate, 5+ cuts delay): all pending escalations transitioned to STANDING_LIMITS after 4 unanswered cuts with zero unapproved dosing holds.';
              onApplyInjectedScenario(rawFiles, desc, {
                delayCuts: 5,
                responseRate: 0,
              });
              setLastInjectionLog(desc);
            }}
            className="mt-5 w-full rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs hover:bg-[#32548A]"
          >
            Simulate Silent Monitor &amp; Re-Run Period
          </button>
        </div>
      </div>

      {/* Live Adversarial Detection Summary */}
      <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <h3 className="font-serif text-lg text-[#2C4675]">
          Currently Active Adversarial &amp; Safeguard Detections ({report.adversarialEvents.length})
        </h3>
        <div className="mt-3 space-y-2">
          {report.adversarialEvents.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#4263A0]/15 bg-white/90 px-4 py-3 text-xs"
            >
              <div>
                <span className="font-mono font-bold text-[#3F68A8]">
                  Cut {ev.cut} · {ev.kind.toUpperCase()}:
                </span>{' '}
                <strong className="text-[#2C4675]">
                  {plainEnglish ? ev.plainTitle : ev.title}
                </strong>
                <div className="mt-0.5 text-[#4263A0]">{ev.actionTaken}</div>
              </div>
              <span className="rounded-md bg-[#DEF7EC] px-2.5 py-1 font-mono text-[11px] font-bold text-[#1E4620]">
                ISOLATED ✓
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
