// Docling-aware prompt templates and guards inspired by the prior 'ProjetoFuncional' logic.
// These are composable strings to be included in your Master Prompt pipeline.

export const DOC_HEADER_V2 = `# MASTER PROMPT FOR DOCUMENT CHUNK PROCESSING (Docling-aware)

[OBJECTIVE & GENERAL RULES]
You are an expert AI document processor working on text extracted by Docling in Markdown format.
Your sole task is to apply the instructions in [YOUR TASK] to the text in [MAIN CHUNK TO PROCESS].
Context sections are for consistency only; do NOT include context in output.
CRITICAL: Output length must closely match input chunk length. Never truncate or summarize.
PRESERVATION RULES:
- Preserve every digit exactly (years, decimals, clause numbers, inline footnote refs). Do not renumber or relocate.
- Preserve Markdown structures exactly: code fences (\`\`\`), tables (lines with | and ---), links, images, inline code.
- Do not alter tables or code content at all. If you are asked to tag headings, wrap the text content while KEEPING the original Markdown syntax.
- Do not add commentary; return only the transformed main chunk.
`;

export function getCleanupTaskDocling() {
  return `
You will clean this Docling-extracted Markdown chunk with conservative edits only.
- Remove page headers/footers that are clearly non-content and repeat across pages.
- Remove isolated page number lines (e.g., '12' or 'Page 12').
- Fix obvious OCR artifacts (joined hyphenation across line breaks, stray double spaces).
- Preserve all digits exactly as they appear. Do not touch numbers inside tables.
- Preserve Markdown tables and code fences exactly; do NOT reflow or align tables.
- Return the full chunk with only these minimal fixes; no summaries, no rewording.
`;
}

export function getFootnotesTaskDocling() {
  return `
OBJECTIVE: Footnote Detection and Tagging (Docling-aware)
- Identify inline footnote numbers and the corresponding definition lines; tag them in place.
- Inline reference: {{footnotenumberN}}N{{-footnotenumberN}}
- Definition line: {{footnoteN}}Full original line as-is{{-footnoteN}}
DETECTION:
- Inline numbers: small integers (1-400) immediately after a word/punctuation; not list indices, not dates, not decimals, not stand-alone page numbers.
- Definition lines: start with N followed by ).: or - and a space, then descriptive text.
RULES:
- Do NOT reorder, renumber, or merge notes.
- Preserve line breaks and spacing.
- Never tag inside code fences or tables.
- If zero matches, return the original chunk unchanged.
`;
}

export function getHeadlinesTaskDocling() {
  return `
OBJECTIVE: Headline Tagging Only
- Wrap only document headlines in {{levelX}}...{{-levelX}} (X=0 main title, X=1 major section, X=2 article/section level).
- Each tagged headline must be on its own line. Do not duplicate text.
PROHIBITED:
- Do NOT tag paragraphs or list items.
- Do NOT rewrite capitalization or punctuation.
- Do NOT touch tables or code fences.
`;
}

export function getBodyContentTaskDocling() {
  return `
OBJECTIVE: Body Content Tagging
- For text following headlines (level0-2), wrap body blocks with {{text_level}}...{{-text_level}}.
- Within that block, tag paragraphs/lists with {{level3}}+ as needed.
RULES:
- Do not alter or wrap any content already tagged as footnotes.
- Do not modify existing headline tags.
- Preserve digits, tables, code, and line breaks.
`;
}

export function getSmallTextRescue() {
  return `
SMALL-CHUNK CONSERVATION MODE
- The input is short/ambiguous. Perform only minimal fixes: join broken words (hyphenation across line breaks), remove obvious page numbers.
- Do not remove or rewrite sentences.
- Preserve all digits, punctuation, and Markdown structures.
- Output must be nearly identical length to input.
`;
}

export function getTablePreservationGuard() {
  return `
TABLE/CODE PRESERVATION GUARD
- Never change lines that look like Markdown tables (contain '|' columns or header separators '---').
- Never change fenced code blocks (between triple backticks) or inline code.
- If instructed to tag headlines inside a line that starts with '#', wrap only the textual content and keep the '#'.
`;
}
