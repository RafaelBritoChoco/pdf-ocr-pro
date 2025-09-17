// Tag Integrity & Telemetry Service
// For local diagnostics only (stored in localStorage). No network calls.
// Provides lightweight validation helpers for post-stage summaries.

export interface TagIntegritySummary {
  stage: 'headlines' | 'footnotes' | 'content';
  totalLength: number;
  headlineCount?: number;
  footnoteNumberRefs?: number;
  footnoteDefs?: number;
  textLevelBlocks?: number;
  levelTagHistogram?: Record<string, number>;
  suspicious?: string[]; // reasons
  time: number;
}

function safeGet(key: string): any {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function safeSet(key: string, value: any) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function analyzeHeadlines(text: string): TagIntegritySummary {
  const matches = text.match(/\{\{level\d+}}/g) || [];
  const hist: Record<string, number> = {};
  matches.forEach(m => { hist[m] = (hist[m] || 0) + 1; });
  const suspicious: string[] = [];
  if (matches.length === 0) suspicious.push('no_headline_tags');
  if (hist['{{level0}}'] && hist['{{level0}}'] > 1) suspicious.push('multiple_level0');
  return {
    stage: 'headlines',
    totalLength: text.length,
    headlineCount: matches.length,
    levelTagHistogram: hist,
    suspicious: suspicious.length ? suspicious : undefined,
    time: Date.now()
  };
}

export function analyzeFootnotes(text: string): TagIntegritySummary {
  const refs = text.match(/\{\{footnotenumber\d+}}/gi) || [];
  const defs = text.match(/\{\{footnote\d+}}/gi) || [];
  const suspicious: string[] = [];
  if (refs.length > 0 && defs.length === 0) suspicious.push('refs_without_defs');
  if (defs.length > 0 && refs.length === 0) suspicious.push('defs_without_refs');
  return {
    stage: 'footnotes',
    totalLength: text.length,
    footnoteNumberRefs: refs.length,
    footnoteDefs: defs.length,
    suspicious: suspicious.length ? suspicious : undefined,
    time: Date.now()
  };
}

export function analyzeContent(text: string): TagIntegritySummary {
  const textBlocks = text.match(/\{\{text_level}}[\s\S]*?\{\{-text_level}}/gi) || [];
  const levelTags = text.match(/\{\{level\d+}}/g) || [];
  const hist: Record<string, number> = {};
  levelTags.forEach(m => { hist[m] = (hist[m] || 0) + 1; });
  const suspicious: string[] = [];
  if (textBlocks.length === 0) suspicious.push('no_text_level_blocks');
  if (textBlocks.length > 50) suspicious.push('too_many_text_blocks');
  return {
    stage: 'content',
    totalLength: text.length,
    textLevelBlocks: textBlocks.length,
    levelTagHistogram: hist,
    suspicious: suspicious.length ? suspicious : undefined,
    time: Date.now()
  };
}

export function recordIntegrity(summary: TagIntegritySummary) {
  const key = 'tag_integrity_history';
  const arr: TagIntegritySummary[] = safeGet(key) || [];
  arr.push(summary);
  // Keep last 150 summaries
  safeSet(key, arr.slice(-150));
}

export function getIntegrityHistory(): TagIntegritySummary[] {
  return safeGet('tag_integrity_history') || [];
}
