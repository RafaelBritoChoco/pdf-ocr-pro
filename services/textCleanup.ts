// Text cleanup utility: deterministic normalization BEFORE any LLM call when cleanup-only mode is enabled.
// Goals:
// 1. Preserve every digit sequence exactly.
// 2. Remove isolated page numbers (lines that are just a number or 'Page X').
// 3. Collapse multiple blank lines to at most one.
// 4. Collapse internal runs of spaces/tabs to a single space (but not inside code fences if they ever appear).
// 5. Join hyphenated line breaks (e.g., 'obliga-\nções' -> 'obrigações').
// 6. Trim trailing/leading whitespace per line.
// 7. Protect numeric clusters by not merging them with adjacent text accidentally.
// 8. Keep output length close; do NOT remove meaningful punctuation.
// 9. Remove obvious header/footer repetitions if they appear > 2 times (heuristic simple length <= 80).
// All transformations are idempotent; running multiple times yields same result.

interface CleanupOptions {
  removePageNumberLines?: boolean;
  collapseBlankLines?: boolean;
  collapseSpaces?: boolean;
  joinHyphenatedBreaks?: boolean;
  trimLines?: boolean;
  removeRepeatingHeaders?: boolean;
  joinAcrossPageBreaks?: boolean;
}

const defaultOptions: CleanupOptions = {
  removePageNumberLines: true,
  collapseBlankLines: true,
  collapseSpaces: true,
  joinHyphenatedBreaks: true,
  trimLines: true,
  removeRepeatingHeaders: true
};

function endsWithTerminalPunct(s: string): boolean {
  return /[\.!?;:]\s*$|[\)\]]\s*$|[—–]\s*$/.test(s);
}

function isBulletStart(s: string): boolean {
  return /^\s*([*•·\-–—]|\d+[.)])\s+/.test(s);
}

function isLikelyHeading(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^\d+\s*([.)-])\s+\S+/.test(t)) return true; // numbered heading
  const noDigits = t.replace(/\d+/g, '');
  const upper = noDigits === noDigits.toUpperCase();
  return upper && t.length <= 80 && /[A-ZÀ-ÖØ-Þ]/.test(t);
}

function startsWithLowerAlphaOrQuote(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const m = t.match(/^["'“”\(\[\{]*([A-Za-zÀ-ÖØ-öø-ÿ])/);
  if (!m) return false;
  const ch = m[1];
  return ch === ch.toLowerCase();
}

function joinAcrossPageSplits(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' && i > 0 && i + 1 < lines.length) {
      const prev = out.length ? out[out.length - 1] : lines[i - 1];
      const next = lines[i + 1];
      const prevT = prev.trim();
      const nextT = next.trim();
      const canJoin = !!prevT && !!nextT &&
        !endsWithTerminalPunct(prevT) &&
        !isBulletStart(nextT) &&
        !isLikelyHeading(nextT) &&
        startsWithLowerAlphaOrQuote(nextT);
      if (canJoin) {
        const merged = (prev.replace(/\s+$/,'') + ' ' + nextT).replace(/\s+/g,' ');
        if (out.length) out[out.length - 1] = merged; else out.push(merged);
        i++; // skip next line
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

// Detect lines that are only a page number or formatted like 'Page 12'.
function isPageNumberLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(Página|Page)\s+\d{1,4}$/i.test(trimmed)) return true;
  if (/^\d{1,4}$/.test(trimmed)) return true;
  return false;
}

// Simple repeating header/footer detection.
function detectRepeatingShortLines(lines: string[], minRepetitions = 3): Set<string> {
  const counts: Record<string, number> = {};
  for (const l of lines) {
    const key = l.trim();
    if (!key) continue;
    if (key.length > 80) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  const result = new Set<string>();
  for (const [k, v] of Object.entries(counts)) {
    if (v >= minRepetitions) result.add(k);
  }
  return result;
}

export function cleanText(input: string, opts: CleanupOptions = {}): string {
  const o = { ...defaultOptions, ...opts };
  if (!input) return input;
  let text = input.replace(/\r\n?/g, '\n');

  // Join hyphenated line breaks: word-\nnext -> wordnext (only if both sides are alphabetic continuation and not all caps acronyms being split).
  if (o.joinHyphenatedBreaks) {
    text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-(\n)([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1$3');
  }

  let lines = text.split('\n');

  // Remove page number lines.
  if (o.removePageNumberLines) {
    lines = lines.filter(l => !isPageNumberLine(l));
  }

  // Detect repeating headers/footers.
  let repeating: Set<string> | undefined;
  if (o.removeRepeatingHeaders) {
    repeating = detectRepeatingShortLines(lines);
    if (repeating.size) {
      lines = lines.filter(l => !repeating!.has(l.trim()));
    }
  }

  if (o.trimLines) {
    lines = lines.map(l => l.replace(/\s+$/g, '').replace(/^\s+/g, ''));
  }

  // Repair page-break splits where a blank line remains between two halves of a sentence.
  if (o.joinAcrossPageBreaks !== false) {
    lines = joinAcrossPageSplits(lines);
  }

  let out = lines.join('\n');

  if (o.collapseSpaces) {
    // Collapse runs of tabs/spaces but keep inside possible code fences (not expected often in OCR output).
    out = out.split(/```/).map((segment, idx) => {
      if (idx % 2 === 1) return segment; // inside fence
      return segment.replace(/[\t ]{2,}/g, ' ');
    }).join('```');
  }

  if (o.collapseBlankLines) {
    out = out.replace(/\n{3,}/g, '\n\n');
  }

  // Final safety: ensure digits untouched (we didn't change them, but just assert no accidental nonlinear transform).
  // (We could compute checksum but overkill here.)
  return out;
}

export function isCleanupOnlyMode(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const flag = localStorage.getItem('enable_openrouter_cleanup_only');
      if (flag === '1') return true;
    }
  } catch {}
  // Env var fallback (Node harness)
  if (typeof process !== 'undefined' && process.env.OPENROUTER_CLEANUP_ONLY === '1') return true;
  return false;
}
