/**
 * Shared Core Schema for Study Sentinel
 * THE ONE IDEA: Every number on screen is a claim, and every claim carries its evidence.
 * Do not modify this shared schema file once created.
 */

export interface RecordRef {
  domain: string;
  usubjid: string;
  seq: number;
}

export type SeverityLevel = 'critical' | 'review' | 'ok' | 'untrusted';

export interface DataQualityIssue {
  id: string;
  cut: number;
  domain: string;
  usubjid?: string;
  seq?: number;
  kind:
    | 'invalid_date'
    | 'missing_field'
    | 'duplicate_record'
    | 'duplicate_subject'
    | 'censored_value'
    | 'not_done'
    | 'unit_conversion'
    | 'untrusted_unit_shift';
  message: string;
  rawField?: string;
  rawValue?: string;
}

export interface DomainSchema {
  domain: string;
  seqColumn: string;
  keyColumns: string[];
  dateColumns: string[];
  valueColumns: string[];
  unitColumns: string[];
  testColumn?: string;
  catColumn?: string;
  siteColumn?: string;
  onboardedAtCut: number;
  columns: string[];
  rowCount: number;
}

export interface FieldCorrectionHistory {
  cut: number;
  field: string;
  oldValue: string;
  newValue: string;
  reason?: string;
}

export interface DomainRecord {
  domain: string;
  usubjid: string;
  seq: number;
  site: string;
  cut_available: number;
  corrected_at_cut?: number;
  raw: Record<string, string>;
  values: Record<string, string>;
  history: FieldCorrectionHistory[];
  testCode?: string;
  testName?: string;
  rawValueStr?: string;
  numericValue?: number;
  censored?: boolean;
  censorThreshold?: number;
  notDone?: boolean;
  unit?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
  conversionFactorUsed?: number;
  refLow?: number;
  refHigh?: number;
  labId?: string;
  dateStr?: string;
  epochDays?: number | null;
  visit?: string;
  visitNum?: number;
}

export interface ReferenceRange {
  lab: string;
  test: string;
  low: number;
  high: number;
  unit: string;
}

export interface UnitConversionEntry {
  test: string;
  fromUnit: string;
  toUnit: string;
  fromLab?: string;
  toLab?: string;
  derivedFactor: number;
  textbookFactor: number;
  verified: boolean;
}

export interface CorrectionEntry {
  domain: string;
  usubjid: string;
  seq: number;
  field: string;
  old_value?: string;
  new_value: string;
  cut: number;
  reason?: string;
}

export interface CutDefinition {
  cut: number;
  date: string;
  protocol_version: string;
  lab_manual_version?: string;
  label?: string;
}

export interface ProtocolRuleDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface ProtocolRules {
  version: string;
  effectiveCut: number;
  documentName: string;
  sha256: string;
  rawText: string;
  hysLawAltMultiplier: number;
  hysLawAstMultiplier: number;
  hysLawBiliMultiplier: number;
  hysLawWindowDays: number;
  hysLawAlpMaxMultiplier: number;
  hospOverridesSerious: boolean;
  prohibitedMeds: string[];
  visitWindows: Record<string, { targetDay: number; windowMinus: number; windowPlus: number }>;
  dosingByArm: Record<string, { dose: number; unit: string; frequency?: string }>;
  exclusionCriteria: {
    minAge: number;
    maxAge: number;
    maxScreeningAltUln: number;
    excludedConditions: string[];
  };
  tampered: boolean;
  tamperSentences: string[];
  diffFromPrevious: ProtocolRuleDiff[];
}

export interface DocumentSnapshot {
  name: string;
  version: string;
  cut: number;
  content: string;
  sha256: string;
  tampered: boolean;
  tamperSentences: string[];
  diffLines?: Array<{ text: string; type: 'unchanged' | 'added' | 'removed' | 'tamper' }>;
}

export interface MonitorDecisionSeed {
  key: string;
  decision: 'APPROVED' | 'REJECTED' | 'CLARIFY';
  reason?: string;
  question?: string;
  action?: string;
  delayCuts?: number;
}

export interface SiteReplySeed {
  key: string;
  reply: string;
  status: 'answered' | 'open';
  delayCuts?: number;
}

export interface IngestedStudyData {
  studyName: string;
  domains: Map<string, DomainSchema>;
  recordsByKey: Map<string, DomainRecord>;
  recordsBySubject: Map<string, DomainRecord[]>;
  recordsByDomain: Map<string, DomainRecord[]>;
  recordsByCut: Map<number, DomainRecord[]>;
  correctionsByCut: Map<number, CorrectionEntry[]>;
  referenceRanges: ReferenceRange[];
  unitConversions: UnitConversionEntry[];
  cuts: CutDefinition[];
  protocolVersions: Map<string, ProtocolRules>;
  documentsByCut: Map<number, DocumentSnapshot[]>;
  monitorDecisions: Record<string, MonitorDecisionSeed | string>;
  siteReplies: Record<string, SiteReplySeed | string>;
  dataQualityIssues: DataQualityIssue[];
  siteOnboardCut: Map<string, number>;
  domainOnboardCut: Map<string, number>;
  duplicateSubjectPairs: Array<{
    primary: string;
    duplicate: string;
    matchKey: string;
    refs: RecordRef[];
  }>;
}

export interface Finding {
  id: string;
  code: string;
  subject: string;
  site: string;
  cut: number;
  severity: SeverityLevel;
  rationale: string;
  plainRationale: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  monitorOnly?: boolean;
  category: 'clinical' | 'data_integrity' | 'compliance' | 'query' | 'adversarial';
  supersededAtCut?: number;
  supersededReason?: string;
  protocolVersion?: string;
}

export interface GraphNode {
  id: string;
  type: 'subject' | 'visit' | 'record' | 'rule' | 'finding';
  label: string;
  sublabel?: string;
  domain?: string;
  usubjid?: string;
  seq?: number;
  severity?: SeverityLevel;
  cut?: number;
  data?: any;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface BuildStats {
  cut: number;
  nodes: number;
  edges: number;
  subjects: number;
  subjectsReDerived: number;
  ms: number;
  tokensUsed: number;
  incremental: boolean;
}

export interface Patient360View {
  usubjid: string;
  site: string;
  age?: number;
  sex?: string;
  arm?: string;
  initials?: string;
  birthDate?: string;
  firstDoseDate?: string;
  isDuplicateOf?: string;
  hasDuplicate?: string;
  visits: Array<{
    visitName: string;
    date: string;
    epochDays: number | null;
    records: DomainRecord[];
  }>;
  recordsByDomain: Record<string, DomainRecord[]>;
  findings: Finding[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Answer {
  question_id: string;
  kind: 'count' | 'lookup' | 'finding' | 'trap';
  answer: any;
  text: string;
  plainText: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  confidence: number;
  steps_used: number;
  tokens_used: number;
}

export type CrewNodeName =
  | 'detect'
  | 'medical_review'
  | 'data_manager'
  | 'compliance'
  | 'human_gate'
  | 'execute';

export interface TraceEntry {
  id: string;
  cut: number;
  node: CrewNodeName;
  decision: string;
  rationale: string;
  evidence: RecordRef[];
  timestamp: string;
  subject?: string;
  site?: string;
  code?: string;
}

export interface QueryItem {
  query_id: string;
  cut_raised: number;
  domain: string;
  usubjid: string;
  seq: number;
  site: string;
  field: string;
  issue: string;
  question: string;
  status: 'open' | 'answered' | 'unresponsive_site';
  site_reply?: string;
  answered_at_cut?: number;
  evidence: RecordRef[];
  evidence_lines: string[];
  superseded_at_cut?: number;
}

export interface EscalationItem {
  escalation_id: string;
  cut_raised: number;
  code: string;
  subject: string;
  site: string;
  severity: SeverityLevel;
  rationale: string;
  plainRationale: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  monitor_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLARIFY' | 'STANDING_LIMITS';
  monitor_reply?: string;
  clarification_question?: string;
  clarification_answer?: string;
  clarification_evidence?: RecordRef[];
  answered_at_cut?: number;
  cuts_waiting: number;
  days_waiting: number;
  cost_of_waiting: string;
  action_executed?: string;
  downgraded_reason?: string;
  superseded_at_cut?: number;
}

export interface ReviewReport {
  cut: number;
  protocolVersion: string;
  traces: TraceEntry[];
  newFindingsCount: number;
  newQueriesCount: number;
  newEscalationsCount: number;
  activeQueries: QueryItem[];
  activeEscalations: EscalationItem[];
  siteFlags: Array<{
    site: string;
    cut: number;
    reason: string;
    queryCount: number;
    quarantined: boolean;
  }>;
  complianceSummary: {
    version: string;
    compliantSubjects: number;
    nonCompliantSubjects: number;
    newlyNonCompliantAfterAmendment: string[];
  };
}

export type DecisionKind =
  | 'clinical_escalation'
  | 'data_integrity'
  | 'query'
  | 'deviation'
  | 'tamper'
  | 'quarantine'
  | 'standing_limits'
  | 'degradation';

export interface Decision {
  decision_id: string;
  cut: number;
  kind: DecisionKind;
  what: string;
  plain_what: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  alternatives: string[];
  why: string;
  node: string;
  timestamp: string;
  subject?: string;
  site?: string;
  code?: string;
  superseded_by_cut?: number;
  superseded_reason?: string;
}

export interface Explanation {
  decision_id: string;
  what: string;
  plain_what?: string;
  kind?: DecisionKind;
  cut?: number;
  node?: string;
  timestamp?: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  alternatives: string[];
  why: string;
  consistent_with_trace: boolean;
  superseded_by_cut?: number;
  verification_details: {
    allRecordsResolved: boolean;
    resolvedCount: number;
    totalRefs: number;
    traceEntryFound: boolean;
    ledgerImmutableCheck: boolean;
  };
}

export interface AdversarialEvent {
  id: string;
  cut: number;
  kind:
    | 'regular_site'
    | 'unit_corruption'
    | 'document_tamper'
    | 'protocol_amendment'
    | 'onboarding';
  title: string;
  plainTitle: string;
  site?: string;
  test?: string;
  documentName?: string;
  summary: string;
  thresholdsStated: string;
  whyNotClinicalEmergency?: string;
  corroborationChecks?: Array<{ label: string; result: string; passed: boolean }>;
  actionTaken: string;
  evidence: RecordRef[];
  evidence_lines: string[];
  diffLines?: Array<{ text: string; type: 'unchanged' | 'added' | 'removed' | 'tamper' }>;
  amendmentBeforeAfter?: Array<{ metric: string; before: number; after: number }>;
}

export interface SiteRiskProfile {
  site: string;
  onboardedAtCut: number;
  subjectCount: number;
  quarantined: boolean;
  quarantinedAtCut?: number;
  quarantineReason?: string;
  untrustedTests: string[];
  openQueries: number;
  totalFindings: number;
  criticalFindings: number;
  weekdayConcentration: number;
  vitalsStdDev: number;
  narrativeSimilarity: number;
  riskScore: number;
  riskLevel: SeverityLevel;
  perCutSignals: Record<number, number>;
}

export interface BudgetState {
  totalTokensBudget: number;
  usedTokens: number;
  totalMsBudget: number;
  usedMs: number;
  tier: 'normal' | 'degraded';
  degradedAtCut?: number;
  callsPermitted: number;
  callsBlockedByGovernor: number;
  perCutCost: Array<{
    cut: number;
    ms: number;
    tokens: number;
    cumulativeTokens: number;
    cumulativeMs: number;
    tier: 'normal' | 'degraded';
    subjectsReDerived: number;
    nodes: number;
  }>;
}

export interface CutSnapshot {
  cut: number;
  date: string;
  protocolVersion: string;
  stats: BuildStats;
  findings: Finding[];
  queries: QueryItem[];
  escalations: EscalationItem[];
  decisions: Decision[];
  traces: TraceEntry[];
  adversarialEvents: AdversarialEvent[];
  siteProfiles: SiteRiskProfile[];
  budget: BudgetState;
}

export interface SurveillanceReport {
  studyName: string;
  totalCuts: number;
  currentCut: number;
  snapshots: Map<number, CutSnapshot>;
  ledger: Decision[];
  allFindings: Finding[];
  allQueries: QueryItem[];
  allEscalations: EscalationItem[];
  allTraces: TraceEntry[];
  adversarialEvents: AdversarialEvent[];
  siteProfiles: SiteRiskProfile[];
  budget: BudgetState;
  dataQualityIssues: DataQualityIssue[];
  narrativeSummary?: string;
}
