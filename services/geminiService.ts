import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ProcessingMode } from '../types';

// Gemini client instanciado dinamicamente após definir a chave
let currentApiKey: string | null = null;
let ai: GoogleGenAI | null = null;

export function setGeminiApiKey(key: string) {
    currentApiKey = key.trim();
    if (!currentApiKey) {
        ai = null;
        return;
    }
    ai = new GoogleGenAI({ apiKey: currentApiKey });
}

function ensureClient() {
    if (!ai || !currentApiKey) {
        throw new Error("API Key não configurada. Defina a chave antes de processar.");
    }
    return ai;
}

// Helper para tipos do generateContent
type GenerateContentParams = Parameters<ReturnType<typeof ensureClient>["models"]["generateContent"]>[0];

/**
 * A wrapper for the Gemini API call that includes automatic retries and better error diagnostics.
 * @param params The parameters for the generateContent call.
 * @param retries The number of times to retry on failure.
 * @returns A promise that resolves with the API response.
 */
async function callGeminiWithRetries(params: GenerateContentParams, retries = 3): Promise<GenerateContentResponse> {
    const client = ensureClient();
    for (let i = 0; i < retries; i++) {
        try {
            const response = await client.models.generateContent(params);
            const responseText = response.text;
            if (!responseText || responseText.trim().length === 0) {
                const finishReason = response.candidates?.[0]?.finishReason;
                if (finishReason && finishReason !== 'STOP') {
                    throw new Error(`API returned no content. Finish reason: ${finishReason}.`);
                }
                throw new Error('API returned an unexpected empty response.');
            }
            return response;
        } catch (error) {
            console.warn(`API call failed on attempt ${i + 1} of ${retries}.`, error);
            if (i === retries - 1) {
                throw error;
            }
            await new Promise(res => setTimeout(res, 1500));
        }
    }
    throw new Error('Retry logic failed after multiple attempts.');
}


const fileToGenerativePart = async (file: File) => {
  const base64EncodedData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
};

export const performOcrOnPdf = async (file: File, onApiCall: () => void, mode: ProcessingMode): Promise<string> => {
    ensureClient();
    try {
        onApiCall();
        const filePart = await fileToGenerativePart(file);
        const prompt = "You are an Optical Character Recognition (OCR) expert. Extract all text from the provided document, preserving the original layout and line breaks as much as possible. Return only the extracted text without any additional commentary or explanation.";
        const config: any = { temperature: 0.1 };
        if (mode === ProcessingMode.FAST) config.thinkingConfig = { thinkingBudget: 0 };
        const response = await callGeminiWithRetries({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, filePart] },
            config
        });
        return response.text ?? '';
    } catch (error) {
        console.error('Error performing OCR with Gemini API:', error);
        let errorMessage = 'An unknown error occurred during OCR.';
        if (error instanceof Error) errorMessage = `An error occurred during OCR: ${error.message}`;
        return `[ERROR: ${errorMessage}]`;
    }
};

interface ProcessChunkParams {
  main_chunk_content: string;
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  task_instructions: string;
}

/**
 * Processes a single chunk of a larger document using a context-aware "Master Prompt".
 * @param params - The necessary context and content for processing the chunk.
 * @returns The processed text of the main chunk.
 */
export const processDocumentChunk = async ({
    main_chunk_content,
    continuous_context_summary,
    previous_chunk_overlap,
    next_chunk_overlap,
    task_instructions,
    onApiCall,
    mode,
}: ProcessChunkParams & { onApiCall: () => void; mode: ProcessingMode }): Promise<string> => {
    ensureClient();
    try {
        onApiCall();
        const MASTER_PROMPT = `# MASTER PROMPT FOR DOCUMENT CHUNK PROCESSING

[OBJECTIVE & GENERAL RULES]
You are an expert AI document processor, operating in a pipeline that processes large documents in small chunks.
Your sole task is to apply the instructions in the [YOUR TASK] section to the text contained in the [MAIN CHUNK TO PROCESS] section.
The [CONTEXT] sections are provided only to ensure your work is consistent with the rest of the document.
Your final output must contain **ONLY** the text from [MAIN CHUNK TO PROCESS] after it has been modified by you. Do not include ANY part of the context or additional explanations in your response.
**CRITICAL RULE: Your output's character length MUST be very similar to the input chunk's length. Never truncate or summarize the content. Incomplete output is a critical failure.**

---

[PROVIDED CONTEXT]

1.  **Continuous Context Summary (Structure already processed):**
    \`${continuous_context_summary}\`

2.  **Previous Chunk Overlap (Last few lines of the previous chunk):**
    \`\`\`
    ${previous_chunk_overlap}
    \`\`\`

3.  **Next Chunk Overlap (First few lines of the next chunk):**
    \`\`\`
    ${next_chunk_overlap}
    \`\`\`

---

[YOUR TASK]
Based on the context above, perform the following task on the [MAIN CHUNK TO PROCESS]:

${task_instructions}

---

[MAIN CHUNK TO PROCESS]
${main_chunk_content}`;
        const config: any = { temperature: 0.1 };
        if (mode === ProcessingMode.FAST) config.thinkingConfig = { thinkingBudget: 0 };
        const response = await callGeminiWithRetries({
            model: 'gemini-2.5-flash',
            contents: MASTER_PROMPT,
            config
        });
        return response.text?.trim() ?? '';
    } catch (error) {
        console.error('Error processing document chunk with Gemini API:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return `[ERROR PROCESSING CHUNK: ${errorMessage}]\n\n${main_chunk_content}`;
    }
};

export const getTaskInstructionsForCleaning = () => (`
You are an expert document processor. Your task is to take this raw text chunk, which may contain OCR errors, page metadata, and unusual formatting, and clean it up to produce only the core document content.

Your instructions are:
1.  **Remove Page Metadata:** Delete all page numbers, running headers, and running footers. This kind of text is often found at the top or bottom of each page and is not part of the main content. For example, text like "12 - 1", "CHAPTER 12", document identifiers, or signatures that repeat on pages should be removed.
2.  **Correct OCR Errors:** Fix common OCR mistakes, such as misplaced spaces, incorrect punctuation, and character recognition errors (e.g., '"s' for "'s").
3.  **Standardize Formatting:** Ensure proper paragraph breaks and sentence structure.
4.  **Preserve Core Structure:** Crucially, preserve all *content-related* structural elements like headings (e.g., "Article 12.1 Definitions") and footnote markers within the text. Do NOT move footnotes to the end or renumber them. Your job is to clean the text *in place*.
5.  **Content Integrity:** Preserve the original meaning and key information. Do not summarize or add new content.
6.  **Output:** Return ONLY the cleaned, core content of the document, without any additional commentary or explanation.
`);

export const getTaskInstructionsForStep1_Headlines = () => (`
**OBJECTIVE: Headline and Footnote Identification and Tagging**

**PERSONA**
You are a structural analysis AI. Your ONLY task in this step is to identify and tag the major structural headlines (like Chapters, Articles, Sections) and footnotes. You must leave all other text, such as paragraphs and lists, completely untouched.

**TAGGING SCHEMA (Strict Adherence Required)**

1.  **Headlines**:
    -   Tag ONLY text that functions as a title or a major divider in the document.
    -   Use the format \`{{levelX}}Headline Text{{-levelX}}\`. \`X\` is a number representing the hierarchy.
    -   \`{{level0}}\`: Main document title.
    -   \`{{level1}}\`: Major sections like "Chapter I", "Section A".
    -   \`{{level2}}\`: Sub-sections like "Article 1", "Clause 2.1".
    -   You MAY use deeper levels (\`{{level3}}\`, \`{{level4}}\`) but ONLY for text that is clearly a sub-headline, NOT a paragraph or list item.
    -   Each tagged headline MUST be on its own line.

2.  **Footnotes**:
    -   Reference Number in text: \`{{footnotenumberY}}Y{{-footnotenumberY}}\` (where Y is the number).
    -   Footnote Content (often at the bottom): \`{{footnoteY}}Footnote text...{{-footnoteY}}\`.

**CRITICAL INSTRUCTIONS & PROHIBITED ACTIONS**
1.  **DO NOT TAG BODY CONTENT**: You are strictly forbidden from tagging regular paragraphs, sentences, or list items (e.g., text starting with "(a)", "1.", "-"). Leave them exactly as they are. Your job is to find the titles, not structure the content under them.
2.  **PRESERVE ALL ORIGINAL TEXT**: You must return the ENTIRE text chunk provided. Do not summarize, change, or omit any content.
3.  **NO \`text_level\` TAGS**: You are forbidden from using the \`{{text_level}}\` tag. This tag is used in a different step. Using it here is a critical failure.
4.  **DO NOT ADD EXTRA LINE BREAKS**: Only add line breaks if necessary to separate a tagged headline. Do not add extra blank lines between paragraphs.
5.  **NEVER DUPLICATE HEADLINES**: Do NOT repeat the headline text. You must wrap the EXISTING line with the tag pair; do not output the headline twice (once plain and once tagged). If the exact text already exists, only surround it.
6.  **DO NOT CREATE SYNTHETIC HEADLINES**: If a line is not clearly a headline (e.g., it contains a full sentence or starts like a paragraph), do not tag it.
7.  **NO REWRITING / NO NORMALIZATION OF CASE**: Keep the original capitalization, numerals, punctuation exactly.

**EXAMPLE OF WHAT TO DO:**
*Input Text:*
\`\`\`
CHAPTER I GENERAL PROVISIONS
Article 1 Objectives
The objectives of this Agreement are to:
(a) strengthen economic linkages...
This is another paragraph of the article.
Article 2 Scope
This Agreement applies to measures...
\`\`\`

*Correct Output:*
\`\`\`
{{level1}}CHAPTER I GENERAL PROVISIONS{{-level1}}
{{level2}}Article 1 Objectives{{-level2}}
The objectives of this Agreement are to:
(a) strengthen economic linkages...
This is another paragraph of the article.
{{level2}}Article 2 Scope{{-level2}}
This Agreement applies to measures...
\`\`\`

**DUPLICATION ERROR EXAMPLE (DO NOT DO THIS):**
Input line:
CHAPTER 12 DIGITAL TRADE

Incorrect output:
CHAPTER 12 DIGITAL TRADE
{{level1}}CHAPTER 12 DIGITAL TRADE{{-level1}}

Correct output:
{{level1}}CHAPTER 12 DIGITAL TRADE{{-level1}}

**EXAMPLE OF WHAT NOT TO DO:**
*Input Text:*
\`\`\`
Article 1 Objectives
The objectives of this Agreement are to:
(a) strengthen economic linkages...
\`\`\`
*Incorrect Output (This is Step 2's job):*
\`\`\`
{{level2}}Article 1 Objectives{{-level2}}
{{text_level}}{{level3}}The objectives of this Agreement are to:{{-level3}}
{{level4}}(a) strengthen economic linkages...{{-level4}}{{-text_level}}
\`\`\`
`);

export const getTaskInstructionsForStep2_Content = () => (`
**OBJECTIVE: Body Content Tagging**

**PERSONA**
You are a meticulous AI that structures the body content of a document that already has its main headlines tagged. Your task is to apply content-level tags (\`{{text_level}}\` and nested \`{{levelX}}\` tags for paragraphs/lists).

**TAGGING SCHEMA (Strict Adherence Required)**

1.  **\`{{text_level}}...{{-text_level}}\`**:
    -   This is the MOST CRITICAL tag pair. You MUST wrap any block of body content that follows a major headline (\`level0\` to \`level2\`) with these tags.
    -   An entire article's body, which may contain multiple paragraphs and lists, must be enclosed within a single \`{{text_level}}...{{-text_level}}\` block.

2.  **Content-Level Headlines (\`{{levelX}}\`)**:
    -   Inside a \`{{text_level}}\` block, use the standard \`{{levelX}}...{{-levelX}}\` tags for all sub-structures like paragraphs, lists, and sub-clauses.
    -   Typically, these will start at \`{{level3}}\` for the first paragraph/list item and go deeper (\`{{level4}}\`, \`{{level5}}\`, etc.) as needed for nested items.

**INVIOLABLE RULES**
1.  **RESPECT EXISTING TAGS**: Do NOT modify or remove the existing \`level0\`, \`level1\`, \`level2\`, or footnote tags that are already in the text.
2.  **CRITICAL: DO NOT TAG FOOTNOTES**: Text already tagged as a footnote (e.g., \`{{footnote1}}...{{-footnote1}}\`) is NOT considered body content. You are strictly forbidden from wrapping footnote content in \`{{text_level}}\` or any \`{{levelX}}\` tags. Leave them completely untouched.
3.  **WRAP ALL BODY CONTENT**: Every piece of non-headline, non-footnote text must be inside a \`{{text_level}}...{{-text_level}}\` block.
4.  **FULL CONTENT**: You must process and return the ENTIRE text chunk. Do not truncate or summarize.
5.  **IGNORE MARKERS**: If the text contains raw markers like [[FN_REF:N]] or lines starting with [[FN_DEF:N]], leave them exactly as-is; do not move, duplicate or wrap them.

**CORRECT OUTPUT EXAMPLE:**
*Input Text (from Step 1):*
\`\`\`
{{level2}}Article 1 Objectives {{-level2}}
The objectives of this Agreement are to:
(a) strengthen economic linkages...{{footnotenumber1}}1{{-footnotenumber1}}
This is another paragraph.

{{footnote1}}See Annex A for details.{{-footnote1}}
\`\`\`

*Correct Output (Your Task):*
\`\`\`
{{level2}}Article 1 Objectives {{-level2}}

{{text_level}}{{level3}}The objectives of this Agreement are to:{{-level3}}
{{level4}}(a) strengthen economic linkages...{{footnotenumber1}}1{{-footnotenumber1}}{{-level4}}
{{level3}}This is another paragraph.{{-level3}}
{{-text_level}}

{{footnote1}}See Annex A for details.{{-footnote1}}
\`\`\`
`);

// Nova função específica para etapa de footnotes (usada também por OpenRouter)
export const getTaskInstructionsForFootnotes = () => (`
**OBJECTIVE: Footnote Detection and Tagging**

You will identify footnote reference numbers appearing in the body text and the corresponding footnote content lines, tagging them without altering other structure.

**TYPES OF TAGS**
1. Inline reference number (appears inside a sentence or after a word):  {{footnotenumberN}}N{{-footnotenumberN}}
2. Footnote content line (typically at bottom, starts with the number and space or punctuation then explanatory text):  {{footnoteN}}Full footnote text...{{-footnoteN}}

**DETECTION RULES**
1. A footnote content line usually matches: ^N[).:\s-]+ followed by descriptive text (NOT just another heading).
2. Do NOT re-order, renumber or merge notes.
3. Preserve line breaks exactly.
4. Never duplicate lines; wrap in place.
5. If uncertain whether a leading number is a page number or footnote: LEAVE UNTOUCHED (better miss than corrupt structure).

**PROHIBITED**
- Do not wrap regular paragraphs as footnotes.
- Do not wrap headings.
- Do not invent footnotes.

**OUTPUT**
Return the entire chunk with only the added tags where appropriate—no commentary.
`);

// Prompt somente para marcar footnotes com marcadores neutros sem reescrever texto.
export const getTaskInstructionsForFootnotesMarkers = () => (`
OBJECTIVE: Insert ONLY neutral markers for footnote references and footnote definition lines without modifying any other text.

MARKERS TO USE (STRICT):
- Inline reference (keep number exactly where it is): replace JUST the number token with [[FN_REF:N]] (no added spaces) OR wrap it if it is a standalone token.
    Example: "... agreement 12 shall" => if 12 is a superscript reference, output "... agreement [[FN_REF:12]] shall".
- Footnote definition line (starts a line with number + space/punctuation then explanatory text): prefix the original line with [[FN_DEF:N]] and a single space.
    Example original line: "12 This is a footnote text" => "[[FN_DEF:12]] 12 This is a footnote text"

RULES:
1. DO NOT reflow, rewrite, normalize, or delete any text.
2. DO NOT change capitalization or spacing except inserting the marker tokens.
3. If uncertain whether a number is a page number or footnote definition, DO NOTHING.
4. Never invent markers for numbers inside dates, article numbers, section headings, numeric lists, or enumerated paragraphs ((a), 1., 2.1, etc.).
5. Return the FULL chunk unchanged except for inserted markers.
6. Do NOT wrap the entire line; only prefix definition lines or replace inline numeric reference tokens.
7. If a line already contains a marker, leave it as-is (avoid duplication).

OUTPUT: Entire chunk with markers inserted. No commentary.
`);