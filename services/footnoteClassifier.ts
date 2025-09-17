/*
  Footnote / structural line classifier
  Provides heuristic categorization of lines to help audit LLM pre-clean steps
*/

export enum FootnoteLineType {
  Empty = 'EMPTY',
  Definition = 'DEFINITION',
  IsolatedSuperscript = 'ISOLATED_SUPERSCRIPT',
  ReferenceInline = 'REFERENCE_INLINE',
  Continuation = 'CONTINUATION',
  Heading = 'HEADING',
  PageNumber = 'PAGE_NUMBER',
  Noise = 'NOISE'
}

export interface ClassifiedLine {
  index: number;          // line index in original array
  raw: string;            // original line text
  normalized: string;     // trimmed & normalized version
  type: FootnoteLineType; // assigned category
  number?: string;        // extracted numeric / roman / superscript index
  score: number;          // confidence 0..1
  features: string[];     // matched feature tags (for debugging)
}

// Superscript to digit mapping
const SUPERSCRIPT_MAP: Record<string,string> = {
  '¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁰':'0'
};

const ROMAN_RE = /^(?=[ivxlcdm])i{1,3}|iv|vi{0,3}|ix|v?i{0,3}$/i; // simple small numerals (1-9)

function normalizeSuperscripts(s: string): string {
  return s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, ch => SUPERSCRIPT_MAP[ch] || ch);
}

// Heuristic patterns
const defPattern = /^(?:\(|\[)?(?<num>(?:\d{1,4}|[¹²³⁴⁵⁶⁷⁸⁹]|[ivxlcdm]{1,5}))\)?[\]\).: \-–]{1,3}(?<text>\S.+)$/i; // footnote definition at line start
const isolatedSupPattern = /^\s*(?<num>[¹²³⁴⁵⁶⁷⁸⁹])\s*$/;
const headingPattern = /^\s*(?:CAP[IÍ]TULO|SEÇÃO|ART(?:IGO)?|T[IÍ]TULO|PAR[ÁA]GRAFO|ANEXO|SUM[ÁA]RIO|ÍNDICE)\b|^[A-Z0-9 ._-]{4,}\:?$/;
const pageNumberPattern = /^\s*(?:p(?:ag(?:ina)?)?\.?\s*)?(?<pg>\d{1,4})(?:\s*[\/\-–]\s*(?<total>\d{1,4}))?(?:\s*(?:de|of)\s*\d{1,4})?\s*$/i; // 12, 12/45, 12 - 1, Pag. 12
const inlineRefPattern = /\[(\d{1,4})\]|(?:^|\s)(\d{1,4})\)/; // simplistic inline reference

export interface DocumentClassificationSummary {
  counts: Record<FootnoteLineType, number>;
  total: number;
  definitions: number;
  isolatedSuperscripts: number;
  pageNumbers: number;
  potentialLossRisk: number; // proportion of lines that look like definitions + superscripts
}

export function classifyLine(line: string, index: number, prev?: ClassifiedLine): ClassifiedLine {
  const raw = line; 
  const trimmed = line.trim();
  const normalized = normalizeSuperscripts(trimmed);
  const features: string[] = [];
  let type: FootnoteLineType = FootnoteLineType.Noise;
  let number: string | undefined; 
  let score = 0;

  if (!trimmed) {
    type = FootnoteLineType.Empty;
    return { index, raw, normalized, type, score: 0, features: ['empty'] };
  }

  // Page number lines (avoid misclassifying short bare numbers that are part of definitions)
  const pageMatch = pageNumberPattern.exec(trimmed);
  if (pageMatch && trimmed.length <= 12) { // heuristic length guard
    type = FootnoteLineType.PageNumber;
    number = pageMatch.groups?.pg;
    score = 0.8;
    features.push('page-number');
    return { index, raw, normalized, type, number, score, features };
  }

  // Isolated superscript
  const iso = isolatedSupPattern.exec(trimmed);
  if (iso) {
    type = FootnoteLineType.IsolatedSuperscript;
    number = normalizeSuperscripts(iso.groups?.num || '');
    score = 0.9;
    features.push('isolated-sup');
    return { index, raw, normalized, type, number, score, features };
  }

  // Definition
  const def = defPattern.exec(trimmed);
  if (def) {
    number = normalizeSuperscripts(def.groups?.num || '');
    // roman numeral filter to small values only
    if (/^[ivxlcdm]+$/i.test(number) && !ROMAN_RE.test(number)) {
      // large roman, maybe heading
    } else {
      type = FootnoteLineType.Definition;
      score = 0.92;
      features.push('definition');
      return { index, raw, normalized, type, number, score, features };
    }
  }

  // Continuation: previous was definition or continuation and current starts lower-case
  if (prev && (prev.type === FootnoteLineType.Definition || prev.type === FootnoteLineType.Continuation)) {
    if (/^[a-zà-ú0-9]/.test(trimmed)) {
      type = FootnoteLineType.Continuation;
      score = 0.6;
      features.push('continuation');
      return { index, raw, normalized, type, number, score, features };
    }
  }

  // Heading
  if (headingPattern.test(trimmed)) {
    type = FootnoteLineType.Heading;
    score = 0.7;
    features.push('heading');
    return { index, raw, normalized, type, score, features };
  }

  // Inline reference (only mark if nothing else chosen)
  if (inlineRefPattern.test(trimmed)) {
    type = FootnoteLineType.ReferenceInline;
    score = 0.4;
    features.push('inline-ref');
  }

  return { index, raw, normalized, type, number, score, features };
}

export function classifyDocument(textOrLines: string | string[]): ClassifiedLine[] {
  const lines = Array.isArray(textOrLines) ? textOrLines : textOrLines.split(/\r?\n/);
  const result: ClassifiedLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const prev = result[i-1];
    result.push(classifyLine(lines[i], i, prev));
  }
  return result;
}

export function summarizeClassification(classified: ClassifiedLine[]): DocumentClassificationSummary {
  const counts: Record<FootnoteLineType, number> = {
    [FootnoteLineType.Empty]: 0,
    [FootnoteLineType.Definition]: 0,
    [FootnoteLineType.IsolatedSuperscript]: 0,
    [FootnoteLineType.ReferenceInline]: 0,
    [FootnoteLineType.Continuation]: 0,
    [FootnoteLineType.Heading]: 0,
    [FootnoteLineType.PageNumber]: 0,
    [FootnoteLineType.Noise]: 0,
  };
  classified.forEach(c => counts[c.type]++);
  const definitions = counts[FootnoteLineType.Definition];
  const isolatedSuperscripts = counts[FootnoteLineType.IsolatedSuperscript];
  const pageNumbers = counts[FootnoteLineType.PageNumber];
  const potentialLossRisk = (definitions + isolatedSuperscripts) / Math.max(1, classified.length);
  return { counts, total: classified.length, definitions, isolatedSuperscripts, pageNumbers, potentialLossRisk };
}

export interface ClassificationSnapshot {
  ts: number;
  summary: DocumentClassificationSummary;
  sample: ClassifiedLine[]; // truncated sample for debug
  keyLines: { index: number; raw: string; type: FootnoteLineType; number?: string }[];
}

export function buildSnapshot(classified: ClassifiedLine[], sampleLimit = 80): ClassificationSnapshot {
  const summary = summarizeClassification(classified);
  const sample = classified.slice(0, sampleLimit);
  const keyLines = classified.filter(c => (
    c.type === FootnoteLineType.Definition ||
    c.type === FootnoteLineType.IsolatedSuperscript ||
    c.type === FootnoteLineType.PageNumber
  )).slice(0, 200).map(k => ({ index: k.index, raw: k.raw, type: k.type, number: k.number }));
  return { ts: Date.now(), summary, sample, keyLines };
}

export function storeSnapshot(localStorageKey: string, snapshot: ClassificationSnapshot) {
  try {
    const existingRaw = localStorage.getItem(localStorageKey);
    const existing: ClassificationSnapshot[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.push(snapshot);
    // keep last 5
    while (existing.length > 5) existing.shift();
    localStorage.setItem(localStorageKey, JSON.stringify(existing));
  } catch (err) {
    console.warn('storeSnapshot failed', err);
  }
}
