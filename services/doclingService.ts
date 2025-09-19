/**
 * Client for the local Docling FastAPI service.
 * Endpoint default: http://localhost:8008
 */
export type DoclingMode = 'auto' | 'simple' | 'advanced';

import { DoclingMeta } from '../types';

export interface DoclingExtractOptions {
  endpoint?: string; // override base endpoint
  mode?: DoclingMode; // auto | simple | advanced
  signal?: AbortSignal;
  onProgress?: (pct: number) => void; // naive upload progress
  progressive?: boolean; // força fluxo progressive explicitamente
}

function getEndpoint(): string {
  try {
    const ls = localStorage.getItem('docling_endpoint');
    if (ls && ls.trim()) return ls.trim().replace(/\/$/, '');
  } catch {}
  return 'http://localhost:8008';
}

export async function doclingHealth(endpoint?: string): Promise<boolean> {
  const base = (endpoint || getEndpoint()).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    if (!res.ok) return false;
    const js = await res.json();
    return js && js.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Aguarda até que o serviço Docling responda /health com sucesso ou atinja timeout.
 * - retries: número máximo de tentativas (default derivado do timeout)
 * - strategy: backoff incremental simples (delay base + incremento)
 */
export async function waitForDoclingHealthy(options?: {
  endpoint?: string;
  timeoutMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  onAttempt?: (info: { attempt: number; ok: boolean; elapsedMs: number; nextDelayMs: number }) => void;
}): Promise<boolean> {
  const start = performance.now();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const minDelay = options?.minDelayMs ?? 400;
  const maxDelay = options?.maxDelayMs ?? 2000;
  let attempt = 0;
  let delay = minDelay;
  while (true) {
    attempt++;
    const ok = await doclingHealth(options?.endpoint);
    const elapsed = performance.now() - start;
    if (ok) {
      options?.onAttempt?.({ attempt, ok: true, elapsedMs: elapsed, nextDelayMs: 0 });
      return true;
    }
    if (elapsed >= timeoutMs) {
      options?.onAttempt?.({ attempt, ok: false, elapsedMs: elapsed, nextDelayMs: 0 });
      return false;
    }
    options?.onAttempt?.({ attempt, ok: false, elapsedMs: elapsed, nextDelayMs: delay });
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay + 250, maxDelay); // incremento modesto
  }
}

export async function extractWithDocling(file: File, options: DoclingExtractOptions = {}): Promise<string> {
  const base = (options.endpoint || getEndpoint()).replace(/\/$/, '');
  const mode: DoclingMode = options.mode || 'auto';

  // Use XHR to get upload progress in browser environment
  const form = new FormData();
  form.append('file', file, file.name);

  const params = new URLSearchParams({ mode });
  if (options.progressive !== undefined) params.set('progressive', String(options.progressive));
  const url = `${base}/extract?${params.toString()}`;
  const signal = options.signal;

  async function sendOnce(): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && options.onProgress) {
          const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100));
          options.onProgress(pct);
        }
      };
      xhr.onerror = () => reject(new Error('Network error calling Docling service'));
      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const body = xhr.response as any;
            const text = (body && body.text) || '';
            try { if (body && body.meta) localStorage.setItem('last_docling_meta', JSON.stringify(body.meta)); } catch {}
            if (options.onProgress) options.onProgress(100);
            resolve(String(text || ''));
          } else {
            reject(new Error(`Docling service error ${xhr.status}: ${xhr.response?.detail || xhr.statusText}`));
          }
        } catch (e) {
          reject(e);
        }
      };
      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return reject(new Error('Aborted'));
        }
        const abortHandler = () => xhr.abort();
        signal.addEventListener('abort', abortHandler, { once: true });
      }
      xhr.send(form);
    });
  }

  const maxRetries = 2;
  let attempt = 0;
  while (true) {
    try {
      return await sendOnce();
    } catch (e: any) {
      const msg = (e?.message || '').toString();
      // Retry on network errors or status 0. Before retry, wait for health.
      if (attempt < maxRetries && (/Network error/i.test(msg) || /Failed to fetch/i.test(msg))) {
        attempt++;
        const ok = await waitForDoclingHealthy({ endpoint: base, timeoutMs: 15000, minDelayMs: 400, maxDelayMs: 2000 });
        if (!ok) throw e; // give up if still down
        continue; // retry
      }
      throw e;
    }
  }
}

// Variante que retorna também meta (para futuras telas de diagnóstico)
export interface DoclingExtractResult {
  text: string;
  meta?: DoclingMeta;
}

export async function extractWithDoclingFull(file: File, options: DoclingExtractOptions = {}): Promise<DoclingExtractResult> {
  const base = (options.endpoint || getEndpoint()).replace(/\/$/, '');
  const mode: DoclingMode = options.mode || 'auto';
  const form = new FormData();
  form.append('file', file, file.name);
  const params = new URLSearchParams({ mode });
  if (options.progressive !== undefined) params.set('progressive', String(options.progressive));
  const url = `${base}/extract?${params.toString()}`;
  const signal = options.signal;
  
  console.log(`[DoclingService] Starting extraction with URL: ${url}`);
  console.log(`[DoclingService] File:`, file.name, file.size, 'bytes');
  console.log(`[DoclingService] Mode:`, mode);
  
  async function sendOnce(): Promise<DoclingExtractResult> {
    return await new Promise<DoclingExtractResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      
      console.log(`[DoclingService] XHR configured for ${url}`);
      
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && options.onProgress) {
          const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100));
          options.onProgress(pct);
        }
      };
      
      xhr.onerror = (evt) => {
        console.error(`[DoclingService] XHR Error:`, evt);
        console.error(`[DoclingService] XHR Status:`, xhr.status, xhr.statusText);
        console.error(`[DoclingService] XHR ReadyState:`, xhr.readyState);
        reject(new Error(`Network error calling Docling service: ${xhr.status} ${xhr.statusText}`));
      };
      
      xhr.onload = () => {
        console.log(`[DoclingService] XHR Response status:`, xhr.status);
        console.log(`[DoclingService] XHR Response statusText:`, xhr.statusText);
        console.log(`[DoclingService] XHR Response:`, xhr.response);
        
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
              const body = xhr.response as any;
              const text = (body && body.text) || '';
              const meta = body && body.meta;
              console.log(`[DoclingService] Extraction successful, text length:`, text.length);
              try { if (meta) localStorage.setItem('last_docling_meta', JSON.stringify(meta)); } catch {}
              if (options.onProgress) options.onProgress(100);
              resolve({ text, meta });
          } else {
              console.error(`[DoclingService] HTTP Error ${xhr.status}:`, xhr.response);
              const errorMsg = xhr.response?.detail || xhr.response?.message || `HTTP ${xhr.status}: ${xhr.statusText}`;
              reject(new Error(`Docling service error ${xhr.status}: ${errorMsg}`));
          }
        } catch (error) {
          console.error(`[DoclingService] Parse error:`, error);
          reject(new Error(`Failed to parse Docling response: ${error}`));
        }
      };
      
      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return reject(new Error('Aborted'));
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
      
      console.log(`[DoclingService] Sending form data...`);
      xhr.send(form);
    });
  }

  const maxRetries = 2;
  let attempt = 0;
  while (true) {
    try {
      return await sendOnce();
    } catch (e: any) {
      const msg = (e?.message || '').toString();
      if (attempt < maxRetries && (/Network error/i.test(msg) || /Failed to fetch/i.test(msg))) {
        attempt++;
        const ok = await waitForDoclingHealthy({ endpoint: base, timeoutMs: 15000, minDelayMs: 400, maxDelayMs: 2000 });
        if (!ok) throw e;
        continue;
      }
      throw e;
    }
  }
}
