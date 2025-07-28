import { GoogleGenAI, Type } from "@google/genai";

// Extended response type to capture API diagnostics
export interface GeminiResponse {
  text?: string;
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
  candidates?: Array<{
    content?: any;
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
}

// API key pode vir das variáveis de ambiente (para desenvolvimento) ou será definida em runtime
const API_KEY = (process.env.GEMINI_API_KEY as string) || (process.env.API_KEY as string) || '';

// Mutable API key for runtime override
let currentApiKey = API_KEY;

console.log('🔑 [DEBUG] LLM Client - Estado inicial:', {
  hasEnvKey: !!API_KEY,
  envKeyLength: API_KEY.length,
  note: 'API key será configurada via setRuntimeApiKey() se não estiver em env'
});

export interface LLMService {
  generateContent(options: {
    model: string;
    contents: any;
    config?: any;
  }): Promise<{ response: GeminiResponse }>;
}

/** Override the API key used for LLM calls at runtime */
export function setRuntimeApiKey(key: string) {
  currentApiKey = key;
}

/** Override the base URL used for LLM calls at runtime */
export function setRuntimeBaseUrl(baseUrl: string) {
  console.log(`[DEBUG] LLM base URL set to: ${baseUrl} (Note: Google GenAI client uses fixed endpoint)`);
}

// --- Model Management ---
// Default model, can be changed at runtime
let currentModel = 'gemini-1.5-flash-002';

/** Returns the currently configured model name */
export function getModel(): string {
  return currentModel;
}

/** Overrides the default model name at runtime */
export function setModel(modelName: string) {
  console.log(`[DEBUG] LLM model switched to: ${modelName}`);
  currentModel = modelName;
}

// Wrap the Google Gemini client at call time to pick up runtime key
export const llmService: LLMService = {
  generateContent: async (options) => {
    console.log('🚀 [DEBUG] llmService.generateContent chamado com:', {
      model: options.model,
      contentsType: typeof options.contents,
      contentsLength: typeof options.contents === 'string' ? options.contents.length : 'N/A',
      hasConfig: !!options.config,
      currentApiKeyLength: currentApiKey.length
    });
    
    try {
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const response = await ai.models.generateContent(options);
      
      console.log('✅ [DEBUG] llmService response recebido:', {
        textLength: response.text?.length || 0,
        hasText: !!response.text,
        finishReason: (response as any).finishReason,
        hasSafetyRatings: !!((response as any).safetyRatings),
        hasCandidates: !!((response as any).candidates)
      });
      
      // Return complete response object for diagnostic purposes
      return {
        response: {
          text: response.text || '',
          finishReason: (response as any).finishReason,
          safetyRatings: (response as any).safetyRatings,
          candidates: (response as any).candidates
        }
      };
    } catch (error) {
      console.error('❌ [DEBUG] llmService error:', error);
      throw error;
    }
  },
};

// Re-export Type for response schemas
export { Type };
