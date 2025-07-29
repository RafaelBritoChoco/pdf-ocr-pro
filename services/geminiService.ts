import { llmService } from "./llmClient";

// Default Gemini model for PDF processing; overrideable by localStorage 'selectedModel'
const DEFAULT_MODEL = 'gemini-2.5-flash';
function getModel(): string {
  try {
    const m = localStorage.getItem('selectedModel');
    if (m) return m;
  } catch {}
  return DEFAULT_MODEL;
}

// Helper function for retrying API calls with exponential backoff
const withRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  let retries = 0;
  let delay = initialDelay;
  while (true) {
    try {
      console.log(`🔄 [DEBUG] withRetry tentativa ${retries + 1}/${maxRetries + 1}...`);
      
      // Add timeout of 60 seconds for each attempt
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout after 60 seconds')), 60000);
      });
      
      const result = await Promise.race([apiCall(), timeoutPromise]);
      console.log('✅ [DEBUG] withRetry sucesso na tentativa', retries + 1);
      return result;
    } catch (error: any) {
      console.log(`❌ [DEBUG] withRetry erro na tentativa ${retries + 1}:`, error.message || error);
      
      const isRateLimitError = error.toString().includes('429') || error.toString().includes('RESOURCE_EXHAUSTED');
      const isTimeoutError = error.message?.includes('timeout');
      
      if ((isRateLimitError || isTimeoutError) && retries < maxRetries) {
        console.warn(`${isTimeoutError ? 'Timeout' : 'Rate limit'} hit on attempt ${retries + 1}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        delay *= 2; // Exponential backoff
      } else {
        console.error(`API call failed after ${retries} retries or for a non-retriable error.`, error);
        throw error; // Rethrow the original error
      }
    }
  }
};


/**
 * Extracts, corrects, and tags text from a single page image (OCR).
 * This single call replaces the previous separate OCR and correction steps to avoid rate limiting.
 * @param base64Image The base64 encoded image string.
 * @returns A promise that resolves to an object with extracted text and analysis summary.
 */
export async function extractTextFromImage(base64Image: string): Promise<{text: string, changes: string}> {
  try {
    return await withRetry(async () => {
      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image,
        },
      };

      const textPart = {
        text: `You are a precise OCR engine. Extract and correct all text from this image with maximum accuracy.

CRITICAL OCR RULES:
1. **Character Precision**: Be extremely careful with similar characters:
   - Do NOT confuse "la" with "1a" 
   - Do NOT confuse "Il" with "11"
   - Do NOT confuse "O" with "0" 
   - Do NOT confuse "S" with "5"
   - Verify each character in context
2. **Full Transcription**: Extract ALL text including headers, body, footers, margins
3. **Footnote Detection**: Find ANY footnote markers (numbers, symbols, letters: ¹, ², *, [1], (a), 14-1, etc.) and wrap as <fn>X</fn>
4. **Structure Preservation**: Maintain original paragraphs and formatting
5. **Context Validation**: Use surrounding words to verify character accuracy

OUTPUT FORMAT:
Provide the extracted text, then document findings:

---OCR ANALYSIS---
• Character corrections: "1a" → "la", "Il" → "Il" (verified)
• Found footnote marker "¹" after "document" 
• Extracted margin text: "Definition notes"
• Total characters: X
---END ANALYSIS---

For clean extractions: "---CLEAN EXTRACTION---"`
      };

      const response = await llmService.generateContent({ model: getModel(), contents: { parts: [imagePart, textPart] }, config: { temperature: 0.1 } });

      const text = response.response.text;
      if (!text) {
        console.error("❌ [API_EMPTY_RESPONSE] AI API response for text extraction was empty. Diagnostic info:", {
          finishReason: response.response.finishReason,
          safetyRatings: response.response.safetyRatings,
          candidates: response.response.candidates
        });
        throw new Error("AI API response for text extraction was empty.");
      }
      
      // Extract OCR analysis for logging
      const analysisMatch = text.match(/---OCR ANALYSIS---([\s\S]*?)---END ANALYSIS---/);
      const cleanMatch = text.match(/---CLEAN EXTRACTION---/);
      
      let changes = '';
      if (analysisMatch) {
        changes = analysisMatch[1].trim();
      } else if (cleanMatch) {
        changes = 'Clean extraction - no issues found';
      } else {
        changes = 'OCR analysis not provided';
      }
      
      // Return only the extracted text without the analysis
      const cleanText = text.replace(/---OCR ANALYSIS---[\s\S]*?---END ANALYSIS---/, '')
                           .replace(/---CLEAN EXTRACTION---/, '')
                           .trim();
      
      return {text: cleanText, changes};
    });
  } catch (error) {
    console.error("Error in extractTextFromImage after retries:", error);
    throw new Error("AI API failed to extract text from image.");
  }
}

/**
 * Corrects text from a page using its image as a visual reference to find missing footnotes.
 * This single call replaces the previous separate findVisualFootnotes and correctExtractedText steps.
 * @param rawText The text extracted via getTextContent.
 * @param base64Image The base64 encoded image of the page.
 * @returns A promise that resolves to an object with corrected text and changes summary.
 */
export async function processPageWithText(rawText: string, base64Image: string): Promise<{text: string, changes: string}> {
  if (!rawText || rawText.trim() === '') {
    return {text: rawText, changes: 'No text to process'};
  }
  try {
    return await withRetry(async () => {
      const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Image } };
      const textPart = { text: `This is the text extracted from the page's text layer: \n\n${rawText}` };
      
      const systemInstruction = `You are a precision document analyst. Compare the page image with extracted text to make accurate corrections while avoiding character substitution errors.

CRITICAL ACCURACY RULES:
1. **Character Precision**: Be extremely careful with similar characters:
   - Verify "la" vs "1a" by context (usually "la" in words)
   - Check "Il" vs "11" by examining surrounding letters
   - Distinguish "O" vs "0" based on context (letters vs numbers)
   - Validate "S" vs "5" using word patterns
2. **Context Validation**: Use surrounding words to verify character accuracy
3. **Conservative Approach**: Only change text if you're absolutely certain

YOUR PROCESS:
1. **CHARACTER VERIFICATION**: Double-check each suspicious character using context
2. **FOOTNOTE DETECTION**: Find ANY footnote markers (numbers, symbols, letters: ¹, [2], (3), *, a, 14-1, etc.) and add <fn> tags
3. **STRUCTURAL FIXES**: Correct obvious OCR errors verified by image
4. **CHANGE DOCUMENTATION**: Record all modifications made

OUTPUT FORMAT:
Provide corrected text with <fn> tags, then add:

---CHANGES MADE---
• Verified "la" characters (no changes needed)
• Added footnote marker <fn>X</fn> after "word"
• Fixed verified OCR error: "articel" → "article"
• Fixed spacing in "Section1.1" to "Section 1.1"
---END CHANGES---

If no changes were needed, write "---NO CHANGES NEEDED---"`;
      
      const response = await llmService.generateContent({ model: getModel(), contents: { parts: [imagePart, textPart] }, config: { systemInstruction, temperature: 0.1 } });

      const text = response.response.text;
      if (!text) {
        console.error("❌ [API_EMPTY_RESPONSE] AI API response for text processing was empty. Diagnostic info:", {
          finishReason: response.response.finishReason,
          safetyRatings: response.response.safetyRatings,
          candidates: response.response.candidates
        });
        throw new Error("AI API response for text processing was empty.");
      }
      
      // Extract changes summary for logging
      const changesMatch = text.match(/---CHANGES MADE---([\s\S]*?)---END CHANGES---/);
      const noChangesMatch = text.match(/---NO CHANGES NEEDED---/);
      
      let changes = '';
      if (changesMatch) {
        changes = changesMatch[1].trim();
      } else if (noChangesMatch) {
        changes = 'No changes needed';
      } else {
        changes = 'Changes summary not provided';
      }
      
      // Return only the corrected text without the changes summary
      const cleanText = text.replace(/---CHANGES MADE---[\s\S]*?---END CHANGES---/, '')
                           .replace(/---NO CHANGES NEEDED---/, '')
                           .trim();
      
      return {text: cleanText, changes};
    });
  } catch (error) {
    console.error("Error in processPageWithText after retries:", error);
    throw new Error("AI API failed to process page text after multiple attempts.");
  }
}

/**
 * Uses the AI for a single, focused task: to analyze raw text and enrich it with structural XML-like tags.
 * This is Stage 2 of the formatting pipeline.
 * @param rawText The entire document's raw text.
 * @returns A promise that resolves to the text enriched with structural tags.
 */
export async function enrichTextWithStructuralTags(rawText: string): Promise<string> {
    console.log(`[geminiService] Starting AI structural enrichment. Text length: ${rawText.length}`);

    const systemInstruction = `You are a structural text analyzer for legal documents. Your ONLY task is to analyze the following raw text and wrap each distinct element in a simple structural tag. DO NOT alter, correct, or rephrase the content in any way. Preserve every original word, punctuation mark, and line break within elements.

    - Wrap headings, article titles, and chapter titles in <h>...</h>.
    - Wrap numbered or lettered list items in <li>...</li>.
    - Wrap regular paragraphs of text (any block of text that is not a heading, list item, or footnote) in <p>...</p>.
    - Wrap the full content of footnote definitions (usually at the bottom of a page, starting with a number or symbol) in <fn>...</fn>.

    Example Input:
    ARTICLE 1
    The trade between the two countries...
    continues on this line.

    1. For the purposes of this...
    ¹ This is a footnote.

    Example Output:
    <h>ARTICLE 1</h>
    <p>The trade between the two countries...
    continues on this line.</p>
    <li>1. For the purposes of this...</li>
    <fn>¹ This is a footnote.</fn>`;

    // For large documents, chunking is necessary
    const CHUNK_SIZE = 30000;
    if (rawText.length < CHUNK_SIZE) {
        const { response } = await llmService.generateContent({ model: getModel(), contents: [{ role: 'user', parts: [{ text: systemInstruction }, { text: rawText }] }] });
        return response.text || rawText;
    }

    const chunks = [];
    for (let i = 0; i < rawText.length; i += CHUNK_SIZE) {
        chunks.push(rawText.slice(i, i + CHUNK_SIZE));
    }
    const processedChunks = await Promise.all(chunks.map(async (chunk) => {
        const { response } = await llmService.generateContent({ model: getModel(), contents: [{ role: 'user', parts: [{ text: systemInstruction }, { text: chunk }] }] });
        return response.text || chunk;
    }));
    return processedChunks.join('\n');
}
