import { GoogleGenAI, Type } from "@google/genai";

// API key deve vir das variáveis de ambiente
const API_KEY = (process.env.GEMINI_API_KEY as string) || (process.env.API_KEY as string);

if (!API_KEY) {
  console.error('🚨 ERRO: API Key não encontrada! Configure GEMINI_API_KEY no arquivo .env.local');
  throw new Error('GEMINI_API_KEY é obrigatória. Crie um arquivo .env.local baseado no .env.example');
}

console.log('🔑 [DEBUG] LLM Client - API Key configurada:', {
  fromGeminiEnv: !!process.env.GEMINI_API_KEY,
  fromApiEnv: !!process.env.API_KEY,
  keyLength: API_KEY.length
});

export interface LLMService {
  generateContent(options: {
    model: string;
    contents: any;
    config?: any;
  }): Promise<{ text: string }>;
}

// Mutable API key for runtime override
let currentApiKey = API_KEY;

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
        hasText: !!response.text
      });
      
      return {
        text: response.text || '' // Ensure text is never undefined
      };
    } catch (error) {
      console.error('❌ [DEBUG] llmService error:', error);
      throw error;
    }
  },
};

// Re-export Type for response schemas
export { Type };
