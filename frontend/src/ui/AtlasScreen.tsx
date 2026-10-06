import React, { useMemo, useState } from 'react';
import {
  Answer,
  CutSnapshot,
  GraphNode,
  IngestedStudyData,
  RecordRef,
} from '../engine/schema';
import { StudyGraph } from '../engine/atlas/studyGraph';
import { Atlas } from '../engine/atlas/atlasAnswering';
import { CitationChip } from './RecordDrawer';
import { formatFindingCode, getSeverityBadgeClass, getSeverityLabel } from './labels';
import {
  Search,
  Sparkles,
  Network,
  Calendar,
  GitCompare,
  ShieldAlert,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  studyData: IngestedStudyData;
  graph: StudyGraph;
  currentSnapshot: CutSnapshot;
  selectedSubject: string;
  onSelectSubject: (usubjid: string) => void;
  onInspectRecord: (ref: RecordRef) => void;
  plainEnglish: boolean;
}

const PRESET_QUESTIONS = [
  {
    label: 'Project: How does Study Sentinel work?',
    q: 'How does the Study Sentinel project and its 3-layer architecture work?',
  },
  {
    label: "Finding: Which subjects meet Hy's Law?",
    q: "Which subjects meet Hy's law?",
  },
  {
    label: 'Sites: Which sites are quarantined or untrusted?',
    q: 'Tell me about all clinical sites, quarantined sites, and untrusted lab feeds.',
  },
  {
    label: 'Protocols: What changed in v1, v2, and v3?',
    q: 'What changed between protocol v1, v2, and v3, and was any document tampered with?',
  },
  {
    label: 'Corrections: Which records were corrected?',
    q: 'Which records were corrected by corrections.csv and which findings were superseded?',
  },
  {
    label: 'Demographics: Age, Sex & Arm breakdown',
    q: 'What is the age, sex, and treatment arm breakdown across enrolled subjects?',
  },
  {
    label: 'Cut 7: Why was the glucose shift not an emergency?',
    q: 'What happened at Cut 7 and why was the glucose unit shift not a clinical emergency?',
  },
  {
    label: 'Trap: Brain MRI or genome sequencing?',
    q: 'Which subjects had brain MRI abnormalities or genome sequencing mutations?',
  },
];

export const AtlasScreen: React.FC<Props> = ({
  studyData,
  graph,
  currentSnapshot,
  selectedSubject,
  onSelectSubject,
  onInspectRecord,
  plainEnglish,
}) => {
  const [subjectSearch, setSubjectSearch] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [isSynthesizingId, setIsSynthesizingId] = useState<string | null>(null);
  const [askedQuestionsMap, setAskedQuestionsMap] = useState<Record<string, string>>({
    'Q-INIT-1': "Which subjects meet Hy's law?",
    'Q-INIT-2': 'How does the Study Sentinel project and its 3-layer architecture work?',
  });

  const [answersHistory, setAnswersHistory] = useState<Answer[]>(() => {
    const atlas = new Atlas(graph);
    return [
      atlas.answer("Which subjects meet Hy's law?", 'Q-INIT-1'),
      atlas.answer(
        'How does the Study Sentinel project and its 3-layer architecture work?',
        'Q-INIT-2'
      ),
    ];
  });
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphNode | null>(null);

  const allSubjects = useMemo(
    () => Array.from(graph.subjectRecordsMap.keys()).sort(),
    [graph, currentSnapshot.cut]
  );

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return allSubjects;
    return allSubjects.filter((s) => s.toLowerCase().includes(q));
  }, [allSubjects, subjectSearch]);

  const activeSubjectId =
    allSubjects.includes(selectedSubject) ? selectedSubject : allSubjects[0] || '';

  const p360 = useMemo(
    () => (activeSubjectId ? graph.patient360(activeSubjectId) : null),
    [graph, activeSubjectId, currentSnapshot.cut]
  );

  const handleAskAtlas = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed) return;

    const atlas = new Atlas(graph);
    const deterministicAns = atlas.answer(trimmed);

    setAskedQuestionsMap((prev) => ({
      ...prev,
      [deterministicAns.question_id]: trimmed,
    }));
    setAnswersHistory((prev) => [deterministicAns, ...prev.slice(0, 9)]);

    // If Budget Governor is in normal tier (<80%) and not a trap question, optionally enrich via /api/atlas-ask
    if (
      currentSnapshot.budget.tier !== 'degraded' &&
      deterministicAns.kind !== 'trap'
    ) {
      setIsSynthesizingId(deterministicAns.question_id);
      try {
        const res = await fetch('/api/atlas-ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            deterministicAnswer: deterministicAns,
            studyContext: atlas.buildStudyContextPacket(),
          }),
        });
        const data = await res.json();
        if (data.text) {
          setAnswersHistory((prev) =>
            prev.map((item) =>
              item.question_id === deterministicAns.question_id
                ? {
                    ...item,
                    text: `${item.text}\n\nAtlas Synthesis: ${data.text}`,
                    plainText: `${data.text}\n\n[Deterministic Proof: ${item.plainText}]`,
                    tokens_used: data.tokensUsed || 0,
                  }
                : item
            )
          );
        }
      } catch {
        // Keep deterministic answer on offline/hermetic fallback
      } finally {
        setIsSynthesizingId(null);
      }
    }
  };

  // Compute radial force-directed layout coordinates for the subject's Patient 360 nodes
  const graphLayout = useMemo(() => {
    if (!p360) return { positionedNodes: [], positionedEdges: [] };
    const cx = 360;
    const cy = 210;
    const coords = new Map<string, { x: number; y: number }>();

    const subjNode = p360.nodes.find((n) => n.type === 'subject');
    if (subjNode) coords.set(subjNode.id, { x: cx, y: cy });

    const ruleNodes = p360.nodes.filter((n) => n.type === 'rule');
    ruleNodes.forEach((rn, i) => {
      coords.set(rn.id, { x: cx, y: 42 + i * 35 });
    });

    const visitNodes = p360.nodes.filter((n) => n.type === 'visit');
    visitNodes.forEach((vn, idx) => {
      const angle =
        (idx / Math.max(1, visitNodes.length)) * Math.PI * 1.5 + Math.PI * 0.25;
      coords.set(vn.id, {
        x: cx + Math.cos(angle) * 115,
        y: cy + Math.sin(angle) * 95,
      });
    });

    const recNodes = p360.nodes.filter((n) => n.type === 'record');
    recNodes.forEach((rn, idx) => {
      const angle = (idx / Math.max(1, recNodes.length)) * Math.PI * 2;
      coords.set(rn.id, {
        x: cx + Math.cos(angle) * 225,
        y: cy + Math.sin(angle) * 150,
      });
    });

    const findingNodes = p360.nodes.filter((n) => n.type === 'finding');
    findingNodes.forEach((fn, idx) => {
      coords.set(fn.id, {
        x: 620,
        y: 65 + idx * 75,
      });
    });

    const positionedNodes = p360.nodes.map((n) => ({
      ...n,
      ...(coords.get(n.id) || { x: cx + 100, y: cy + 100 }),
    }));

    const positionedEdges = p360.edges
      .map((e) => {
        const s = coords.get(e.source);
        const t = coords.get(e.target);
        if (!s || !t) return null;
        return { ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    return { positionedNodes, positionedEdges };
  }, [p360]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-8">
      {/* Top Incremental Graph Stats Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#4263A0]/20 bg-white/70 px-5 py-3.5 shadow-xs backdrop-blur-md">
        <div>
          <h1 className="font-serif text-2xl text-[#2C4675]">
            {plainEnglish
              ? 'Study Atlas & Patient 360 Evidence Graph'
              : 'Layer A — StudyGraph & Atlas Deterministic Query Engine'}
          </h1>
          <p className="text-xs text-[#4263A0]">
            {plainEnglish
              ? `Viewing Study State as of Cut ${currentSnapshot.cut} (${currentSnapshot.date}) · Governed by Protocol ${currentSnapshot.protocolVersion}`
              : `Incremental applyDelta(Cut ${currentSnapshot.cut}) · Protocol ${currentSnapshot.protocolVersion} · Zero full-graph rebuilds`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-[#2C4675]">
          <div>
            <span className="text-[#4263A0]">Subjects:</span>{' '}
            <strong>{currentSnapshot.stats.subjects}</strong>
          </div>
          <span>·</span>
          <div>
            <span className="text-[#4263A0]">Graph Nodes:</span>{' '}
            <strong>{currentSnapshot.stats.nodes}</strong>
          </div>
          <span>·</span>
          <div>
            <span className="text-[#4263A0]">Edges:</span>{' '}
            <strong>{currentSnapshot.stats.edges}</strong>
          </div>
          <span>·</span>
          <div>
            <span className="text-[#4263A0]">Re-derived at Cut {currentSnapshot.cut}:</span>{' '}
            <strong>{currentSnapshot.stats.subjectsReDerived} subj</strong>
          </div>
          <span>·</span>
          <div>
            <span className="text-[#4263A0]">Cut Delta Cost:</span>{' '}
            <strong>
              {currentSnapshot.stats.ms} ms / {currentSnapshot.stats.tokensUsed} tok
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ASK ATLAS DETERMINISTIC QUESTION ENGINE
         ===================================================================== */}
      <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#3F68A8]" />
            <h2 className="font-serif text-xl text-[#2C4675]">
              {plainEnglish
                ? 'Ask Atlas (Every Answer Carries Its Source Record)'
                : 'Atlas.answer(question) — Count · Lookup · Finding · Trap'}
            </h2>
          </div>
          <span className="font-mono text-xs text-[#4263A0]">
            Honest calibration: trap questions return [] with 0 invented citations
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskAtlas(questionInput);
          }}
          className="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask anything about the Study Sentinel project, architecture, subjects, sites, cuts, labs, meds, protocols, or trap questions..."
            className="flex-1 rounded-xl border border-[#4263A0]/30 bg-white/90 px-4 py-2.5 text-sm text-[#2C4675] placeholder-[#4263A0]/60 focus:border-[#3F68A8] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-[#3F68A8] px-5 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-xs hover:bg-[#32548A]"
          >
            Ask Atlas
          </button>
        </form>

        {/* Preset Question Buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((pq, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuestionInput(pq.q);
                handleAskAtlas(pq.q);
              }}
              className="rounded-lg border border-[#4263A0]/20 bg-[#E6F0EC]/80 px-3 py-1 text-xs text-[#2C4675] transition-colors hover:border-[#3F68A8] hover:bg-white"
            >
              {pq.label}
            </button>
          ))}
        </div>

        {/* Answers List */}
        <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {answersHistory.map((ans, ansIdx) => (
            <div
              key={`${ans.question_id}-${ansIdx}`}
              className="rounded-xl border border-[#4263A0]/20 bg-white/85 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4263A0]">
                <div className="font-mono font-semibold text-[#2C4675]">
                  {ans.question_id} · Kind: {ans.kind.toUpperCase()}
                  {askedQuestionsMap[ans.question_id] && (
                    <span className="ml-2 font-sans font-semibold text-[#3F68A8]">
                      &ldquo;{askedQuestionsMap[ans.question_id]}&rdquo;
                    </span>
                  )}
                </div>
                <div className="font-mono">
                  {isSynthesizingId === ans.question_id ? (
                    <span className="text-[#3F68A8]">Enriching answer... · </span>
                  ) : null}
                  Confidence: {(ans.confidence * 100).toFixed(0)}% · Steps: {ans.steps_used} ·
                  Tokens: {ans.tokens_used}
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[#2C4675]">
                {plainEnglish ? ans.plainText : ans.text}
              </p>

              {ans.evidence_lines.length > 0 && (
                <div className="mt-2.5 rounded-lg bg-[#E6F0EC]/70 p-2.5 font-mono text-[11px] text-[#2C4675]">
                  {ans.evidence_lines.slice(0, 4).map((line, lIdx) => (
                    <div key={lIdx} className="truncate">
                      • {line}
                    </div>
                  ))}
                </div>
              )}

              {ans.evidence.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-[#4263A0]">
                    Proving Citations ({ans.evidence.length}):
                  </span>
                  {ans.evidence.map((ref, idx) => (
                    <CitationChip
                      key={`${ref.domain}-${ref.usubjid}-${ref.seq}-${idx}`}
                      recordRef={ref}
                      onInspect={onInspectRecord}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#1E4620]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    Zero citations returned (honest empty set — no fabricated evidence)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          PATIENT 360: SUBJECT SELECTOR + FORCE GRAPH + TIMELINE
         ===================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Subject Directory (3 cols) */}
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-5 shadow-xs backdrop-blur-md lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg text-[#2C4675]">Subjects ({allSubjects.length})</h2>
            <span className="font-mono text-xs text-[#4263A0]">Cut {currentSnapshot.cut}</span>
          </div>
          <div className="relative mt-3">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#4263A0]" />
            <input
              type="text"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              placeholder="Filter USUBJID..."
              className="w-full rounded-xl border border-[#4263A0]/25 bg-white/90 py-2 pr-3 pl-9 font-mono text-xs text-[#2C4675] focus:border-[#3F68A8] focus:outline-none"
            />
          </div>

          <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {filteredSubjects.map((subjId) => {
              const subjFindings = graph.subjectFindingsMap.get(subjId) || [];
              const hasCrit = subjFindings.some((f) => f.severity === 'critical');
              const hasRev = subjFindings.some((f) => f.severity === 'review');
              const isSelected = subjId === activeSubjectId;

              return (
                <button
                  key={subjId}
                  type="button"
                  onClick={() => onSelectSubject(subjId)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left font-mono text-xs transition-colors ${
                    isSelected
                      ? 'bg-[#3F68A8] font-semibold text-white shadow-xs'
                      : 'bg-white/70 text-[#2C4675] hover:bg-white'
                  }`}
                >
                  <div>
                    <div>{subjId}</div>
                    {subjFindings.length > 0 && (
                      <div
                        className={`mt-0.5 font-sans text-[11px] ${
                          isSelected ? 'text-white/85' : 'text-[#4263A0]'
                        }`}
                      >
                        {formatFindingCode(subjFindings[0].code, plainEnglish)}
                      </div>
                    )}
                  </div>
                  {subjFindings.length > 0 && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : hasCrit
                          ? 'bg-[#FDE8E8] text-[#9B2C2C]'
                          : hasRev
                          ? 'bg-[#FEF3C7] text-[#92400E]'
                          : 'bg-[#E2E8F0] text-[#334155]'
                      }`}
                    >
                      {subjFindings.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Patient 360 View (9 cols) */}
        <div className="space-y-6 lg:col-span-9">
          {p360 ? (
            <>
              {/* Patient Header & Active Findings */}
              <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-[#4263A0]">
                      Patient 360 Profile · Site {p360.site}
                      {studyData.siteOnboardCut.get(p360.site)! > 1 && (
                        <span className="ml-2 font-semibold text-[#92400E]">
                          (Site Onboarded at Cut {studyData.siteOnboardCut.get(p360.site)})
                        </span>
                      )}
                    </div>
                    <h2 className="mt-0.5 font-serif text-3xl text-[#2C4675]">{p360.usubjid}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#4263A0]">
                      <span>Arm: {p360.arm || 'N/A'}</span>
                      <span>·</span>
                      <span>Age: {p360.age ?? 'N/A'}</span>
                      <span>·</span>
                      <span>Sex: {p360.sex || 'N/A'}</span>
                      <span>·</span>
                      <span>Initials: {p360.initials || 'N/A'}</span>
                      <span>·</span>
                      <span>First Dose: {p360.firstDoseDate || 'No EX record'}</span>
                    </div>
                  </div>

                  {p360.isDuplicateOf && (
                    <div className="rounded-xl border border-[#F8B4B4] bg-[#FDE8E8] px-3.5 py-2 text-xs font-medium text-[#9B2C2C]">
                      Duplicate enrollment of <strong>{p360.isDuplicateOf}</strong> (counted once)
                    </div>
                  )}
                </div>

                {/* Subject Findings */}
                {p360.findings.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-[#4263A0]/15 pt-4">
                    <div className="text-xs font-semibold text-[#4263A0] uppercase">
                      Active Findings for {p360.usubjid} ({p360.findings.length})
                    </div>
                    {p360.findings.map((f) => (
                      <div
                        key={f.id}
                        className={`rounded-xl border p-3.5 ${getSeverityBadgeClass(f.severity)}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {formatFindingCode(f.code, plainEnglish)}
                            {f.monitorOnly && ' [Monitor-Only]'}
                          </span>
                          <span className="font-mono text-xs">
                            Cut {f.cut} · {getSeverityLabel(f.severity, plainEnglish)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed">
                          {plainEnglish ? f.plainRationale : f.rationale}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium opacity-80">
                            Proving Records:
                          </span>
                          {f.evidence.map((ref, i) => (
                            <CitationChip
                              key={i}
                              recordRef={ref}
                              onInspect={onInspectRecord}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive Patient 360 Force-Directed Node Graph */}
              <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-[#3F68A8]" />
                    <h3 className="font-serif text-lg text-[#2C4675]">
                      {plainEnglish
                        ? 'Interactive Patient Evidence Graph (Click Any Record Node to Inspect)'
                        : 'Subject → Visits → Domain Records & Protocol Rule Subgraph'}
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-[#4263A0]">
                    {graphLayout.positionedNodes.length} nodes · {graphLayout.positionedEdges.length}{' '}
                    edges
                  </span>
                </div>

                <div className="mt-3 overflow-x-auto rounded-xl border border-[#4263A0]/15 bg-[#E6F0EC]/60 p-2">
                  <svg
                    viewBox="0 0 740 420"
                    aria-label={`Interactive Patient 360 graph for ${p360.usubjid}`}
                    className="h-[360px] w-full min-w-[640px]"
                  >
                    {/* Edges */}
                    {graphLayout.positionedEdges.map((edge) => (
                      <g key={edge.id}>
                        <line
                          x1={edge.x1}
                          y1={edge.y1}
                          x2={edge.x2}
                          y2={edge.y2}
                          stroke={edge.label === 'cites' ? '#C53030' : '#4263A0'}
                          strokeOpacity={edge.label === 'cites' ? 0.65 : 0.3}
                          strokeWidth={edge.label === 'cites' ? 2 : 1.5}
                          strokeDasharray={edge.label === 'cites' ? '4 3' : undefined}
                        />
                      </g>
                    ))}

                    {/* Nodes */}
                    {graphLayout.positionedNodes.map((node) => {
                      const fill =
                        node.type === 'subject'
                          ? '#3F68A8'
                          : node.type === 'rule'
                          ? '#0D9488'
                          : node.type === 'visit'
                          ? '#5A7BB5'
                          : node.type === 'finding'
                          ? '#C53030'
                          : '#FFFFFF';
                      const textFill = node.type === 'record' ? '#2C4675' : '#FFFFFF';
                      const r =
                        node.type === 'subject'
                          ? 28
                          : node.type === 'visit' || node.type === 'finding'
                          ? 22
                          : 18;

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className="cursor-pointer transition-transform hover:scale-110"
                          onClick={() => {
                            setSelectedGraphNode(node);
                            if (node.type === 'record' && node.domain && node.usubjid && node.seq) {
                              onInspectRecord({
                                domain: node.domain,
                                usubjid: node.usubjid,
                                seq: node.seq,
                              });
                            }
                          }}
                        >
                          <circle
                            r={r}
                            fill={fill}
                            stroke="#3F68A8"
                            strokeWidth={node.type === 'record' ? 2 : 0}
                          />
                          <text
                            textAnchor="middle"
                            dy="3"
                            fill={textFill}
                            fontSize="9.5"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="600"
                          >
                            {node.label.slice(0, 10)}
                          </text>
                          {node.sublabel && (
                            <text
                              textAnchor="middle"
                              dy={r + 12}
                              fill="#2C4675"
                              fontSize="9.5"
                              fontFamily="DM Sans, sans-serif"
                            >
                              {node.sublabel.slice(0, 22)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Patient Longitudinal Visit Timeline */}
              <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#3F68A8]" />
                  <h3 className="font-serif text-lg text-[#2C4675]">
                    {plainEnglish
                      ? 'Chronological Visit & Domain Record Timeline'
                      : 'Patient 360 Visit Timeline & RecordRef Citations'}
                  </h3>
                </div>

                <div className="mt-4 space-y-4">
                  {p360.visits.map((v, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#4263A0]/15 bg-white/85 p-4"
                    >
                      <div className="flex items-center justify-between border-b border-[#4263A0]/10 pb-2">
                        <span className="font-serif text-base font-medium text-[#2C4675]">
                          {v.visitName}
                        </span>
                        <span className="font-mono text-xs text-[#4263A0]">
                          {v.date || 'Baseline'} · {v.records.length} record(s)
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {v.records.map((rec) => (
                          <div
                            key={`${rec.domain}-${rec.seq}`}
                            className="flex items-center gap-2 rounded-lg border border-[#4263A0]/15 bg-[#E6F0EC]/60 px-2.5 py-1.5 text-xs"
                          >
                            <CitationChip
                              recordRef={{
                                domain: rec.domain,
                                usubjid: rec.usubjid,
                                seq: rec.seq,
                              }}
                              onInspect={onInspectRecord}
                              labelOverride={`${rec.domain} #${rec.seq}`}
                            />
                            <span className="text-[#2C4675]">
                              {rec.testCode || rec.testName || rec.values.AETERM || rec.values.CMTRT || rec.values.EXTRT || ''}{' '}
                              {rec.censored
                                ? `<${rec.censorThreshold}`
                                : rec.notDone
                                ? 'ND'
                                : rec.canonicalValue ?? rec.rawValueStr ?? ''}{' '}
                              {rec.canonicalUnit || rec.unit || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* =====================================================================
          PROTOCOL VERSION RULE DIFF TABLE (v1 -> v2 -> v3)
         ===================================================================== */}
      <div className="rounded-2xl border border-[#4263A0]/25 bg-white/75 p-6 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-[#3F68A8]" />
          <h3 className="font-serif text-xl text-[#2C4675]">
            {plainEnglish
              ? 'Protocol Version Amendments & Rule Changes Over Time'
              : 'Dynamic Protocol Rule Diff Between Versions (Parsed from documents/protocol_*.md)'}
          </h3>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from(studyData.protocolVersions.values()).map((pv) => (
            <div
              key={pv.version}
              className={`rounded-xl border p-4 ${
                pv.version === currentSnapshot.protocolVersion
                  ? 'border-[#3F68A8] bg-white shadow-xs'
                  : 'border-[#4263A0]/20 bg-white/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-lg font-semibold text-[#2C4675]">
                  Protocol {pv.version}
                </span>
                <span className="font-mono text-xs text-[#4263A0]">
                  Effective Cut {pv.effectiveCut}
                </span>
              </div>
              <div className="mt-2 space-y-1 font-mono text-xs text-[#2C4675]">
                <div>
                  Hy&apos;s Law: ALT &gt;{pv.hysLawAltMultiplier}x + BILI &gt;
                  {pv.hysLawBiliMultiplier}x ({pv.hysLawWindowDays}d)
                </div>
                <div>
                  Age Range: {pv.exclusionCriteria.minAge}–{pv.exclusionCriteria.maxAge} yrs
                </div>
                <div>Prohibited Meds: {pv.prohibitedMeds.join(', ')}</div>
              </div>
              {pv.diffFromPrevious.length > 0 && (
                <div className="mt-3 border-t border-[#4263A0]/15 pt-2.5">
                  <div className="text-[11px] font-semibold text-[#92400E] uppercase">
                    Rule Diff from Previous Version:
                  </div>
                  <ul className="mt-1 space-y-1 text-xs text-[#2C4675]">
                    {pv.diffFromPrevious.map((d, i) => (
                      <li key={i}>
                        <strong>{d.label}:</strong> {d.before} →{' '}
                        <span className="font-semibold text-[#3F68A8]">{d.after}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
