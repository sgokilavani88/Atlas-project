/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ingestStudyFiles } from './engine/atlas/ingestion';
import { createDefaultSyntheticFiles } from './engine/atlas/syntheticBundle';
import { StudyWatch, WatchOptions } from './engine/watch/studyWatch';
import { RecordRef } from './engine/schema';
import { PharmacyPosterBackground } from './ui/PharmacyPosterBackground';
import { LandingPosterScreen } from './ui/LandingPosterScreen';
import { AtlasScreen } from './ui/AtlasScreen';
import { MonitorScreen } from './ui/MonitorScreen';
import { WatchScreen } from './ui/WatchScreen';
import { ExplainScreen } from './ui/ExplainScreen';
import { ReportScreen } from './ui/ReportScreen';
import { TamperLabAndSelfCheckScreen } from './ui/TamperLabAndSelfCheckScreen';
import { RecordDrawer } from './ui/RecordDrawer';

type ScreenId =
  | 'landing'
  | 'atlas'
  | 'monitor'
  | 'watch'
  | 'explain'
  | 'report'
  | 'tamper_lab'
  | 'self_check';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('landing');
  // Plain English is the default per Section 1 specification
  const [plainEnglish, setPlainEnglish] = useState<boolean>(true);

  const [rawFiles, setRawFiles] = useState<Record<string, string>>(() =>
    createDefaultSyntheticFiles()
  );
  const [studyName, setStudyName] = useState<string>('Study Sentinel — Synthetic Trial');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [monitorDelayCuts, setMonitorDelayCuts] = useState<number>(2);
  const [monitorResponseRate, setMonitorResponseRate] = useState<number>(0.6);
  const [totalTokensBudget, setTotalTokensBudget] = useState<number>(6000);
  const [totalMsBudget, setTotalMsBudget] = useState<number>(60000);

  const [currentCut, setCurrentCut] = useState<number>(12);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [inspectedRef, setInspectedRef] = useState<RecordRef | null>(null);

  // Build study data & run 12-cut surveillance deterministically
  const { studyData, watch, report } = useMemo(() => {
    const ingested = ingestStudyFiles(rawFiles, studyName);
    const opts: WatchOptions = {
      totalTokensBudget,
      totalMsBudget,
      tokensPerNarrativeCut: 380,
      monitorConfig: {
        delayCuts: monitorDelayCuts,
        responseRate: monitorResponseRate,
        seed: 42,
      },
    };
    const w = new StudyWatch(ingested, opts);
    const rep = w.runPeriod();
    return { studyData: ingested, watch: w, report: rep };
  }, [rawFiles, studyName, monitorDelayCuts, monitorResponseRate, totalTokensBudget, totalMsBudget]);

  // Synchronize graph state to the currently selected cut on the scrubber
  const activeSnapshot = useMemo(() => {
    const snap =
      report.snapshots.get(currentCut) ||
      report.snapshots.get(report.currentCut)!;
    if (watch.graph.currentCut !== snap.cut) {
      watch.graph.build(snap.cut);
    }
    return snap;
  }, [report, currentCut, watch]);

  const handleIngestFiles = useCallback(
    (newFiles: Record<string, string>, newStudyName: string) => {
      setIsLoading(true);
      // Spawn Web Worker for off-thread validation when available, then commit state
      try {
        if (typeof Worker !== 'undefined') {
          const worker = new Worker(
            new URL('./engine/watch/surveillanceWorker.ts', import.meta.url),
            { type: 'module' }
          );
          worker.onmessage = () => {
            setRawFiles(newFiles);
            setStudyName(newStudyName);
            setCurrentCut(12);
            setIsLoading(false);
            worker.terminate();
          };
          worker.onerror = () => {
            setRawFiles(newFiles);
            setStudyName(newStudyName);
            setCurrentCut(12);
            setIsLoading(false);
            worker.terminate();
          };
          worker.postMessage({
            id: String(Date.now()),
            rawFiles: newFiles,
            studyName: newStudyName,
            options: { totalTokensBudget },
          });
          return;
        }
      } catch {
        // Fallback to synchronous ingestion
      }
      setRawFiles(newFiles);
      setStudyName(newStudyName);
      setCurrentCut(12);
      setIsLoading(false);
    },
    [totalTokensBudget]
  );

  const handleResetDefaultDataset = useCallback(() => {
    setRawFiles(createDefaultSyntheticFiles());
    setStudyName('Study Sentinel — Synthetic Trial');
    setMonitorDelayCuts(2);
    setMonitorResponseRate(0.6);
    setTotalTokensBudget(6000);
    setTotalMsBudget(60000);
    setCurrentCut(12);
  }, []);

  const inspectedRecord = useMemo(
    () => (inspectedRef ? watch.graph.resolveRecord(inspectedRef) : undefined),
    [inspectedRef, watch, activeSnapshot.cut]
  );

  const navItems: Array<{ id: ScreenId; label: string }> = [
    { id: 'landing', label: 'Poster & Data' },
    { id: 'atlas', label: 'Atlas 360' },
    { id: 'monitor', label: 'Monitor Crew' },
    { id: 'watch', label: '12-Cut Watch' },
    { id: 'explain', label: 'Explain Ledger' },
    { id: 'report', label: 'Report' },
    { id: 'tamper_lab', label: 'Tamper Lab' },
    { id: 'self_check', label: 'Self-Check ✓' },
  ];

  return (
    <PharmacyPosterBackground showLineArt={activeScreen === 'landing'}>
      {/* Strictly 3-Zone Top Navigation Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#4263A0]/20 bg-[#E6F0EC]/85 px-4 py-3 backdrop-blur-md md:px-8 print:hidden">
        {/* Zone 1: Single Text Wordmark in Display Serif Face */}
        <button
          type="button"
          onClick={() => setActiveScreen('landing')}
          className="font-serif text-lg font-semibold tracking-wider text-[#2C4675] uppercase whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#3F68A8]"
        >
          Study Sentinel
        </button>

        {/* Zone 2: Clean Text Navigation Links */}
        <nav
          aria-label="Primary workspace navigation"
          className="flex items-center gap-1 overflow-x-auto px-2 sm:gap-4"
        >
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveScreen(item.id)}
                className={`px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-b-2 border-[#3F68A8] font-semibold text-[#2C4675]'
                    : 'text-[#4263A0] hover:text-[#2C4675]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Plain English / Technical Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Language Mode Toggle"
            className="flex items-center rounded-xl border border-[#4263A0]/25 bg-white/80 p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => setPlainEnglish(true)}
              className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                plainEnglish
                  ? 'bg-[#3F68A8] text-white shadow-2xs'
                  : 'text-[#4263A0] hover:text-[#2C4675]'
              }`}
            >
              Plain English
            </button>
            <button
              type="button"
              onClick={() => setPlainEnglish(false)}
              className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                !plainEnglish
                  ? 'bg-[#3F68A8] text-white shadow-2xs'
                  : 'text-[#4263A0] hover:text-[#2C4675]'
              }`}
            >
              Technical
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Router */}
      <main className="pb-16">
        {activeScreen === 'landing' && (
          <LandingPosterScreen
            studyData={studyData}
            onIngestFiles={handleIngestFiles}
            onResetDefaultDataset={handleResetDefaultDataset}
            onEnterWorkspace={() => setActiveScreen('watch')}
            isLoading={isLoading}
            plainEnglish={plainEnglish}
          />
        )}

        {activeScreen === 'atlas' && (
          <AtlasScreen
            studyData={studyData}
            graph={watch.graph}
            currentSnapshot={activeSnapshot}
            selectedSubject={selectedSubject}
            onSelectSubject={setSelectedSubject}
            onInspectRecord={setInspectedRef}
            plainEnglish={plainEnglish}
          />
        )}

        {activeScreen === 'monitor' && (
          <MonitorScreen
            currentSnapshot={activeSnapshot}
            crew={watch.crew}
            onInspectRecord={setInspectedRef}
            plainEnglish={plainEnglish}
          />
        )}

        {activeScreen === 'watch' && (
          <WatchScreen
            report={report}
            currentCut={currentCut}
            onSelectCut={setCurrentCut}
            monitorDelayCuts={monitorDelayCuts}
            monitorResponseRate={monitorResponseRate}
            onUpdateSimulationParams={({ delayCuts, responseRate }) => {
              setMonitorDelayCuts(delayCuts);
              setMonitorResponseRate(responseRate);
            }}
            onRunTightBudgetStressTest={() => {
              setTotalTokensBudget(1500);
              setCurrentCut(12);
            }}
            onRestoreNormalBudget={() => {
              setTotalTokensBudget(6000);
              setTotalMsBudget(60000);
            }}
            onInspectRecord={setInspectedRef}
            plainEnglish={plainEnglish}
          />
        )}

        {activeScreen === 'explain' && (
          <ExplainScreen
            report={report}
            watch={watch}
            onInspectRecord={setInspectedRef}
            plainEnglish={plainEnglish}
          />
        )}

        {activeScreen === 'report' && (
          <ReportScreen
            studyData={studyData}
            report={report}
            watch={watch}
            onInspectRecord={setInspectedRef}
            plainEnglish={plainEnglish}
          />
        )}

        {(activeScreen === 'tamper_lab' || activeScreen === 'self_check') && (
          <TamperLabAndSelfCheckScreen
            activeTab={activeScreen}
            rawFiles={rawFiles}
            report={report}
            onApplyInjectedScenario={(nextFiles, _desc, overrideMon) => {
              setRawFiles(nextFiles);
              if (overrideMon) {
                setMonitorDelayCuts(overrideMon.delayCuts);
                setMonitorResponseRate(overrideMon.responseRate);
              }
              setCurrentCut(12);
            }}
            onResetCleanDataset={handleResetDefaultDataset}
            plainEnglish={plainEnglish}
          />
        )}
      </main>

      {/* Global Side Drawer for Inspecting Any RecordRef Citation */}
      <RecordDrawer
        selectedRef={inspectedRef}
        record={inspectedRecord}
        onClose={() => setInspectedRef(null)}
        onOpenPatient360={(usubjid) => {
          setSelectedSubject(usubjid);
          setActiveScreen('atlas');
        }}
        plainEnglish={plainEnglish}
      />
    </PharmacyPosterBackground>
  );
}
