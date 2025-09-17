// Lightweight audit utilities to detect potential loss of inline numeric references that look like footnote markers.
// Focus: zero side-effects; can be expanded later (retry logic, etc.).

export interface FootnoteAuditResult {
  lost: string[];              // which short numeric refs disappeared or reduced in frequency
  beforeCount: number;         // total candidate refs before
  afterCount: number;          // total candidate refs after
  lossRatio: number;           // (beforeCount - afterCount)/beforeCount (0 if beforeCount=0)
  details: { num: string; before: number; after: number }[]; // per-number diff
}

// Pattern: small integers (1-400 conceptually) that appear inline after either a word char OR a closing punctuation
// (to catch formats like ;1 or )1) and are followed by space/punct/end.
// Heuristic: broaden lookbehind to include [\w\)\]\}] and some punctuation ;:.
// Still conservative to avoid matching years inside longer numbers.
const INLINE_REF_REGEX = /(?<=[\w\)\]\}.;:])(\d{1,3})(?=[\s\.,;:'"\)\]\}]|$)/g;

export function auditInlineNumericRefs(before: string, after: string): FootnoteAuditResult {
  const beforeMatches = before.match(INLINE_REF_REGEX) || [];
  const afterMatches = after.match(INLINE_REF_REGEX) || [];
  const countMap = (arr: string[]) => {
    const m = new Map<string, number>();
    for (const n of arr) m.set(n, (m.get(n) || 0) + 1);
    return m;
  };
  const bMap = countMap(beforeMatches);
  const aMap = countMap(afterMatches);
  const lost: string[] = [];
  const details: { num: string; before: number; after: number }[] = [];
  for (const [num, bCount] of bMap.entries()) {
    const aCount = aMap.get(num) || 0;
    if (aCount < bCount) lost.push(num);
    details.push({ num, before: bCount, after: aCount });
  }
  const beforeCount = beforeMatches.length;
  const afterCount = afterMatches.length;
  const lossRatio = beforeCount === 0 ? 0 : (beforeCount - afterCount) / beforeCount;
  return { lost, beforeCount, afterCount, lossRatio, details };
}
