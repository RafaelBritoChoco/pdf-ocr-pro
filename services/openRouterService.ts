// Lightweight OpenRouter service for Qwen (and potentially other) models.
// Uses fetch directly; expects an OpenRouter API key stored in localStorage under 'openrouter_api_key'.
// API Docs: https://openrouter.ai/docs#chat-completions

export interface OpenRouterParams {
  model: string; // e.g., "qwen/qwen-2.5-7b-instruct" or another available model
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterResponseChoice {
  message: { role: string; content: string };
}
interface OpenRouterResponse {
  choices?: OpenRouterResponseChoice[];
  error?: { message: string };
}

function getKey(): string {
  const key = localStorage.getItem('openrouter_api_key');
  if (!key) throw new Error('OpenRouter API Key não configurada.');
  return key;
}

export async function callOpenRouter(params: OpenRouterParams, retries = 2): Promise<string> {
  const apiKey = getKey();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log('[OpenRouter] Attempt %d model=%s temperature=%s msgLen=%d', attempt + 1, params.model, params.temperature, params.messages.reduce((a,m)=>a+m.content.length,0));
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'PDF OCR Local App'
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.1,
          max_tokens: params.max_tokens,
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
      }
      const data: OpenRouterResponse = await response.json();
      if (data.error) throw new Error(data.error.message);
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('Resposta vazia da OpenRouter.');
      console.log('[OpenRouter] Success length=%d', content.length);
      return content;
    } catch (e) {
      console.warn('[OpenRouter] tentativa falhou', e);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw new Error('Falha OpenRouter após múltiplas tentativas');
}
