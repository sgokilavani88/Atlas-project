import {
  CorrectionEntry,
  CutDefinition,
  DataQualityIssue,
  DocumentSnapshot,
  DomainRecord,
  DomainSchema,
  IngestedStudyData,
  MonitorDecisionSeed,
  ProtocolRuleDiff,
  ProtocolRules,
  RecordRef,
  ReferenceRange,
  SiteReplySeed,
  UnitConversionEntry,
} from '../schema';

/**
 * Textbook conversion factors between SI and conventional clinical laboratory units.
 * Used to verify data-derived conversion ratios across laboratories.
 */
export const TEXTBOOK_CONVERSION_FACTORS: Record<
  string,
  Array<{ fromUnit: string; toUnit: string; factor: number }>
> = {
  GLUC: [
    { fromUnit: 'mmol/L', toUnit: 'mg/dL', factor: 18.0 },
    { fromUnit: 'mg/dL', toUnit: 'mmol/L', factor: 1 / 18.0 },
  ],
  GLUCOSE: [
    { fromUnit: 'mmol/L', toUnit: 'mg/dL', factor: 18.0 },
    { fromUnit: 'mg/dL', toUnit: 'mmol/L', factor: 1 / 18.0 },
  ],
  ALT: [
    { fromUnit: 'ukat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'µkat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'U/L', toUnit: 'ukat/L', factor: 1 / 60.0 },
  ],
  AST: [
    { fromUnit: 'ukat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'µkat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'U/L', toUnit: 'ukat/L', factor: 1 / 60.0 },
  ],
  ALP: [
    { fromUnit: 'ukat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'µkat/L', toUnit: 'U/L', factor: 60.0 },
    { fromUnit: 'U/L', toUnit: 'ukat/L', factor: 1 / 60.0 },
  ],
  BILI: [
    { fromUnit: 'umol/L', toUnit: 'mg/dL', factor: 1 / 17.1 },
    { fromUnit: 'µmol/L', toUnit: 'mg/dL', factor: 1 / 17.1 },
    { fromUnit: 'mg/dL', toUnit: 'umol/L', factor: 17.1 },
    { fromUnit: 'mg/dL', toUnit: 'µmol/L', factor: 17.1 },
  ],
  TBILI: [
    { fromUnit: 'umol/L', toUnit: 'mg/dL', factor: 1 / 17.1 },
    { fromUnit: 'µmol/L', toUnit: 'mg/dL', factor: 1 / 17.1 },
    { fromUnit: 'mg/dL', toUnit: 'umol/L', factor: 17.1 },
  ],
  CREAT: [
    { fromUnit: 'umol/L', toUnit: 'mg/dL', factor: 1 / 88.4 },
    { fromUnit: 'µmol/L', toUnit: 'mg/dL', factor: 1 / 88.4 },
    { fromUnit: 'mg/dL', toUnit: 'umol/L', factor: 88.4 },
  ],
  HGB: [
    { fromUnit: 'g/dL', toUnit: 'g/L', factor: 10.0 },
    { fromUnit: 'g/L', toUnit: 'g/dL', factor: 0.1 },
  ],
};

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/**
 * Deterministic synchronous SHA-256 implementation (pure TypeScript) so hashing
 * works identically in browser main thread, Web Workers, and Vitest unit tests.
 */
export function sha256Hex(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const utf8 = unescape(encodeURIComponent(ascii));
  const asciiBitLength = utf8.length * 8;

  const hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let padded = utf8 + '\x80';
  while ((padded.length % 64) - 56 !== 0) padded += '\x00';
  for (let i = 0; i < padded.length; i++) {
    const j = padded.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const a = hash[0],
        e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Parse clinical dates in ISO (YYYY-MM-DD), DD-MON-YYYY (14-JAN-2025), or slash formats.
 * Returns { valid, iso, epochDays }. Never silently drops invalid dates.
 */
export function parseClinicalDate(raw: string | undefined): {
  valid: boolean;
  iso: string;
  epochDays: number | null;
} {
  if (!raw || raw.trim() === '') {
    return { valid: true, iso: '', epochDays: null };
  }
  const s = raw.trim();

  // 1. ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm...
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const utc = Date.UTC(y, m - 1, d);
      const check = new Date(utc);
      if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) {
        return {
          valid: true,
          iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          epochDays: Math.floor(utc / 86400000),
        };
      }
    }
    return { valid: false, iso: s, epochDays: null };
  }

  // 2. DD-MON-YYYY or D-MON-YYYY (e.g. 14-JAN-2025, 03-Mar-2025)
  const dmyMatch = /^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{4})$/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const monStr = dmyMatch[2].toUpperCase();
    const y = Number(dmyMatch[3]);
    const mIdx = MONTH_MAP[monStr];
    if (mIdx !== undefined && d >= 1 && d <= 31) {
      const utc = Date.UTC(y, mIdx, d);
      const check = new Date(utc);
      if (check.getUTCFullYear() === y && check.getUTCMonth() === mIdx && check.getUTCDate() === d) {
        return {
          valid: true,
          iso: `${String(y).padStart(4, '0')}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          epochDays: Math.floor(utc / 86400000),
        };
      }
    }
    return { valid: false, iso: s, epochDays: null };
  }

  // 3. YYYY/MM/DD
  const slashIso = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (slashIso) {
    const y = Number(slashIso[1]);
    const m = Number(slashIso[2]);
    const d = Number(slashIso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const utc = Date.UTC(y, m - 1, d);
      return {
        valid: true,
        iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        epochDays: Math.floor(utc / 86400000),
      };
    }
  }

  // 4. DD/MM/YYYY or MM/DD/YYYY when unambiguous
  const slashDmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slashDmy) {
    const p1 = Number(slashDmy[1]);
    const p2 = Number(slashDmy[2]);
    const y = Number(slashDmy[3]);
    const m = p1 <= 12 ? p1 : p2;
    const d = p1 <= 12 ? p2 : p1;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const utc = Date.UTC(y, m - 1, d);
      return {
        valid: true,
        iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        epochDays: Math.floor(utc / 86400000),
      };
    }
  }

  return { valid: false, iso: s, epochDays: null };
}

/**
 * Parse clinical lab/vital values according to data hygiene rules:
 * - "<5" -> censored = true, censorThreshold = 5, numericValue = undefined (never 0!)
 * - "ND", "NOT DONE", "" -> notDone = true
 * - "12,4" -> decimal comma converted to 12.4
 */
export function parseClinicalValue(raw: string | undefined): {
  rawValueStr: string;
  numericValue?: number;
  censored: boolean;
  censorThreshold?: number;
  notDone: boolean;
} {
  if (raw === undefined || raw === null) {
    return { rawValueStr: '', censored: false, notDone: true };
  }
  const trimmed = String(raw).trim();
  if (
    trimmed === '' ||
    trimmed.toUpperCase() === 'ND' ||
    trimmed.toUpperCase() === 'N/D' ||
    trimmed.toUpperCase() === 'NOT DONE' ||
    trimmed.toUpperCase() === 'NA'
  ) {
    return { rawValueStr: trimmed, censored: false, notDone: true };
  }

  // Check censored below detection "<5" or "< 0.5" or "<1,2"
  const censorMatch = /^<\s*=?\s*([0-9]+(?:[.,][0-9]+)?)$/.exec(trimmed);
  if (censorMatch) {
    const threshold = Number(censorMatch[1].replace(',', '.'));
    return {
      rawValueStr: trimmed,
      numericValue: undefined, // Never store censored below-detection as 0!
      censored: true,
      censorThreshold: threshold,
      notDone: false,
    };
  }

  // Decimal comma normalization ("12,4" -> 12.4)
  const normalized = trimmed.replace(',', '.');
  if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(normalized)) {
    return {
      rawValueStr: trimmed,
      numericValue: Number(normalized),
      censored: false,
      notDone: false,
    };
  }

  return {
    rawValueStr: trimmed,
    numericValue: undefined,
    censored: false,
    notDone: false,
  };
}

/**
 * Parse RFC-4180 CSV text into header + row objects.
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }
  if (currentCell.trim() !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const rowArr = lines[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowArr[c] ?? '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Derive and verify unit conversion table from reference_ranges.csv and textbook factors.
 */
export function buildUnitConversionRegistry(ranges: ReferenceRange[]): {
  conversions: UnitConversionEntry[];
  canonicalByTest: Map<string, ReferenceRange>;
  lookupByLabAndTest: Map<string, ReferenceRange>;
} {
  const conversions: UnitConversionEntry[] = [];
  const canonicalByTest = new Map<string, ReferenceRange>();
  const lookupByLabAndTest = new Map<string, ReferenceRange>();

  const byTest = new Map<string, ReferenceRange[]>();
  for (const r of ranges) {
    const testKey = r.test.toUpperCase();
    lookupByLabAndTest.set(`${r.lab.toUpperCase()}|${testKey}`, r);
    const list = byTest.get(testKey) || [];
    list.push(r);
    byTest.set(testKey, list);
  }

  for (const [test, testRanges] of byTest.entries()) {
    // Prefer conventional U/L or mg/dL or first listed range as canonical
    const preferred =
      testRanges.find((tr) => ['U/L', 'IU/L', 'mg/dL', 'g/dL', 'mmol/L'].includes(tr.unit)) ||
      testRanges[0];
    canonicalByTest.set(test, preferred);

    for (const r of testRanges) {
      if (r.unit.toLowerCase() === preferred.unit.toLowerCase() && r.high === preferred.high) {
        continue;
      }
      if (r.high > 0 && preferred.high > 0 && r.unit.toLowerCase() !== preferred.unit.toLowerCase()) {
        // If a value is in r.unit, multiplying by (preferred.high / r.high) converts it to preferred.unit
        const derivedFactor = preferred.high / r.high;
        const textbookList = TEXTBOOK_CONVERSION_FACTORS[test] || [];
        const match = textbookList.find(
          (tb) =>
            (tb.fromUnit.toLowerCase() === r.unit.toLowerCase() &&
              tb.toUnit.toLowerCase() === preferred.unit.toLowerCase()) ||
            Math.abs(tb.factor - derivedFactor) / tb.factor < 0.12
        );
        const textbookFactor = match ? match.factor : derivedFactor;
        const verified = Math.abs(derivedFactor - textbookFactor) / textbookFactor < 0.12;
        conversions.push({
          test,
          fromUnit: r.unit,
          toUnit: preferred.unit,
          fromLab: r.lab,
          toLab: preferred.lab,
          derivedFactor: Number(derivedFactor.toFixed(4)),
          textbookFactor: Number(textbookFactor.toFixed(4)),
          verified,
        });
      }
    }
  }

  return { conversions, canonicalByTest, lookupByLabAndTest };
}

/**
 * Convert a laboratory value to canonical units & return canonical reference range.
 */
export function normalizeLabMeasurement(
  testCode: string,
  numericValue: number | undefined,
  unit: string | undefined,
  labId: string | undefined,
  canonicalByTest: Map<string, ReferenceRange>,
  lookupByLabAndTest: Map<string, ReferenceRange>,
  conversions: UnitConversionEntry[]
): {
  canonicalValue?: number;
  canonicalUnit?: string;
  conversionFactorUsed?: number;
  refLow?: number;
  refHigh?: number;
} {
  const test = testCode.toUpperCase();
  const canonicalRange = canonicalByTest.get(test);
  if (!canonicalRange) {
    return {
      canonicalValue: numericValue,
      canonicalUnit: unit,
      conversionFactorUsed: 1,
    };
  }

  if (numericValue === undefined) {
    return {
      canonicalValue: undefined,
      canonicalUnit: canonicalRange.unit,
      refLow: canonicalRange.low,
      refHigh: canonicalRange.high,
    };
  }

  const cleanUnit = (unit || '').trim();
  // Check if unit already matches canonical unit
  if (!cleanUnit || cleanUnit.toLowerCase() === canonicalRange.unit.toLowerCase()) {
    // Also check if lab-specific range exists with same unit
    const labRange = labId ? lookupByLabAndTest.get(`${labId.toUpperCase()}|${test}`) : undefined;
    if (
      labRange &&
      labRange.unit.toLowerCase() === canonicalRange.unit.toLowerCase() &&
      labRange.high > 0
    ) {
      return {
        canonicalValue: numericValue,
        canonicalUnit: canonicalRange.unit,
        conversionFactorUsed: 1,
        refLow: labRange.low,
        refHigh: labRange.high,
      };
    }
    return {
      canonicalValue: numericValue,
      canonicalUnit: canonicalRange.unit,
      conversionFactorUsed: 1,
      refLow: canonicalRange.low,
      refHigh: canonicalRange.high,
    };
  }

  // Find data-derived conversion or textbook conversion
  const conv = conversions.find(
    (c) => c.test === test && c.fromUnit.toLowerCase() === cleanUnit.toLowerCase()
  );
  if (conv) {
    const factor = conv.verified ? conv.textbookFactor : conv.derivedFactor;
    return {
      canonicalValue: Number((numericValue * factor).toFixed(3)),
      canonicalUnit: canonicalRange.unit,
      conversionFactorUsed: factor,
      refLow: canonicalRange.low,
      refHigh: canonicalRange.high,
    };
  }

  const tbList = TEXTBOOK_CONVERSION_FACTORS[test] || [];
  const tb = tbList.find(
    (t) =>
      t.fromUnit.toLowerCase() === cleanUnit.toLowerCase() &&
      t.toUnit.toLowerCase() === canonicalRange.unit.toLowerCase()
  );
  if (tb) {
    return {
      canonicalValue: Number((numericValue * tb.factor).toFixed(3)),
      canonicalUnit: canonicalRange.unit,
      conversionFactorUsed: tb.factor,
      refLow: canonicalRange.low,
      refHigh: canonicalRange.high,
    };
  }

  return {
    canonicalValue: numericValue,
    canonicalUnit: cleanUnit,
    conversionFactorUsed: 1,
    refLow: canonicalRange.low,
    refHigh: canonicalRange.high,
  };
}

/**
 * Dynamic Domain Registry: inspects any domain CSV's headers and infers
 * key, sequence, date, value, and unit columns with zero hard-coding.
 */
export function inferDomainSchema(
  domain: string,
  headers: string[],
  onboardedAtCut: number,
  rowCount: number
): DomainSchema {
  const upperDomain = domain.toUpperCase();
  const seqColumn =
    headers.find((h) => h.toUpperCase() === `${upperDomain}SEQ`) ||
    headers.find((h) => h.toUpperCase().endsWith('SEQ')) ||
    'SEQ';

  const dateColumns = headers.filter((h) => {
    const u = h.toUpperCase();
    return (
      u.endsWith('DTC') ||
      u.endsWith('DT') ||
      u.includes('DATE') ||
      u === 'BRTHDTC' ||
      u === 'RFSTDTC'
    );
  });

  const valueColumns = headers.filter((h) => {
    const u = h.toUpperCase();
    return (
      u.endsWith('ORRES') ||
      u.endsWith('STRESN') ||
      u.endsWith('STRESC') ||
      u.endsWith('DOSE') ||
      u.endsWith('TERM') ||
      u.endsWith('DECOD') ||
      u.endsWith('TRT') ||
      u.endsWith('VAL') ||
      u === 'VALUE' ||
      u === 'RESULT'
    );
  });

  const unitColumns = headers.filter((h) => {
    const u = h.toUpperCase();
    return u.endsWith('ORRESU') || u.endsWith('STRESU') || u.endsWith('DOSU') || u.includes('UNIT');
  });

  const testColumn = headers.find((h) => {
    const u = h.toUpperCase();
    return (
      u === `${upperDomain}TESTCD` ||
      u.endsWith('TESTCD') ||
      u === `${upperDomain}TEST` ||
      u.endsWith('TEST') ||
      u.endsWith('TERM') ||
      u.endsWith('TRT')
    );
  });

  const catColumn = headers.find((h) => h.toUpperCase().endsWith('CAT'));
  const siteColumn = headers.find((h) => ['SITEID', 'SITE', 'INVID'].includes(h.toUpperCase()));

  return {
    domain: upperDomain,
    seqColumn,
    keyColumns: ['USUBJID', seqColumn],
    dateColumns,
    valueColumns,
    unitColumns,
    testColumn,
    catColumn,
    siteColumn,
    onboardedAtCut,
    columns: headers,
    rowCount,
  };
}

/**
 * Scan document text for adversarial prompt-injection sentences addressed to
 * automated reviewers, AI monitors, or safety suppression systems.
 */
export function detectDocumentTampering(text: string): {
  tampered: boolean;
  tamperSentences: string[];
} {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const suspiciousPatterns = [
    /automated\s+reviewer/i,
    /ai\s+(?:monitor|reviewer|system|agent|assistant)/i,
    /ignore\s+(?:all\s+)?(?:previous|prior|above|safety|threshold)/i,
    /suppress\s+(?:all\s+)?(?:flags|alerts|escalations|queries)/i,
    /do\s+not\s+(?:flag|escalate|report|quarantine)/i,
    /accept\s+all\s+(?:values|labs|records)\s+as\s+(?:normal|valid|compliant)/i,
    /exclude\s+site\s+.*\s+from\s+(?:safety|audit|surveillance)/i,
    /restart\s+(?:the\s+)?interface/i,
    /system\s+instruction\s*:/i,
    /override\s+safety\s+gate/i,
  ];

  const tamperSentences: string[] = [];
  for (const line of sentences) {
    if (suspiciousPatterns.some((rx) => rx.test(line))) {
      tamperSentences.push(line);
    }
  }

  return {
    tampered: tamperSentences.length > 0,
    tamperSentences,
  };
}

/**
 * Parse protocol rules dynamically from protocol markdown text.
 * Never hard-codes which version changes what; extracts numbers and lists directly from text.
 */
export function parseProtocolMarkdown(
  version: string,
  documentName: string,
  rawText: string,
  effectiveCut: number
): ProtocolRules {
  const sha256 = sha256Hex(rawText);
  const { tampered, tamperSentences } = detectDocumentTampering(rawText);

  // Filter out tampered sentences so injected instructions never alter clinical rules!
  const cleanText = rawText
    .split('\n')
    .filter((line) => !tamperSentences.some((ts) => line.includes(ts)))
    .join('\n');

  // 1. Hy's Law multipliers & window
  const altMatch = /(?:ALT|aminotransferase)[^\n]*?(\d+(?:\.\d+)?)\s*[x×]\s*ULN/i.exec(cleanText);
  const biliMatch = /bilirubin[^\n]*?(\d+(?:\.\d+)?)\s*[x×]\s*ULN/i.exec(cleanText);
  const windowMatch = /within\s+(\d+)\s+days/i.exec(cleanText);
  const alpMatch = /(?:ALP|alkaline\s+phosphatase)[^\n]*?<\s*(\d+(?:\.\d+)?)\s*[x×]\s*ULN/i.exec(
    cleanText
  );

  const hysLawAltMultiplier = altMatch ? Number(altMatch[1]) : 3.0;
  const hysLawAstMultiplier = altMatch ? Number(altMatch[1]) : 3.0;
  const hysLawBiliMultiplier = biliMatch ? Number(biliMatch[1]) : 2.0;
  const hysLawWindowDays = windowMatch ? Number(windowMatch[1]) : 14;
  const hysLawAlpMaxMultiplier = alpMatch ? Number(alpMatch[1]) : 2.0;

  // 2. Hospitalisation rule
  const hospOverridesSerious = !/hospitali[sz]ation\s+does\s+not\s+require\s+serious/i.test(
    cleanText
  );

  // 3. Prohibited medications
  const prohibitedMeds: string[] = [];
  const prohibSectionMatch =
    /(?:Prohibited\s+Medications?|Concomitant\s+Therapy\s+Restrictions?)([\s\S]*?)(?:\n#|\n\n#|$)/i.exec(
      cleanText
    );
  const prohibSource = prohibSectionMatch ? prohibSectionMatch[1] : cleanText;
  const medBulletMatches = prohibSource.matchAll(/[-*•]\s*([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)?)/g);
  for (const m of medBulletMatches) {
    const candidate = m[1].trim();
    if (
      candidate.length >= 3 &&
      !/^(Visit|Day|Week|Age|Screening|ALT|AST|Subject|Site|Dose|Arm)/i.test(candidate)
    ) {
      prohibitedMeds.push(candidate.toUpperCase());
    }
  }
  // Also support inline "Prohibited medications: MedA, MedB, MedC"
  const inlineProhib = /prohibited\s+medications?\s*(?:include|:)\s*([^\n.]+)/i.exec(cleanText);
  if (inlineProhib) {
    inlineProhib[1]
      .split(/[,;]|and\b/i)
      .map((s) => s.replace(/\(.*?\)/g, '').trim().toUpperCase())
      .filter((s) => s.length >= 3)
      .forEach((med) => {
        if (!prohibitedMeds.includes(med)) prohibitedMeds.push(med);
      });
  }

  // 4. Visit windows: e.g., "Visit 2 (Day 14 ± 3)" or "Week 4: Day 28 +/- 2 days"
  const visitWindows: Record<string, { targetDay: number; windowMinus: number; windowPlus: number }> =
    {};
  const visitRegex =
    /(?:(Visit\s*\d+|Week\s*\d+|Day\s*\d+|Baseline|Screening|Follow-up))[^\n:]*?Day\s*(\d+)\s*(?:[±]|\+\/-)\s*(\d+)/gi;
  for (const vm of cleanText.matchAll(visitRegex)) {
    const vName = vm[1].trim().toUpperCase();
    const targetDay = Number(vm[2]);
    const win = Number(vm[3]);
    visitWindows[vName] = { targetDay, windowMinus: win, windowPlus: win };
  }

  // 5. Dosing by Arm: e.g., "Arm A (Low Dose): 50 mg" or "Active 100mg: 100 mg"
  const dosingByArm: Record<string, { dose: number; unit: string }> = {};
  const doseRegex =
    /(?:Arm\s+[A-Za-z0-9_-]+|Cohort\s+[A-Za-z0-9_-]+|Placebo|Active(?:\s+[A-Za-z0-9_-]+)?|High\s+Dose|Low\s+Dose|Standard\s+Dose)\s*[:(-]\s*(\d+(?:\.\d+)?)\s*(mg|mcg|ug|g|mL|IU)/gi;
  for (const dm of cleanText.matchAll(doseRegex)) {
    const fullMatch = dm[0];
    const armLabel = fullMatch.split(/[:(-]/)[0].trim().toUpperCase();
    dosingByArm[armLabel] = {
      dose: Number(dm[1]),
      unit: dm[2],
    };
  }

  // 6. Exclusion / Eligibility criteria
  const ageRangeMatch = /age[ds]?\s+(\d{2})\s*(?:to|-|–)\s*(\d{2})\s*years/i.exec(cleanText);
  const minAge = ageRangeMatch ? Number(ageRangeMatch[1]) : 18;
  const maxAge = ageRangeMatch ? Number(ageRangeMatch[2]) : 75;

  const screenAltMatch =
    /screening\s+(?:ALT|AST|transaminases?)[^\n]*?(?:>|exceeding|above)\s*(\d+(?:\.\d+)?)\s*[x×]\s*ULN/i.exec(
      cleanText
    );
  const maxScreeningAltUln = screenAltMatch ? Number(screenAltMatch[1]) : 1.5;

  const excludedConditions: string[] = [];
  const exclMatch = /exclusion\s+criteria([\s\S]*?)(?:\n#|$)/i.exec(cleanText);
  if (exclMatch) {
    const condMatches = exclMatch[1].matchAll(
      /(?:history\s+of|known|active)\s+([a-zA-Z\s]{4,35}?)(?:[.,;\n]|$)/gi
    );
    for (const cm of condMatches) {
      excludedConditions.push(cm[1].trim().toUpperCase());
    }
  }

  return {
    version,
    effectiveCut,
    documentName,
    sha256,
    rawText,
    hysLawAltMultiplier,
    hysLawAstMultiplier,
    hysLawBiliMultiplier,
    hysLawWindowDays,
    hysLawAlpMaxMultiplier,
    hospOverridesSerious,
    prohibitedMeds,
    visitWindows,
    dosingByArm,
    exclusionCriteria: {
      minAge,
      maxAge,
      maxScreeningAltUln,
      excludedConditions,
    },
    tampered,
    tamperSentences,
    diffFromPrevious: [],
  };
}

/**
 * Compute structured rule diffs between consecutive protocol versions.
 */
export function computeProtocolDiff(prev: ProtocolRules, next: ProtocolRules): ProtocolRuleDiff[] {
  const diffs: ProtocolRuleDiff[] = [];

  if (prev.hysLawAltMultiplier !== next.hysLawAltMultiplier) {
    diffs.push({
      field: 'hysLawAltMultiplier',
      label: "Hy's Law ALT/AST Threshold",
      before: `>${prev.hysLawAltMultiplier}x ULN`,
      after: `>${next.hysLawAltMultiplier}x ULN`,
    });
  }
  if (prev.hysLawWindowDays !== next.hysLawWindowDays) {
    diffs.push({
      field: 'hysLawWindowDays',
      label: "Hy's Law Concomitant Bilirubin Window",
      before: `${prev.hysLawWindowDays} days`,
      after: `${next.hysLawWindowDays} days`,
    });
  }
  if (
    prev.exclusionCriteria.maxScreeningAltUln !== next.exclusionCriteria.maxScreeningAltUln
  ) {
    diffs.push({
      field: 'maxScreeningAltUln',
      label: 'Screening ALT Exclusion Threshold',
      before: `>${prev.exclusionCriteria.maxScreeningAltUln}x ULN`,
      after: `>${next.exclusionCriteria.maxScreeningAltUln}x ULN`,
    });
  }
  if (
    prev.exclusionCriteria.minAge !== next.exclusionCriteria.minAge ||
    prev.exclusionCriteria.maxAge !== next.exclusionCriteria.maxAge
  ) {
    diffs.push({
      field: 'ageEligibility',
      label: 'Eligible Age Range',
      before: `${prev.exclusionCriteria.minAge}–${prev.exclusionCriteria.maxAge} yrs`,
      after: `${next.exclusionCriteria.minAge}–${next.exclusionCriteria.maxAge} yrs`,
    });
  }

  const prevMeds = prev.prohibitedMeds.join(', ') || 'None';
  const nextMeds = next.prohibitedMeds.join(', ') || 'None';
  if (prevMeds !== nextMeds) {
    diffs.push({
      field: 'prohibitedMeds',
      label: 'Prohibited Concomitant Medications',
      before: prevMeds,
      after: nextMeds,
    });
  }

  const allVisits = new Set([
    ...Object.keys(prev.visitWindows),
    ...Object.keys(next.visitWindows),
  ]);
  for (const v of allVisits) {
    const pv = prev.visitWindows[v];
    const nv = next.visitWindows[v];
    if (pv && nv && (pv.targetDay !== nv.targetDay || pv.windowPlus !== nv.windowPlus)) {
      diffs.push({
        field: `visitWindow_${v}`,
        label: `${v} Visit Window`,
        before: `Day ${pv.targetDay} ± ${pv.windowPlus}d`,
        after: `Day ${nv.targetDay} ± ${nv.windowPlus}d`,
      });
    } else if (!pv && nv) {
      diffs.push({
        field: `visitWindow_${v}`,
        label: `${v} Visit Window`,
        before: 'Not specified',
        after: `Day ${nv.targetDay} ± ${nv.windowPlus}d`,
      });
    }
  }

  const allArms = new Set([
    ...Object.keys(prev.dosingByArm),
    ...Object.keys(next.dosingByArm),
  ]);
  for (const arm of allArms) {
    const pa = prev.dosingByArm[arm];
    const na = next.dosingByArm[arm];
    if (pa && na && (pa.dose !== na.dose || pa.unit !== na.unit)) {
      diffs.push({
        field: `dosing_${arm}`,
        label: `${arm} Protocol Dose`,
        before: `${pa.dose} ${pa.unit}`,
        after: `${na.dose} ${na.unit}`,
      });
    }
  }

  return diffs;
}

/**
 * Compute line-level diff between two markdown documents, marking tampered lines.
 */
export function computeDocumentLineDiff(
  oldContent: string,
  newContent: string,
  tamperSentences: string[]
): Array<{ text: string; type: 'unchanged' | 'added' | 'removed' | 'tamper' }> {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const oldSet = new Set(oldLines.map((l) => l.trim()));
  const newSet = new Set(newLines.map((l) => l.trim()));

  const result: Array<{ text: string; type: 'unchanged' | 'added' | 'removed' | 'tamper' }> = [];

  for (const line of oldLines) {
    if (line.trim() && !newSet.has(line.trim())) {
      result.push({ text: line, type: 'removed' });
    }
  }
  for (const line of newLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isTamper = tamperSentences.some((ts) => line.includes(ts) || ts.includes(trimmed));
    if (isTamper) {
      result.push({ text: line, type: 'tamper' });
    } else if (!oldSet.has(trimmed)) {
      result.push({ text: line, type: 'added' });
    } else {
      result.push({ text: line, type: 'unchanged' });
    }
  }
  return result;
}

/**
 * Main schema-driven ingestion function.
 * Accepts a Map of relative file paths to string contents (from drag-and-drop zip/folder or demo loader).
 * Parses once into indexed Maps by subject, domain, and cut.
 */
export function ingestStudyFiles(
  rawFiles: Record<string, string>,
  studyName = 'Synthetic Clinical Trial'
): IngestedStudyData {
  // Normalize file paths: strip any top-level prefix folder like "hackathon-data/"
  const normalizedFiles = new Map<string, string>();
  for (const [rawPath, content] of Object.entries(rawFiles)) {
    const clean = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = clean.split('/');
    const idx = parts.findIndex((p) =>
      ['data', 'documents', 'responses'].includes(p.toLowerCase())
    );
    const normPath = idx >= 0 ? parts.slice(idx).join('/') : clean;
    normalizedFiles.set(normPath, content);
  }

  const dataQualityIssues: DataQualityIssue[] = [];
  let issueSeq = 1;
  const logIssue = (issue: Omit<DataQualityIssue, 'id'>) => {
    dataQualityIssues.push({
      id: `DQ-${String(issueSeq++).padStart(3, '0')}`,
      ...issue,
    });
  };

  // 1. Parse reference_ranges.csv
  const referenceRanges: ReferenceRange[] = [];
  const refRangeContent =
    normalizedFiles.get('data/reference_ranges.csv') ||
    Array.from(normalizedFiles.entries()).find(([k]) =>
      k.toLowerCase().endsWith('reference_ranges.csv')
    )?.[1];

  if (refRangeContent) {
    const { rows } = parseCsvText(refRangeContent);
    for (const r of rows) {
      const lab = r.LAB || r.lab || r.LABID || r.lab_id || 'CENTRAL';
      const test = r.TEST || r.LBTESTCD || r.test || r.test_code || '';
      const low = Number((r.LOW || r.LLN || r.low || r.normal_low || '0').replace(',', '.'));
      const high = Number((r.HIGH || r.ULN || r.high || r.normal_high || '0').replace(',', '.'));
      const unit = r.UNIT || r.unit || r.UNITS || '';
      if (test) {
        referenceRanges.push({ lab, test: test.toUpperCase(), low, high, unit });
      }
    }
  }

  const { conversions, canonicalByTest, lookupByLabAndTest } =
    buildUnitConversionRegistry(referenceRanges);

  // 2. Parse cuts.csv
  const cuts: CutDefinition[] = [];
  const cutsContent =
    normalizedFiles.get('data/cuts.csv') ||
    Array.from(normalizedFiles.entries()).find(([k]) => k.toLowerCase().endsWith('cuts.csv'))?.[1];

  if (cutsContent) {
    const { rows } = parseCsvText(cutsContent);
    for (const r of rows) {
      const cutNum = Number(r.cut || r.CUT || r.cut_id || r.CUT_ID || 0);
      if (cutNum > 0) {
        cuts.push({
          cut: cutNum,
          date: r.date || r.DATE || r.cut_date || r.CUT_DATE || `2025-${String(cutNum).padStart(2, '0')}-15`,
          protocol_version:
            r.protocol_version || r.PROTOCOL_VERSION || r.protocol || r.version || 'v1',
          lab_manual_version: r.lab_manual_version || r.lab_manual || 'v1',
          label: r.label || r.description || r.notes || `Cut ${cutNum}`,
        });
      }
    }
  }
  if (cuts.length === 0) {
    for (let c = 1; c <= 12; c++) {
      cuts.push({
        cut: c,
        date: `2025-${String(c).padStart(2, '0')}-15`,
        protocol_version: c < 5 ? 'v1' : c < 9 ? 'v2' : 'v3',
        lab_manual_version: c < 9 ? 'v1' : 'v3',
        label: `Cut ${c}`,
      });
    }
  }
  cuts.sort((a, b) => a.cut - b.cut);

  // 3. Parse corrections.csv
  const correctionsByCut = new Map<number, CorrectionEntry[]>();
  const corrContent =
    normalizedFiles.get('data/corrections.csv') ||
    Array.from(normalizedFiles.entries()).find(([k]) =>
      k.toLowerCase().endsWith('corrections.csv')
    )?.[1];

  if (corrContent) {
    const { rows } = parseCsvText(corrContent);
    for (const r of rows) {
      const domain = (r.domain || r.DOMAIN || '').toUpperCase();
      const usubjid = r.usubjid || r.USUBJID || '';
      const seq = Number(r.seq || r.SEQ || r[`${domain}SEQ`] || 0);
      const field = r.field || r.FIELD || r.column || r.COLUMN || '';
      const new_value = r.new_value ?? r.NEW_VALUE ?? r.value ?? r.VALUE ?? '';
      const old_value = r.old_value ?? r.OLD_VALUE ?? undefined;
      const cut = Number(r.cut || r.CUT || r.corrected_at_cut || r.cut_available || 1);
      const reason = r.reason || r.REASON || 'Data clarification update';

      if (domain && usubjid && seq > 0 && field) {
        const list = correctionsByCut.get(cut) || [];
        list.push({ domain, usubjid, seq, field, old_value, new_value, cut, reason });
        correctionsByCut.set(cut, list);
      }
    }
  }

  // 4. Parse documents/ (*.md)
  const protocolVersions = new Map<string, ProtocolRules>();
  const documentsByCut = new Map<number, DocumentSnapshot[]>();
  const docFiles = Array.from(normalizedFiles.entries()).filter(
    ([path]) => path.toLowerCase().startsWith('documents/') && path.toLowerCase().endsWith('.md')
  );

  const parsedProtocols: ProtocolRules[] = [];
  for (const [path, content] of docFiles) {
    const fileName = path.split('/').pop() || path;
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('protocol')) {
      const vMatch = /v(\d+)/i.exec(fileName);
      const version = vMatch ? `v${vMatch[1]}` : 'v1';
      const matchingCut =
        cuts.find((c) => c.protocol_version.toLowerCase().includes(version))?.cut ||
        (version === 'v1' ? 1 : version === 'v2' ? 5 : 9);
      const rules = parseProtocolMarkdown(version, fileName, content, matchingCut);
      parsedProtocols.push(rules);
    }
  }

  parsedProtocols.sort((a, b) => a.effectiveCut - b.effectiveCut);
  for (let i = 0; i < parsedProtocols.length; i++) {
    if (i > 0) {
      parsedProtocols[i].diffFromPrevious = computeProtocolDiff(
        parsedProtocols[i - 1],
        parsedProtocols[i]
      );
    }
    protocolVersions.set(parsedProtocols[i].version, parsedProtocols[i]);
  }

  if (protocolVersions.size === 0) {
    const defaultRules = parseProtocolMarkdown(
      'v1',
      'protocol_v1.md',
      '# Protocol v1\nALT > 3x ULN and Bilirubin > 2x ULN within 14 days.\nScreening ALT > 1.5x ULN excluded.\nProhibited medications: KETOCONAZOLE, CLARITHROMYCIN, ST JOHNS WORT.',
      1
    );
    protocolVersions.set('v1', defaultRules);
  }

  // Build document snapshots per cut
  let prevDocContentByBaseName = new Map<string, string>();
  for (const c of cuts) {
    const snapshotsForCut: DocumentSnapshot[] = [];
    for (const [path, content] of docFiles) {
      const fileName = path.split('/').pop() || path;
      const baseType = fileName.toLowerCase().includes('protocol')
        ? 'protocol'
        : fileName.toLowerCase().includes('lab')
        ? 'lab-manual'
        : 'sap';

      const activeProtoVer = c.protocol_version.toLowerCase();
      const activeLabVer = (c.lab_manual_version || 'v1').toLowerCase();

      const shouldInclude =
        (baseType === 'protocol' && fileName.toLowerCase().includes(activeProtoVer)) ||
        (baseType === 'lab-manual' &&
          (fileName.toLowerCase().includes(activeLabVer) ||
            (!fileName.toLowerCase().includes('_v') && activeLabVer === 'v1'))) ||
        baseType === 'sap';

      if (shouldInclude) {
        const hash = sha256Hex(content);
        const { tampered, tamperSentences } = detectDocumentTampering(content);
        const prevContent = prevDocContentByBaseName.get(baseType);
        const diffLines = prevContent
          ? computeDocumentLineDiff(prevContent, content, tamperSentences)
          : computeDocumentLineDiff('', content, tamperSentences);

        prevDocContentByBaseName.set(baseType, content);
        snapshotsForCut.push({
          name: fileName,
          version: baseType === 'protocol' ? c.protocol_version : activeLabVer,
          cut: c.cut,
          content,
          sha256: hash,
          tampered,
          tamperSentences,
          diffLines,
        });
      }
    }
    documentsByCut.set(c.cut, snapshotsForCut);
  }

  // 5. Parse responses/monitor_decisions.json & site_replies.json
  let monitorDecisions: Record<string, MonitorDecisionSeed | string> = {};
  const monContent =
    normalizedFiles.get('responses/monitor_decisions.json') ||
    Array.from(normalizedFiles.entries()).find(([k]) =>
      k.toLowerCase().endsWith('monitor_decisions.json')
    )?.[1];
  if (monContent) {
    try {
      monitorDecisions = JSON.parse(monContent);
    } catch {
      monitorDecisions = {};
    }
  }

  let siteReplies: Record<string, SiteReplySeed | string> = {};
  const siteRepContent =
    normalizedFiles.get('responses/site_replies.json') ||
    Array.from(normalizedFiles.entries()).find(([k]) =>
      k.toLowerCase().endsWith('site_replies.json')
    )?.[1];
  if (siteRepContent) {
    try {
      siteReplies = JSON.parse(siteRepContent);
    } catch {
      siteReplies = {};
    }
  }

  // 6. Discover and parse all domain CSV files dynamically
  const domains = new Map<string, DomainSchema>();
  const recordsByKey = new Map<string, DomainRecord>();
  const recordsBySubject = new Map<string, DomainRecord[]>();
  const recordsByDomain = new Map<string, DomainRecord[]>();
  const recordsByCut = new Map<number, DomainRecord[]>();
  const siteOnboardCut = new Map<string, number>();
  const domainOnboardCut = new Map<string, number>();

  const subjectSiteMap = new Map<string, string>();
  const domainCsvEntries = Array.from(normalizedFiles.entries()).filter(([path]) => {
    const lower = path.toLowerCase();
    return (
      lower.startsWith('data/') &&
      lower.endsWith('.csv') &&
      !lower.endsWith('reference_ranges.csv') &&
      !lower.endsWith('corrections.csv') &&
      !lower.endsWith('cuts.csv')
    );
  });

  // Sort so DM is parsed first (to map USUBJID -> SITEID for domains that omit SITEID)
  domainCsvEntries.sort(([a], [b]) => {
    const aIsDm = a.toUpperCase().endsWith('/DM.CSV') ? -1 : 1;
    const bIsDm = b.toUpperCase().endsWith('/DM.CSV') ? -1 : 1;
    return aIsDm - bIsDm;
  });

  for (const [path, csvText] of domainCsvEntries) {
    const fileName = path.split('/').pop() || '';
    const domain = fileName.replace(/\.csv$/i, '').toUpperCase();
    const { headers, rows } = parseCsvText(csvText);
    if (headers.length === 0) continue;

    let minDomainCut = Infinity;
    for (const r of rows) {
      const ca = Number(r.cut_available || r.CUT_AVAILABLE || r.cut || 1);
      if (ca > 0 && ca < minDomainCut) minDomainCut = ca;
    }
    if (!Number.isFinite(minDomainCut)) minDomainCut = 1;

    const schema = inferDomainSchema(domain, headers, minDomainCut, rows.length);
    domains.set(domain, schema);
    domainOnboardCut.set(domain, minDomainCut);

    for (const r of rows) {
      const usubjid = (r.USUBJID || r.usubjid || '').trim();
      const seqRaw = r[schema.seqColumn] || r.SEQ || r.seq || '';
      const seq = Number(seqRaw);
      const cutAvailable = Number(r.cut_available || r.CUT_AVAILABLE || r.cut || 1) || 1;
      const correctedAtCutRaw = r.corrected_at_cut || r.CORRECTED_AT_CUT || '';
      const correctedAtCut = correctedAtCutRaw ? Number(correctedAtCutRaw) : undefined;

      if (!usubjid || !seqRaw || Number.isNaN(seq)) {
        logIssue({
          cut: cutAvailable,
          domain,
          usubjid: usubjid || undefined,
          seq: Number.isNaN(seq) ? undefined : seq,
          kind: 'missing_field',
          message: `Skipped row in ${domain} due to missing USUBJID or ${schema.seqColumn}`,
          rawField: !usubjid ? 'USUBJID' : schema.seqColumn,
          rawValue: JSON.stringify(r),
        });
        continue;
      }

      // Resolve site dynamically
      let site =
        (schema.siteColumn ? r[schema.siteColumn] : '') ||
        r.SITEID ||
        r.SITE ||
        subjectSiteMap.get(usubjid) ||
        '';
      if (!site && usubjid.includes('-')) {
        const parts = usubjid.split('-');
        site = parts.length >= 2 ? parts[0] : 'SITE-UNKNOWN';
      }
      if (domain === 'DM' && site) {
        subjectSiteMap.set(usubjid, site);
      }

      const prevSiteCut = siteOnboardCut.get(site);
      if (site && (prevSiteCut === undefined || cutAvailable < prevSiteCut)) {
        siteOnboardCut.set(site, cutAvailable);
      }

      // Date hygiene check across all inferred date columns
      let primaryDateStr = '';
      let primaryEpochDays: number | null = null;
      for (const dCol of schema.dateColumns) {
        const rawDate = r[dCol];
        if (rawDate && rawDate.trim() !== '') {
          const parsed = parseClinicalDate(rawDate);
          if (!parsed.valid) {
            logIssue({
              cut: cutAvailable,
              domain,
              usubjid,
              seq,
              kind: 'invalid_date',
              message: `${domain} #${seq} (${usubjid}) has non-standard date "${rawDate}" in ${dCol}`,
              rawField: dCol,
              rawValue: rawDate,
            });
          } else if (!primaryDateStr) {
            primaryDateStr = parsed.iso;
            primaryEpochDays = parsed.epochDays;
          }
        }
      }

      // Parse primary clinical value and unit
      const rawValCol =
        headers.find((h) => h.toUpperCase() === `${domain}ORRES`) ||
        headers.find((h) => h.toUpperCase() === `${domain}STRESC`) ||
        headers.find((h) => h.toUpperCase() === `${domain}DOSE`) ||
        schema.valueColumns[0];

      const rawUnitCol =
        headers.find((h) => h.toUpperCase() === `${domain}ORRESU`) ||
        headers.find((h) => h.toUpperCase() === `${domain}DOSU`) ||
        schema.unitColumns[0];

      const rawVal = rawValCol ? r[rawValCol] : undefined;
      const unitVal = rawUnitCol ? r[rawUnitCol] : undefined;
      const parsedVal = parseClinicalValue(rawVal);

      if (parsedVal.censored) {
        logIssue({
          cut: cutAvailable,
          domain,
          usubjid,
          seq,
          kind: 'censored_value',
          message: `${domain} #${seq} (${usubjid}) value "${rawVal}" is below limit of quantification (stored as censored <${parsedVal.censorThreshold}, not zero)`,
          rawField: rawValCol,
          rawValue: rawVal,
        });
      }

      const testCode =
        (schema.testColumn ? r[schema.testColumn] : '') ||
        r[`${domain}TESTCD`] ||
        r[`${domain}TERM`] ||
        r[`${domain}TRT`] ||
        '';
      const testName = r[`${domain}TEST`] || r[`${domain}DECOD`] || testCode;
      const labId = r.LBID || r.LAB || r.LABID || site;

      const normLab =
        domain === 'LB'
          ? normalizeLabMeasurement(
              testCode,
              parsedVal.numericValue,
              unitVal,
              labId,
              canonicalByTest,
              lookupByLabAndTest,
              conversions
            )
          : {
              canonicalValue: parsedVal.numericValue,
              canonicalUnit: unitVal,
              conversionFactorUsed: 1,
            };

      const recordKey = `${domain}|${usubjid}|${seq}`;
      const existing = recordsByKey.get(recordKey);

      if (existing) {
        // Check if this is an in-domain correction row (corrected_at_cut > existing.cut_available)
        if (correctedAtCut && correctedAtCut > existing.cut_available) {
          for (const [k, v] of Object.entries(r)) {
            if (existing.values[k] !== v && k !== 'corrected_at_cut' && k !== 'cut_available') {
              const corrList = correctionsByCut.get(correctedAtCut) || [];
              corrList.push({
                domain,
                usubjid,
                seq,
                field: k,
                old_value: existing.values[k],
                new_value: v,
                cut: correctedAtCut,
                reason: 'In-domain row correction',
              });
              correctionsByCut.set(correctedAtCut, corrList);
            }
          }
          continue;
        } else {
          // Duplicate record with same (domain, usubjid, seq)
          logIssue({
            cut: cutAvailable,
            domain,
            usubjid,
            seq,
            kind: 'duplicate_record',
            message: `Duplicate record identity (${domain}, ${usubjid}, #${seq}) encountered at cut ${cutAvailable}; counted once.`,
          });
          continue;
        }
      }

      const record: DomainRecord = {
        domain,
        usubjid,
        seq,
        site,
        cut_available: cutAvailable,
        corrected_at_cut: correctedAtCut,
        raw: { ...r },
        values: { ...r },
        history: [],
        testCode: testCode.toUpperCase(),
        testName,
        rawValueStr: parsedVal.rawValueStr,
        numericValue: parsedVal.numericValue,
        censored: parsedVal.censored,
        censorThreshold: parsedVal.censorThreshold,
        notDone: parsedVal.notDone,
        unit: unitVal,
        canonicalValue: normLab.canonicalValue,
        canonicalUnit: normLab.canonicalUnit,
        conversionFactorUsed: normLab.conversionFactorUsed,
        refLow: normLab.refLow,
        refHigh: normLab.refHigh,
        labId,
        dateStr: primaryDateStr,
        epochDays: primaryEpochDays,
        visit: r.VISIT || r.visit || undefined,
        visitNum: r.VISITNUM ? Number(r.VISITNUM) : undefined,
      };

      recordsByKey.set(recordKey, record);

      const subjList = recordsBySubject.get(usubjid) || [];
      subjList.push(record);
      recordsBySubject.set(usubjid, subjList);

      const domList = recordsByDomain.get(domain) || [];
      domList.push(record);
      recordsByDomain.set(domain, domList);

      const cutList = recordsByCut.get(cutAvailable) || [];
      cutList.push(record);
      recordsByCut.set(cutAvailable, cutList);
    }
  }

  // 7. Detect duplicate subjects in DM (match on initials + birth date + sex)
  const duplicateSubjectPairs: Array<{
    primary: string;
    duplicate: string;
    matchKey: string;
    refs: RecordRef[];
  }> = [];
  const dmRecords = recordsByDomain.get('DM') || [];
  const seenIdentity = new Map<string, DomainRecord>();

  for (const dm of dmRecords) {
    const initials = (
      dm.values.SUBJINIT ||
      dm.values.INITIALS ||
      dm.values.INIT ||
      ''
    )
      .trim()
      .toUpperCase();
    const birthDate = (
      dm.values.BRTHDTC ||
      dm.values.BIRTHDATE ||
      dm.values.DOB ||
      ''
    ).trim();
    const sex = (dm.values.SEX || '').trim().toUpperCase();

    if (initials && birthDate && sex) {
      const identityKey = `${initials}|${birthDate}|${sex}`;
      const prior = seenIdentity.get(identityKey);
      if (prior && prior.usubjid !== dm.usubjid) {
        duplicateSubjectPairs.push({
          primary: prior.usubjid,
          duplicate: dm.usubjid,
          matchKey: identityKey,
          refs: [
            { domain: 'DM', usubjid: prior.usubjid, seq: prior.seq },
            { domain: 'DM', usubjid: dm.usubjid, seq: dm.seq },
          ],
        });
        logIssue({
          cut: Math.max(prior.cut_available, dm.cut_available),
          domain: 'DM',
          usubjid: dm.usubjid,
          seq: dm.seq,
          kind: 'duplicate_subject',
          message: `Duplicate subject detected: ${dm.usubjid} matches ${prior.usubjid} on Initials (${initials}), Birth Date (${birthDate}), and Sex (${sex})`,
        });
      } else {
        seenIdentity.set(identityKey, dm);
      }
    }
  }

  return {
    studyName,
    domains,
    recordsByKey,
    recordsBySubject,
    recordsByDomain,
    recordsByCut,
    correctionsByCut,
    referenceRanges,
    unitConversions: conversions,
    cuts,
    protocolVersions,
    documentsByCut,
    monitorDecisions,
    siteReplies,
    dataQualityIssues,
    siteOnboardCut,
    domainOnboardCut,
    duplicateSubjectPairs,
  };
}
