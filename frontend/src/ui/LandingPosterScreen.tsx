import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import { IngestedStudyData } from '../engine/schema';
import { Upload, FolderOpen, CheckCircle2, ArrowRight, Database, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';

interface Props {
  studyData: IngestedStudyData;
  onIngestFiles: (files: Record<string, string>, studyName: string) => void;
  onResetDefaultDataset: () => void;
  onEnterWorkspace: () => void;
  isLoading: boolean;
  plainEnglish: boolean;
}

export const LandingPosterScreen: React.FC<Props> = ({
  studyData,
  onIngestFiles,
  onResetDefaultDataset,
  onEnterWorkspace,
  isLoading,
  plainEnglish,
}) => {
  const [showDropDrawer, setShowDropDrawer] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropSectionRef = useRef<HTMLDivElement>(null);

  const handleStartWatchClick = () => {
    setShowDropDrawer(true);
    setTimeout(() => {
      dropSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const processFileList = async (fileList: FileList | File[]) => {
    setUploadError(null);
    setUploadStatus('Reading study archive...');
    try {
      const filesArray = Array.from(fileList);
      if (filesArray.length === 0) return;

      const fileMap: Record<string, string> = {};
      let studyLabel = 'Uploaded Clinical Study';

      // Check if a .zip archive was dropped or selected
      const zipFile = filesArray.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        studyLabel = zipFile.name.replace(/\.zip$/i, '');
        const zip = await JSZip.loadAsync(zipFile);
        const entries = Object.entries(zip.files);
        for (const [relPath, zipObj] of entries) {
          if (zipObj.dir) continue;
          const lower = relPath.toLowerCase();
          if (
            lower.endsWith('.csv') ||
            lower.endsWith('.md') ||
            lower.endsWith('.json')
          ) {
            const text = await zipObj.async('string');
            fileMap[relPath] = text;
          }
        }
      } else {
        // Folder or multi-file drop
        for (const f of filesArray) {
          const relPath = (f as any).webkitRelativePath || f.name;
          const lower = relPath.toLowerCase();
          if (
            lower.endsWith('.csv') ||
            lower.endsWith('.md') ||
            lower.endsWith('.json')
          ) {
            const text = await f.text();
            fileMap[relPath] = text;
          }
        }
        const firstRel = (filesArray[0] as any).webkitRelativePath || '';
        if (firstRel.includes('/')) {
          studyLabel = firstRel.split('/')[0];
        }
      }

      const fileCount = Object.keys(fileMap).length;
      if (fileCount === 0) {
        setUploadError(
          'No .csv, .md, or .json files found in selection. Drop a study folder or .zip with data/, documents/, responses/.'
        );
        setUploadStatus(null);
        return;
      }

      setUploadStatus(`Ingested ${fileCount} files from "${studyLabel}". Building StudyGraph...`);
      onIngestFiles(fileMap, studyLabel);
      setUploadStatus(`Successfully loaded "${studyLabel}" (${fileCount} files).`);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to parse dropped archive.');
      setUploadStatus(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFileList(e.dataTransfer.files);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between px-6 py-8 md:px-12">
      {/* =====================================================================
          POSTER ONE-TO-ONE REPRODUCTION SECTION
         ===================================================================== */}
      <div className="relative flex min-h-[78vh] flex-col justify-between rounded-3xl border border-[#4263A0]/15 bg-white/20 p-6 shadow-sm backdrop-blur-xs md:p-12">
        {/* Top Row: Left Rotating Circular SVG Badge + Right Pill Button */}
        <div className="flex items-start justify-between gap-4">
          {/* Top-Left Circular Badge with SVG textPath & Big Serif Number */}
          <div
            className="relative flex h-36 w-36 items-center justify-center md:h-44 md:w-44"
            aria-label="12 Cuts — Always Watching"
          >
            <svg
              viewBox="0 0 200 200"
              className="h-full w-full animate-[spin_28s_linear_infinite] motion-reduce:animate-none"
            >
              <defs>
                <path
                  id="sentinelCirclePath"
                  d="M 100, 100 m -74, 0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"
                />
              </defs>
              <text
                fill="#4263A0"
                fontSize="13.5"
                fontFamily="'Playfair Display', Georgia, serif"
                letterSpacing="4.6px"
              >
                <textPath href="#sentinelCirclePath" startOffset="0%">
                  12 CUTS — ALWAYS WATCHING •
                </textPath>
              </text>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-serif text-3xl font-normal tracking-tight text-[#3F68A8] md:text-4xl"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                24/7
              </span>
              <span className="mt-0.5 font-mono text-[10px] tracking-widest text-[#4263A0]/80 uppercase">
                12 CUTS
              </span>
            </div>
          </div>

          {/* Top-Right Solid #3F68A8 Pill Button + small study-sentinel.app text below */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleStartWatchClick}
              className="rounded-full bg-[#3F68A8] px-7 py-3 font-serif text-sm font-bold tracking-wider text-white uppercase shadow-md transition-all hover:bg-[#32548A] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F68A8] md:px-9 md:py-3.5 md:text-base"
            >
              START THE WATCH
            </button>
            <span
              className="mt-2 font-serif text-sm tracking-wide text-[#3F68A8] md:text-base"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              study-sentinel.app
            </span>
          </div>
        </div>

        {/* Center Headline: Elegant High-Contrast Serif, Centred, Muted Steel Blue (#4263A0) */}
        <div className="my-auto py-8 text-center">
          <h1
            className="mx-auto max-w-3xl font-serif text-4xl leading-[1.16] font-normal tracking-tight text-[#4263A0] sm:text-5xl md:text-6xl lg:text-[4.25rem]"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              textWrap: 'balance',
            }}
          >
            We Watch Every Trial.
            <br />
            We Prove Every Answer.
          </h1>

          {/* Center Logo Lockup: Gradient Crescent Ring (Indigo to Teal) around Serif Letter "S" */}
          <div className="mt-10 flex flex-col items-center justify-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg viewBox="0 0 120 120" className="h-full w-full">
                <defs>
                  <linearGradient id="crescentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B3B98" />
                    <stop offset="55%" stopColor="#1B6CA8" />
                    <stop offset="100%" stopColor="#00B4D8" />
                  </linearGradient>
                </defs>
                {/* Outer minus inner circle shifted to top-right creates exact tapered crescent moon arc */}
                <path
                  d="M 62 12 A 46 46 0 1 0 102 82 A 43 43 0 1 1 62 12 Z"
                  fill="url(#crescentGrad)"
                />
                <text
                  x="62"
                  y="70"
                  textAnchor="middle"
                  fill="#3F68A8"
                  fontSize="40"
                  fontWeight="300"
                  fontFamily="'Playfair Display', Georgia, serif"
                >
                  S
                </text>
              </svg>
            </div>

            <div
              className="mt-2 font-serif text-xl tracking-[0.22em] text-[#4263A0] uppercase md:text-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              STUDY SENTINEL
            </div>
            <div className="mt-1 text-[11px] font-medium tracking-[0.34em] text-[#4263A0]/90 uppercase">
              PROVE EVERY ANSWER.
            </div>
          </div>
        </div>

        {/* Bottom subtle action bar inside poster */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#4263A0]/15 pt-4 text-xs text-[#4263A0]">
          <div>
            {plainEnglish
              ? 'Every number on screen is a claim, and every claim carries its source record.'
              : 'RecordRef(domain, usubjid, seq) · Incremental StudyGraph · Append-Only Decision Ledger'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartWatchClick}
              className="font-semibold underline decoration-[#4263A0]/40 underline-offset-4 hover:text-[#2C4675]"
            >
              {showDropDrawer ? 'Inspect Data Drop & Registry ↓' : 'Drop Custom Study Archive (.zip / folder)'}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3F68A8] px-4 py-2 font-semibold text-white shadow-xs transition-colors hover:bg-[#32548A]"
            >
              <span>Open Active Surveillance ({studyData.cuts.length} Cuts)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SCHEMA-DRIVEN DATA DROP & DYNAMIC REGISTRY DRAWER
         ===================================================================== */}
      <div ref={dropSectionRef} className="mt-10 space-y-6">
        <div className="rounded-2xl border border-[#4263A0]/25 bg-white/70 p-6 shadow-sm backdrop-blur-md md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-normal text-[#2C4675]">
                {plainEnglish
                  ? 'Study Data Ingestion & Automatic Schema Discovery'
                  : 'Schema-Driven Data Drop (data/, documents/, responses/)'}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[#4263A0]">
                {plainEnglish
                  ? 'Drag and drop a study .zip archive or folder. Study Sentinel discovers domains, laboratory reference ranges, unit conversions, and protocol versions automatically with zero hard-coded IDs.'
                  : 'Accepts any study archive with data/*.csv, documents/*.md, and responses/*.json. Parses once into indexed Maps by subject, domain, and cut.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetDefaultDataset}
                className="rounded-xl border border-[#4263A0]/25 bg-white/80 px-3.5 py-2 text-xs font-medium text-[#2C4675] hover:bg-white"
              >
                Reload Built-In Synthetic Study
              </button>
              <button
                type="button"
                onClick={onEnterWorkspace}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3F68A8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#32548A]"
              >
                <span>Proceed to Atlas & Watch</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-[#3F68A8] bg-[#3F68A8]/10'
                : 'border-[#4263A0]/30 bg-[#E6F0EC]/60 hover:border-[#3F68A8]/60'
            }`}
          >
            <Upload className="h-8 w-8 text-[#3F68A8]" />
            <div className="mt-3 font-serif text-lg text-[#2C4675]">
              Drag & drop <span className="font-mono text-base font-semibold">hackathon-data.zip</span>{' '}
              or any study folder here
            </div>
            <p className="mt-1 text-xs text-[#4263A0]">
              Supports up to 30 MB archives · Automatic ISO / DD-MON-YYYY date hygiene ·{' '}
              <span className="font-mono">&lt;5</span> censored &amp; decimal comma support
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,.csv,.md,.json"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && processFileList(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: '', directory: '' } as any)}
                multiple
                className="hidden"
                onChange={(e) => e.target.files && processFileList(e.target.files)}
              />
              <button
                type="button"
                onClick={() => zipInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3F68A8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#32548A]"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Select .ZIP or Files</span>
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-[#4263A0]/30 bg-white/90 px-4 py-2 text-xs font-semibold text-[#2C4675] hover:bg-white"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Select Study Folder</span>
              </button>
            </div>

            {uploadStatus && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#DEF7EC] px-3 py-1.5 text-xs font-medium text-[#1E4620]">
                <CheckCircle2 className="h-4 w-4" />
                <span>{uploadStatus}</span>
              </div>
            )}
            {uploadError && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#FDE8E8] px-3 py-1.5 text-xs font-medium text-[#9B2C2C]">
                <AlertTriangle className="h-4 w-4" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Currently Ingested Dynamic Domain Registry Summary */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#4263A0]/20 bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#4263A0] uppercase">
                <Database className="h-4 w-4" />
                <span>Discovered Domains ({studyData.domains.size})</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                {Array.from(studyData.domains.values()).map((dom) => (
                  <div
                    key={dom.domain}
                    className="flex items-center justify-between border-b border-[#4263A0]/10 pb-1 font-mono"
                  >
                    <span className="font-semibold text-[#2C4675]">
                      {dom.domain} ({dom.seqColumn})
                    </span>
                    <span className="text-[#4263A0]">
                      {dom.rowCount} rows ·{' '}
                      {dom.onboardedAtCut > 1 ? (
                        <strong className="text-[#92400E]">Onboarded Cut {dom.onboardedAtCut}</strong>
                      ) : (
                        'Cut 1'
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#4263A0]/20 bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#4263A0] uppercase">
                <ShieldCheck className="h-4 w-4" />
                <span>Verified Lab Unit Conversions</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                {studyData.unitConversions.map((uc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border-b border-[#4263A0]/10 pb-1 font-mono"
                  >
                    <span className="font-semibold text-[#2C4675]">
                      {uc.test}: {uc.fromUnit} → {uc.toUnit}
                    </span>
                    <span className="text-[#1E4620]">
                      ×{uc.textbookFactor} {uc.verified ? '✓ Verified' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#4263A0]/20 bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#4263A0] uppercase">
                <FileText className="h-4 w-4" />
                <span>Protocol Versions &amp; Hygiene Log</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                {Array.from(studyData.protocolVersions.values()).map((pv) => (
                  <div
                    key={pv.version}
                    className="flex items-center justify-between border-b border-[#4263A0]/10 pb-1"
                  >
                    <span className="font-mono font-semibold text-[#2C4675]">
                      Protocol {pv.version} (Cut {pv.effectiveCut})
                    </span>
                    <span className="font-mono text-[11px] text-[#4263A0]">
                      {pv.tampered ? (
                        <strong className="text-[#9B2C2C]">Tamper Blocked</strong>
                      ) : (
                        `SHA ${pv.sha256.slice(0, 8)}…`
                      )}
                    </span>
                  </div>
                ))}
                <div className="pt-1 text-[11px] text-[#4263A0]">
                  Data hygiene events logged: <strong>{studyData.dataQualityIssues.length}</strong>{' '}
                  (censored values, decimal commas, duplicate subject checks)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
