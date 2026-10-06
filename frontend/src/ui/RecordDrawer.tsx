import React from 'react';
import { DomainRecord, RecordRef } from '../engine/schema';
import { X, FileCheck2, History, ArrowUpRight, AlertCircle } from 'lucide-react';

interface ChipProps {
  recordRef: RecordRef;
  onInspect: (ref: RecordRef) => void;
  labelOverride?: string;
}

export const CitationChip: React.FC<ChipProps> = ({
  recordRef,
  onInspect,
  labelOverride,
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onInspect(recordRef);
      }}
      title={`Inspect raw record (${recordRef.domain}, ${recordRef.usubjid}, #${recordRef.seq})`}
      className="inline-flex items-center gap-1 rounded-md border border-[#4263A0]/30 bg-white/80 px-2 py-0.5 font-mono text-xs font-medium text-[#2C4675] shadow-xs transition-colors hover:border-[#3F68A8] hover:bg-[#3F68A8] hover:text-white focus-visible:outline-2 focus-visible:outline-[#3F68A8]"
    >
      <span>
        {labelOverride || `${recordRef.domain} · ${recordRef.usubjid} · #${recordRef.seq}`}
      </span>
      <ArrowUpRight className="h-3 w-3 shrink-0 opacity-75" />
    </button>
  );
};

interface DrawerProps {
  selectedRef: RecordRef | null;
  record: DomainRecord | undefined;
  onClose: () => void;
  onOpenPatient360: (usubjid: string) => void;
  plainEnglish: boolean;
}

export const RecordDrawer: React.FC<DrawerProps> = ({
  selectedRef,
  record,
  onClose,
  onOpenPatient360,
  plainEnglish,
}) => {
  if (!selectedRef) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#1E2F4D]/30 backdrop-blur-xs transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Raw Domain Record Evidence Drawer"
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-[#4263A0]/25 bg-gradient-to-b from-[#EDF5F2] to-[#D9EFECE6] p-6 text-[#2C4675] shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#4263A0]/20 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#4263A0]">
              <FileCheck2 className="h-4 w-4" />
              <span>
                {plainEnglish
                  ? 'Verified Clinical Source Record'
                  : 'Canonical RecordRef Citation Triple'}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#2C4675]">
              {selectedRef.domain} · {selectedRef.usubjid} · #{selectedRef.seq}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close record drawer"
            className="rounded-lg border border-[#4263A0]/20 bg-white/70 p-2 text-[#4263A0] hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!record ? (
          <div className="mt-6 rounded-2xl border border-[#F8B4B4] bg-[#FDE8E8] p-4 text-sm text-[#9B2C2C]">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" />
              <span>Record Not Yet Available at Selected Cut</span>
            </div>
            <p className="mt-1">
              Triple ({selectedRef.domain}, {selectedRef.usubjid}, #{selectedRef.seq}) was not
              found in the active study graph at this cut.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
            {/* Provenance Metadata */}
            <div className="rounded-2xl border border-[#4263A0]/20 bg-white/75 p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4263A0]">
                <span>Site: {record.site}</span>
                <span>·</span>
                <span>Available at Cut {record.cut_available}</span>
                {record.corrected_at_cut && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-[#92400E]">
                      Corrected at Cut {record.corrected_at_cut}
                    </span>
                  </>
                )}
              </div>

              {record.domain === 'LB' && (
                <div className="mt-3 border-t border-[#4263A0]/15 pt-3 text-sm">
                  <div className="font-medium text-[#2C4675]">
                    {plainEnglish
                      ? 'Normalized Lab Value & Reference Range'
                      : 'Unit Conversion & Reference Normalization'}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="rounded-lg bg-[#E6F0EC] p-2">
                      <div className="text-[11px] text-[#4263A0]">Raw Reported</div>
                      <div className="mt-0.5 text-sm font-semibold text-[#2C4675]">
                        {record.rawValueStr || 'ND'} {record.unit || ''}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#E6F0EC] p-2">
                      <div className="text-[11px] text-[#4263A0]">Canonical Converted</div>
                      <div className="mt-0.5 text-sm font-semibold text-[#2C4675]">
                        {record.censored
                          ? `<${record.censorThreshold} (Censored)`
                          : record.notDone
                          ? 'Not Done'
                          : `${record.canonicalValue ?? record.numericValue ?? ''} ${
                              record.canonicalUnit || record.unit || ''
                            }`}
                      </div>
                    </div>
                  </div>
                  {record.conversionFactorUsed && record.conversionFactorUsed !== 1 && (
                    <p className="mt-2 text-xs text-[#4263A0]">
                      Conversion factor applied:{' '}
                      <span className="font-mono font-semibold">
                        ×{record.conversionFactorUsed}
                      </span>{' '}
                      (Lab: {record.labId || 'LOCAL'} → Central range ≤{record.refHigh}{' '}
                      {record.canonicalUnit})
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Correction History if any */}
            {record.history.length > 0 && (
              <div className="rounded-2xl border border-[#FCD34D] bg-[#FEF3C7]/85 p-4 text-xs text-[#92400E]">
                <div className="flex items-center gap-1.5 font-semibold">
                  <History className="h-4 w-4" />
                  <span>
                    {plainEnglish
                      ? 'Audit Trail of Corrections on This Record'
                      : 'Field Supersession History (corrections.csv)'}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {record.history.map((h, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-[#FCD34D] bg-white/80 p-2 font-mono"
                    >
                      <div>
                        Cut {h.cut} · Field <span className="font-semibold">{h.field}</span>:{' '}
                        <span className="line-through opacity-70">{h.oldValue}</span> →{' '}
                        <span className="font-bold text-[#1E4620]">{h.newValue}</span>
                      </div>
                      {h.reason && (
                        <div className="mt-0.5 font-sans text-[11px] text-[#92400E]">
                          Reason: {h.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Domain Columns Table */}
            <div className="rounded-2xl border border-[#4263A0]/20 bg-white/80 p-4">
              <h3 className="text-xs font-semibold tracking-wide text-[#4263A0] uppercase">
                {plainEnglish ? 'Complete Record Fields' : 'Domain CSV Attributes'}
              </h3>
              <dl className="mt-3 divide-y divide-[#4263A0]/10 text-xs">
                {Object.entries(record.values).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="font-mono font-medium text-[#4263A0]">{k}</dt>
                    <dd className="text-right font-mono font-semibold text-[#2C4675] break-all">
                      {v || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[#4263A0]/20 pt-4">
          <button
            type="button"
            onClick={() => {
              onOpenPatient360(selectedRef.usubjid);
              onClose();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3F68A8] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#32548A]"
          >
            <span>Open Patient 360 ({selectedRef.usubjid})</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#4263A0]/25 bg-white/80 px-4 py-2.5 text-xs font-medium text-[#2C4675] hover:bg-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
