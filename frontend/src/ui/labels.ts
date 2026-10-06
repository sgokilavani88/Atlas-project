import { DecisionKind, SeverityLevel } from '../engine/schema';

export function formatFindingCode(code: string, plainEnglish: boolean): string {
  if (!plainEnglish) return code;

  const map: Record<string, string> = {
    HYS_LAW_CANDIDATE: "Possible liver injury (Hy's Law)",
    BASELINE_LIVER_ELEVATION: 'Pre-existing high liver enzyme (Monitor only)',
    AESHOSP_OVERRIDE: 'Hospitalization miscoded as non-serious',
    DOSING_ERROR: 'Medication dosing or exposure discrepancy',
    AE_BEFORE_FIRST_DOSE: 'Symptom occurred before first medication dose',
    PROHIBITED_MEDICATION: 'Restricted concomitant medication taken',
    VISIT_WINDOW_DEVIATION: 'Clinic visit outside scheduled window',
    ELIGIBILITY_VIOLATION: 'Enrollment / screening eligibility exception',
    DUPLICATE_SUBJECT: 'Same patient enrolled twice (Duplicate ID)',
    LAB_UNIT_CORRUPTION: 'Lab unit reporting mismatch (Data integrity)',
    IMPLAUSIBLY_REGULAR_SITE: 'Suspiciously uniform clinic data (Quarantined)',
    DOCUMENT_TAMPERING: 'Unauthorized document instruction blocked',
    BUDGET_DEGRADATION: 'Budget safeguard active (Safety checks prioritized)',
  };

  return map[code] || code.replace(/_/g, ' ');
}

export function formatDecisionKind(kind: DecisionKind, plainEnglish: boolean): string {
  if (!plainEnglish) return kind.toUpperCase();

  const map: Record<DecisionKind, string> = {
    clinical_escalation: 'Clinical Safety Decision',
    data_integrity: 'Data Integrity Protection',
    query: 'Clinic Verification Query',
    deviation: 'Protocol Schedule / Rule Check',
    tamper: 'Document Security Block',
    quarantine: 'Clinic Data Quarantine',
    standing_limits: 'Standing Limits Safeguard',
    degradation: 'Compute Budget Priority Mode',
  };

  return map[kind] || kind;
}

export function formatNodeName(node: string, plainEnglish: boolean): string {
  if (!plainEnglish) return node;

  const map: Record<string, string> = {
    detect: '1. Signal Detection',
    medical_review: '2. Clinical Review',
    data_manager: '3. Data Verification',
    compliance: '4. Protocol Compliance',
    human_gate: '5. Medical Monitor Gate',
    execute: '6. Action Execution',
    watch_governor: 'Budget Governor',
  };

  return map[node] || node;
}

export function getSeverityBadgeClass(severity: SeverityLevel): string {
  switch (severity) {
    case 'critical':
      return 'bg-[#FDE8E8] text-[#9B2C2C] border-[#F8B4B4]';
    case 'review':
      return 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]';
    case 'untrusted':
      return 'bg-[#E2E8F0] text-[#334155] border-[#94A3B8]';
    case 'ok':
    default:
      return 'bg-[#DEF7EC] text-[#1E4620] border-[#84E1BC]';
  }
}

export function getSeverityLabel(severity: SeverityLevel, plainEnglish: boolean): string {
  if (!plainEnglish) return severity.toUpperCase();
  switch (severity) {
    case 'critical':
      return 'Critical Safety Signal';
    case 'review':
      return 'Needs Clinical Review';
    case 'untrusted':
      return 'Untrusted / Quarantined';
    case 'ok':
    default:
      return 'Verified Normal';
  }
}
