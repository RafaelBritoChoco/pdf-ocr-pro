import { llmService, getModel } from './llmClient';
import { Type } from '@google/genai';

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('All retry attempts failed');
};

export async function findProblematicPages(rawText: string): Promise<number[]> {
  console.log('🔍 [DEBUG] findProblematicPages iniciado');
  
  // Análise local primeiro
  const localAnalysis = analyzeTextQualityLocally(rawText);
  console.log('📊 [DEBUG] Análise local:', localAnalysis);
  
  try {
    return await withRetry(async () => {
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

      const response = await llmService.generateContent({
        model: getModel(),
        contents: rawText,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: { type: Type.ARRAY, items: { type: Type.INTEGER } }
        }
      });

      console.log('✅ [DEBUG] findProblematicPages response recebido:', response.text);
      const jsonText = response.text;
      if (!jsonText) {
        console.warn("Enhanced analysis returned empty. Using local analysis fallback.");
        return localAnalysis.problematicPages;
      }
      
      const cleanedJsonText = jsonText.replace(/^```json\n?/, '').replace(/```$/, '');
      const pageNumbers = JSON.parse(cleanedJsonText);
      
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

function analyzeTextQualityLocally(rawText: string): { issues: string[], problematicPages: number[] } {
  const issues: string[] = [];
  const problematicPages: number[] = [];
  
  const pageTexts = rawText.split(/--- END OF PAGE \d+ ---/);
  
  pageTexts.forEach((pageText, index) => {
    const pageNum = index + 1;
    const pageIssues: string[] = [];
    const trimmedText = pageText.trim();
    
    if (trimmedText.length === 0) return;
    
    if (trimmedText.length < 200) {
      pageIssues.push('Texto muito curto');
      problematicPages.push(pageNum);
    }
    
    const oddLineBreaks = trimmedText.match(/\w\n\w/g);
    if (oddLineBreaks && oddLineBreaks.length > 3) {
      pageIssues.push('Quebras de linha suspeitas');
      problematicPages.push(pageNum);
    }
    
    const missingSpaces = trimmedText.match(/[a-z][A-Z]/g);
    if (missingSpaces && missingSpaces.length > 5) {
      pageIssues.push('Possível falta de espaços');
      problematicPages.push(pageNum);
    }
    
    const specialChars = trimmedText.match(/[^\w\s\-.,;:'"!?()[\]{}]/g);
    if (specialChars && specialChars.length > trimmedText.length * 0.05) {
      pageIssues.push('Muitos caracteres especiais');
      problematicPages.push(pageNum);
    }
    
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

export async function reformatDocumentText(rawText: string): Promise<string> {
  console.log('🎨 [DEBUG] reformatDocumentText iniciado, texto length:', rawText.length);
  console.log('🕒 [DEBUG] Timestamp:', new Date().toISOString());
  
  try {
    // Timeout wrapper para evitar travamento infinito
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => {
        console.error('⏰ [DEBUG] TIMEOUT! reformatDocumentText travou após 120 segundos');
        reject(new Error('reformatDocumentText timeout after 120 seconds'));
      }, 120000); // 2 minutos timeout
    });
    
    const processPromise = withRetry(async () => {
      console.log('🚀 [DEBUG] Iniciando chamada para API Gemini...');
      const startTime = Date.now();
      
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

FLEXIBLE FOOTNOTE EXAMPLES:
- ANY INPUT: "objective,33 provided" OR "objective⁣³³ provided" OR "objective[33] provided"
- OUTPUT: "objective,{{footnotenumber1}}33{{-footnotenumber1}} provided"
- ANY INPUT: "security,34 measures" OR "security* measures" OR "security(34) measures"  
- OUTPUT: "security,{{footnotenumber2}}*{{-footnotenumber2}} measures"
- DEFINITION: "{{footnote1}}33 Footnote text here{{-footnote1}}"
- DEFINITION: "{{footnote2}}* Another footnote text.{{-footnote2}}"

4. **OUTPUT FORMAT**:
   - Return clean, readable text that matches the original document structure
   - Use proper line breaks and spacing
   - Maintain professional document formatting
   - Each article, section, and paragraph should be clearly separated

Example of correct formatting:
SECTION A

The provisions of this document...

CHAPTER 1 GENERAL PROVISIONS

Section 1.1: Definitions

For the purposes of this document:

sample term means a defined concept or process...

example item means any product, service, or concept that is used for demonstration purposes and can be categorized appropriately;{{footnotenumber1}}1{{-footnotenumber1}}

related facilities means any supporting infrastructure...

{{footnote1}}1 For clarification, "example item" does not include actual products or services mentioned for commercial purposes.{{-footnote1}}

{{footnote2}}2 Additional example footnote for demonstration.{{-footnote2}}`;
    
      console.log('📡 [DEBUG] Enviando request para Gemini API...');
      const response = await llmService.generateContent({ 
        model: getModel(), 
        contents: rawText, 
        config: { systemInstruction, temperature: 0.2 } 
      });
      
      const elapsedTime = Date.now() - startTime;
      console.log(`✅ [DEBUG] reformatDocumentText response recebido em ${elapsedTime}ms, length:`, response.text?.length || 0);
      
      const text = response.text;
      if (!text) {
        throw new Error("AI API response for reformatting was empty.");
      }
      return text;
    });
    
    return await Promise.race([timeoutPromise, processPromise]);
    
  } catch (error) {
    console.error("❌ [DEBUG] Error in reformatDocumentText after retries:", error);
    console.error("❌ [DEBUG] Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString()
    });
    throw new Error("AI API failed to format the final document: " + (error instanceof Error ? error.message : 'Unknown error'));
  }
}
