
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
 * Uses AI to analyze the raw text and enrich it with structural tags.
 * @param rawText The raw text to be analyzed and tagged.
 * @returns A promise that resolves to the text with structural tags.
 */
export async function enrichTextWithStructuralTags(rawText: string): Promise<string> {
  console.log('🔍 [DEBUG] enrichTextWithStructuralTags iniciado, texto length:', rawText.length);
  
  try {
    return await withRetry(async () => {
      const systemInstruction = `You are a structural text analyzer. Your only task is to analyze the following raw text and wrap each distinct element in a simple structural tag. DO NOT alter the content in any way.

- Wrap headings and article titles in <h>...</h>.
- Wrap numbered or lettered list items in <li>...</li>.
- Wrap regular paragraphs of text in <p>...</p>.
- Wrap the full content of footnote definitions in <fn>...</fn>.

Example Input:
Article 1.1: Definitions
1. For the purposes of this...
some paragraph text continues here.
¹ Footnote text.

Example Output:
<h>Article 1.1: Definitions</h>
<li>1. For the purposes of this...</li>
<p>some paragraph text continues here.</p>
<fn>¹ Footnote text.</fn>`;

      console.log('🔍 [DEBUG] Fazendo chamada para llmService.generateContent para enriquecimento...');
      const response = await llmService.generateContent({
        model: getModel(),
        contents: rawText,
        config: {
          systemInstruction,
          temperature: 0.1,
        }
      });
      console.log('🔍 [DEBUG] llmService.generateContent para enriquecimento concluído com sucesso!');
      
      const taggedText = response.response.text;
      if (!taggedText) {
        console.warn("❌ [API_EMPTY_RESPONSE] AI API response for text enrichment was empty.", {
          finishReason: response.response.finishReason,
          safetyRatings: response.response.safetyRatings,
          candidates: response.response.candidates
        });
        throw new Error("AI API response for text enrichment was empty.");
      }
      return taggedText;
    });
  } catch (error) {
    console.error("Error in enrichTextWithStructuralTags after retries:", error);
    throw new Error("AI API failed to enrich text with structural tags.");
  }
}

// Removed previous functions like findProblematicPages, extractTextFromImage, processPageWithText, reformatDocumentText
// as they are replaced by the new architecture.

// Placeholder for analyzeTextQualityLocally if it's still needed elsewhere
function analyzeTextQualityLocally(rawText: string): { issues: string[], problematicPages: number[] } {
  // This function might still be useful for initial local checks or fallback.
  // For now, returning empty as per the new architecture's focus on AI enrichment.
  return { issues: [], problematicPages: [] };
}

// Placeholder for extractTextFromImage if it's still needed elsewhere
export async function extractTextFromImage(base64Image: string): Promise<{text: string, changes: string}> {
  // This function is likely to be replaced by a direct OCR call or a simpler image-to-text conversion.
  // For now, returning a dummy response.
  return { text: "", changes: "Functionality moved to new architecture" };
}

// Placeholder for processPageWithText if it's still needed elsewhere
export async function processPageWithText(rawText: string, base64Image: string): Promise<{text: string, changes: string}> {
  // This function is likely to be replaced by the new AI enrichment step.
  // For now, returning a dummy response.
  return { text: rawText, changes: "Functionality moved to new architecture" };
}

// Placeholder for reformatDocumentText if it's still needed elsewhere
export async function reformatDocumentText(rawText: string): Promise<string> {
  // This function is replaced by the new textProcessor.
  // For now, returning rawText.
  return rawText;
}



