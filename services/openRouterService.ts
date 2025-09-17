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
// Global simple semaphore & rate limiter state
let activePromise: Promise<any> | null = null; // ensures only one in-flight
let queue: (() => void)[] = [];
let lastCallEndedAt = 0;
// Minimal spacing between calls (ms). Set conservative to avoid burst credit consumption.
const MIN_CALL_INTERVAL_MS = 650; // adjust as needed

// Registro de AbortControllers ativos para permitir cancelamento global (ex: reset ou F5)
const activeControllers = new Set<AbortController>();
export function abortAllOpenRouterRequests(reason: string = 'manual-abort') {
  activeControllers.forEach(ctrl => {
    try { ctrl.abort(); } catch {}
  });
  activeControllers.clear();
  console.warn('[OpenRouter] Todas as requisições abortadas. Motivo:', reason);
}

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (!activePromise) {
        activePromise = Promise.resolve();
        resolve();
      } else {
        queue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function releaseSlot() {
  activePromise = null;
  lastCallEndedAt = Date.now();
  const next = queue.shift();
  if (next) {
    // Pequeno timeout para garantir respeito ao intervalo mínimo
    const delay = Math.max(0, MIN_CALL_INTERVAL_MS - (Date.now() - lastCallEndedAt));
    setTimeout(next, delay);
  }
}

async function enforceMinInterval() {
  const elapsed = Date.now() - lastCallEndedAt;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_INTERVAL_MS - elapsed));
  }
}

export async function callOpenRouter(params: OpenRouterParams, retries = 2): Promise<string> {
  // MOCK MODE: if localStorage flag 'openrouter_mock_mode' === '1', skip network and return deterministic echo.
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('openrouter_mock_mode') === '1') {
      const base = params.messages.map(m => m.content).join('\n').slice(0, 4000);
      let output = `[MOCK:${params.model}]\n` + base;
      // Optional simulated numeric loss to test retry/fail-safe: remove first digit occurrence when flag set.
      if (localStorage.getItem('openrouter_mock_simulate_loss') === '1') {
        output = output.replace(/(\d)/, '');
      }
      return output;
    }
  } catch {}
  await acquireSlot();
  const apiKey = getKey();
  // Sanitizar mensagens para evitar undefined em content
  const messages = params.messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content == null ? '' : String(m.content))
  }));
  const totalContentLen = messages.reduce((a, m) => a + (m.content?.length || 0), 0);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await enforceMinInterval();
      console.log('[OpenRouter] Attempt %d model=%s temperature=%s msgLen=%d count=%d', attempt + 1, params.model, params.temperature, totalContentLen, messages.length);
      const payload = {
        model: params.model,
        messages,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.max_tokens,
      };
      const controller = new AbortController();
      activeControllers.add(controller);
      let response: Response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'PDF OCR Local App'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
        });
      } finally {
        activeControllers.delete(controller);
      }
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401) {
          // Não retry em 401
            throw new Error('OpenRouter 401 (API key inválida ou não reconhecida). Verifique/copiar novamente sua chave em https://openrouter.ai/keys');
        }
        if (response.status === 404 && /No endpoints found/i.test(text)) {
          // Modelo inexistente ou não habilitado para a conta
          throw new Error(`OpenRouter MODEL_NOT_FOUND 404: ${text}`);
        }
        if (response.status === 400 && /is not a valid model ID/i.test(text)) {
          // Modelo digitado inválido / não listado
          throw new Error(`OpenRouter MODEL_INVALID 400: ${text}`);
        }
        throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
      }
      const data: OpenRouterResponse = await response.json();
      if (data.error) throw new Error(data.error.message);
      const contentRaw = data.choices?.[0]?.message?.content;
      if (typeof contentRaw !== 'string') throw new Error('Resposta sem campo content string.');
      const content = contentRaw.trim();
      if (!content) throw new Error('Resposta vazia da OpenRouter.');
      console.log('[OpenRouter] Success length=%d', content.length);
      releaseSlot();
      return content;
    } catch (e: any) {
      const msg = (e && e.message) || String(e);
      if (msg === 'AbortError' || msg.includes('aborted')) {
        console.warn('[OpenRouter] Requisição abortada. Encerrando sem retries.');
        releaseSlot();
        throw new Error('OpenRouter ABORTED');
      }
      if (msg.startsWith('OpenRouter 401')) {
        console.error('[OpenRouter] Erro 401 definitivo: abortando sem retries.');
        releaseSlot();
        throw e;
      }
      if (msg.includes('MODEL_NOT_FOUND 404')) {
        console.error('[OpenRouter] Modelo não encontrado (%s). Abortando sem retries.', params.model);
        releaseSlot();
        throw e; // não faz retries para 404 de modelo
      }
      if (msg.includes('MODEL_INVALID 400')) {
        console.error('[OpenRouter] Modelo inválido (%s). Abortando sem retries.', params.model);
        releaseSlot();
        throw e; // não tenta novamente modelo inválido
      }
      console.warn('[OpenRouter] tentativa falhou', e);
      if (attempt === retries) { releaseSlot(); throw e; }
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  releaseSlot();
  throw new Error('Falha OpenRouter após múltiplas tentativas');
}

// Lightweight key validation: performs a minimal harmless request with an empty prompt
// to verify whether the API key is accepted. Returns true if valid, false if 401/Unauthorized.
// Any other HTTP error is rethrown so caller can decide (network issues etc.).
export async function validateOpenRouterKey(model: string = 'qwen/qwen-2.5-7b-instruct'): Promise<boolean> {
  try {
    const apiKey = getKey();
    const payload = {
      model,
      messages: [
        { role: 'user', content: 'ping' }
      ],
      temperature: 0,
      max_tokens: 1
    };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'PDF OCR Local App'
      },
      body: JSON.stringify(payload)
    });
    if (res.status === 401) {
      console.warn('[OpenRouter] validateOpenRouterKey: 401 inválida');
      return false;
    }
    if (!res.ok) {
      // For other HTTP codes (quota, 429, etc.) we treat as transient and bubble up
      const t = await res.text();
      throw new Error(`OpenRouter validação falhou HTTP ${res.status}: ${t}`);
    }
    return true;
  } catch (e) {
    // If the error came from getKey (missing key) treat as invalid but not fatal
    if ((e as any)?.message?.includes('OpenRouter API Key não configurada')) return false;
    throw e;
  }
}
