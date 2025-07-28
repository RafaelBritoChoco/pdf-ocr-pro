import { Type, llmService } from "./llmClient";

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
 * Uses AI to analyze the raw text of an entire document to find pages with likely extraction errors.
 * @param rawText The combined raw text from all pages, with page separators.
 * @returns A promise that resolves to an array of page numbers that need correction.
 */
export async function findProblematicPages(rawText: string): Promise<number[]> {
  console.log('🔍 [DEBUG] findProblematicPages iniciado, texto length:', rawText.length);
  
  // Primeiro, fazer análise local para identificar problemas óbvios
  console.log('🔍 [DEBUG] Iniciando análise local...');
  const localAnalysis = analyzeTextQualityLocally(rawText);
  console.log('🔍 [DEBUG] Análise local encontrou:', localAnalysis.issues);
  console.log('🔍 [DEBUG] Páginas problemáticas localmente:', localAnalysis.problematicPages);
  
  try {
    console.log('🔍 [DEBUG] Iniciando withRetry para chamada à AI...');
    return await withRetry(async () => {
      console.log('🔍 [DEBUG] Preparando prompt para AI...');
      const systemInstruction = `You are a document analysis expert specializing in PDF text extraction quality. Analyze the provided text for extraction problems that require OCR correction.

      CRITICAL: Be MORE SENSITIVE to quality issues. Look for:
      
      **ALWAYS FLAG FOR OCR if you find:**
      - Pages with poor formatting (weird line breaks, spacing issues)
      - Text that looks like it came from a scanned document
      - Missing spaces between words or odd character spacing
      - Any signs that this came from image-to-text conversion rather than native PDF text
      - Broken paragraph structure or awkward text flow
      - Mixed fonts or inconsistent character rendering
      
      **ALSO FLAG:**
      - Garbled or nonsensical text
      - Incomplete tables/lists  
      - Pages with very little text (under 200 chars)
      - Missing punctuation or formatting
      - Footnote markers without corresponding text
      
      **BE AGGRESSIVE**: When in doubt, flag the page for OCR. It's better to re-process a good page than miss a poor extraction.
      
      Document has page breaks marked '--- END OF PAGE X ---'.
      
      Return JSON array of page numbers needing OCR. If text quality seems poor overall, consider flagging ALL pages.
      
      Example: [1, 2, 3] for a 3-page document with quality issues`;

      console.log('🔍 [DEBUG] Fazendo chamada para llmService.generateContent...');
      const response = await llmService.generateContent({
        model: getModel(),
        contents: rawText,
        config: {
          systemInstruction,
          temperature: 0.1, // Slight randomness for better detection
          responseMimeType: "application/json",
          responseSchema: { type: Type.ARRAY, items: { type: Type.INTEGER } }
        }
      });
      console.log('🔍 [DEBUG] llmService.generateContent concluído com sucesso!');

      console.log('✅ [DEBUG] findProblematicPages response recebido:', response.text);
      const jsonText = response.text;
      if (!jsonText) {
        console.warn("Enhanced analysis returned empty. Using local analysis fallback.");
        return localAnalysis.problematicPages;
      }
      
      // Handle potential markdown code block fences
      const cleanedJsonText = jsonText.replace(/^```json\n?/, '').replace(/```$/, '');
      const pageNumbers = JSON.parse(cleanedJsonText);
      
      // Combinar com análise local
      const combinedPages = [...new Set([...pageNumbers, ...localAnalysis.problematicPages])];
      
      console.log('📋 [DEBUG] Páginas problemáticas detectadas:', combinedPages);
      console.log('🔍 [DEBUG] Detalhes da análise:', {
        aiDetected: pageNumbers,
        localDetected: localAnalysis.problematicPages,
        combined: combinedPages,
        reasons: localAnalysis.issues
      });
      
      if (!Array.isArray(combinedPages) || !combinedPages.every(n => typeof n === 'number')) {
          throw new Error("Invalid format for problematic pages.");
      }
      return combinedPages;
    });
  } catch (error) {
    console.error("Error in findProblematicPages after retries:", error);
    console.warn("Using local analysis as fallback");
    return localAnalysis.problematicPages.length > 0 ? localAnalysis.problematicPages : []; 
  }
}

// Análise local para detectar problemas básicos de formatação
function analyzeTextQualityLocally(rawText: string): { issues: string[], problematicPages: number[] } {
  const issues: string[] = [];
  const problematicPages: number[] = [];
  
  // Dividir por páginas
  const pageTexts = rawText.split(/--- END OF PAGE \d+ ---/);
  
  pageTexts.forEach((pageText, index) => {
    const pageNum = index + 1;
    const pageIssues: string[] = [];
    const trimmedText = pageText.trim();
    
    if (trimmedText.length === 0) return; // Skip empty pages
    
    // Verificar comprimento muito baixo
    if (trimmedText.length < 200) {
      pageIssues.push('Texto muito curto');
      problematicPages.push(pageNum);
    }
    
    // Verificar quebras de linha estranhas (texto cortado)
    const oddLineBreaks = trimmedText.match(/\w\n\w/g);
    if (oddLineBreaks && oddLineBreaks.length > 3) {
      pageIssues.push('Quebras de linha suspeitas');
      problematicPages.push(pageNum);
    }
    
    // Verificar falta de espaços entre palavras
    const missingSpaces = trimmedText.match(/[a-z][A-Z]/g);
    if (missingSpaces && missingSpaces.length > 5) {
      pageIssues.push('Possível falta de espaços');
      problematicPages.push(pageNum);
    }
    
    // Verificar densidade de caracteres especiais (pode indicar OCR ruim)
    const specialChars = trimmedText.match(/[^\w\s\-.,;:'"!?()[\]{}]/g);
    if (specialChars && specialChars.length > trimmedText.length * 0.05) {
      pageIssues.push('Muitos caracteres especiais');
      problematicPages.push(pageNum);
    }
    
    // Verificar se o texto parece vir de scan (muito quebrado)
    const brokenWords = trimmedText.match(/\b\w{1,2}\b/g);
    if (brokenWords && brokenWords.length > trimmedText.split(/\s+/).length * 0.3) {
      pageIssues.push('Palavras muito fragmentadas');
      problematicPages.push(pageNum);
    }
    
    if (pageIssues.length > 0) {
      issues.push(`Página ${pageNum}: ${pageIssues.join(', ')}`);
    }
  });
  
  return {
    issues,
    problematicPages: [...new Set(problematicPages)]
  };
}


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

      const text = response.text;
      if (!text) {
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

      const text = response.text;
      if (!text) {
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
 * Takes raw text from an entire document and uses the Gemini API to reformat it.
 * This function handles large documents by splitting them into chunks to avoid API limits and timeouts.
 * @param rawText The combined raw text from all pages, with page separators.
 * @returns A promise that resolves to the cleaned and custom-formatted document text.
 */
export async function reformatDocumentText(rawText: string): Promise<string> {
  console.log(`[INFO] Starting final document reformatting. Text length: ${rawText.length} chars.`);
  const startTime = Date.now();

  // Define a threshold for what constitutes a large document.
  const LARGE_DOCUMENT_THRESHOLD = 50000; // 50k characters

  // If the document is large, process it in chunks.
  if (rawText.length > LARGE_DOCUMENT_THRESHOLD) {
    return reformatLargeDocumentInChunks(rawText);
  }

  // For smaller documents, process them in a single request with a timeout.
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('reformatDocumentText timed out after 180 seconds.'));
    }, 180000); // 3-minute timeout
  });

  try {
    return await Promise.race([
      timeoutPromise,
      withRetry(async () => {
        console.log('[INFO] Sending single request to Gemini API for final formatting...');
        
        const systemInstruction = `You are an expert document formatter. Your task is to clean and format a raw text document while preserving its original structure and readability.

CRITICAL FORMATTING RULES:

1. **PRESERVE ORIGINAL STRUCTURE**:
   - Keep all headings exactly as they appear (SECTION A, CHAPTER 1, Section 1.1, etc.)
   - Maintain proper spacing between sections (blank lines between major sections)
   - Preserve numbered lists, bullet points, and paragraph breaks
   - Keep sub-sections and definitions properly indented
   - **NEVER merge paragraphs into one continuous block of text**

2. **CLEAN THE TEXT**:
   - Remove page break markers ('--- END OF PAGE X ---')
   - Remove duplicate headers/footers that appear on multiple pages
   - Fix obvious OCR errors while preserving content

3. **HANDLE FOOTNOTES**:
   - **Detect all potential footnote markers**: This includes superscript numbers (¹), numbers in brackets ([1]), numbers in parentheses ((1)), asterisks (*), and simple numbers following a word (word1, word2).
   - **Convert ALL footnote references** to the format: {{footnotenumberX}}Y{{-footnotenumberX}}, where X is a sequential counter (1, 2, 3...) and Y is the original marker (e.g., 1, 2, *, a).
   - **Convert ALL footnote definitions** (usually at the bottom of a page) to the format: {{footnoteX}}Y Footnote text here{{-footnoteX}}.
   - **Renumber all footnotes sequentially** starting from 1. The X in the tags must be sequential.
   - Ensure every reference tag {{footnotenumberX}} has a corresponding definition tag {{footnoteX}}.

4. **OUTPUT FORMAT**:
   - Return clean, readable text that matches the original document structure
   - Use proper line breaks and spacing
   - Maintain professional document formatting
   - Each article, section, and paragraph should be clearly separated`;
      
        const response = await llmService.generateContent({ 
          model: getModel(), 
          contents: rawText, 
          config: { 
            systemInstruction, 
            temperature: 0.2,
            maxOutputTokens: 8192 // Set a generous token limit for the output
          } 
        });
        
        const elapsedTime = Date.now() - startTime;
        console.log(`[SUCCESS] Final formatting completed in ${elapsedTime}ms. Output length: ${response.text?.length || 0}`);
        
        const text = response.text;
        if (!text) {
          throw new Error("API response for reformatting was empty.");
        }
        return text;
      })
    ]);
  } catch (error) {
    console.error("[ERROR] Final formatting failed after retries:", error);
    // Fallback: return the original text so the user doesn't lose their content.
    console.log("[INFO] Fallback: Returning original, unformatted text.");
    return rawText.replace(/--- END OF PAGE \d+ ---/g, '\n');
  }
}

/**
 * Reformats a large document by splitting it into chunks and processing each chunk individually.
 * This avoids timeouts and token limits for very large documents.
 * @param rawText The entire raw text of the document.
 * @returns A promise that resolves to the fully reformatted document text.
 */
async function reformatLargeDocumentInChunks(rawText: string): Promise<string> {
  console.log(`[INFO] Document is large (${rawText.length} chars). Processing in chunks.`);
  
  // Split by the page separator, keeping the separator in the next chunk for context.
  const chunks = rawText.split(/(?=--- END OF PAGE \d+ ---)/g);
  const reformattedChunks: string[] = [];

  console.log(`[INFO] Split document into ${chunks.length} chunks.`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.trim().length === 0) continue;

    console.log(`[INFO] Formatting chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
    
    try {
      // Use a simpler instruction for chunks, focusing on cleaning, not restructuring.
      const systemInstruction = `You are an expert document formatter. Your task is to clean and format this text chunk.
      - Remove page break markers ('--- END OF PAGE X ---').
      - Fix obvious OCR errors and spacing issues.
      - Preserve all {{footnote...}} tags and other structural elements exactly as they are.
      - Return only the cleaned text for this chunk. Do not add extra commentary.`;

      const response = await llmService.generateContent({
        model: getModel(),
        contents: chunk,
        config: {
          systemInstruction,
          temperature: 0.1
        }
      });
      
      reformattedChunks.push(response.text || chunk); // Use original chunk as fallback
    } catch (error) {
      console.error(`[ERROR] Failed to format chunk ${i + 1}. Using original text for this chunk.`, error);
      reformattedChunks.push(chunk); // Fallback to the original chunk on error
    }
  }
  
  console.log(`[SUCCESS] All ${chunks.length} chunks have been processed. Reassembling document.`);
  // Reassemble the document and clean up any remaining page markers.
  return reformattedChunks.join('\n').replace(/--- END OF PAGE \d+ ---/g, '\n');
}
