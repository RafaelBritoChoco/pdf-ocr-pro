// Basic heading audit to flag potential loss of structural lines like CHAPTER, ARTICLE, SECTION, etc.
// Heuristic: we look for lines that are ALL CAPS words (length>=3) possibly with roman numerals, or lines starting with common legal tokens.
// This is intentionally lightweight.

export interface HeadingAuditResult {
  lostHeadings: string[];
  beforeCount: number;
  afterCount: number;
  details: { line: string; presentAfter: boolean }[];
}

// Regexes for candidate headings (expandable)
const HEADING_PATTERNS: RegExp[] = [
  /^(?:CHAPTER|SECTION|ARTICLE)\b[ \tA-Z0-9IVXLC\.:-]*$/,
  /^[A-Z][A-Z0-9 \-]{5,}$/ // broad all-caps line
];

function isCandidateHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return HEADING_PATTERNS.some(r => r.test(trimmed));
}

export function auditHeadings(before: string, after: string): HeadingAuditResult {
  const beforeLines = before.split(/\r?\n/);
  const afterSet = new Set(after.split(/\r?\n/).map(l => l.trim()));
  const candidates = beforeLines.filter(isCandidateHeading);
  const lostHeadings: string[] = [];
  const details = candidates.map(line => {
    const present = afterSet.has(line.trim());
    if (!present) lostHeadings.push(line.trim());
    return { line: line.trim(), presentAfter: present };
  });
  return {
    lostHeadings,
    beforeCount: candidates.length,
    afterCount: candidates.length - lostHeadings.length,
    details
  };
}
