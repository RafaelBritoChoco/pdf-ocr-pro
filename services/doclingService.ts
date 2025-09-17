/**
 * Client for the local Docling FastAPI service.
 * Endpoint default: http://127.0.0.1:8008
 */
export type DoclingMode = 'simple' | 'advanced';

export interface DoclingExtractOptions {
  endpoint?: string; // override base endpoint
  mode?: DoclingMode; // simple or advanced
  signal?: AbortSignal;
  onProgress?: (pct: number) => void; // naive upload progress
}

function getEndpoint(): string {
  try {
    const ls = localStorage.getItem('docling_endpoint');
    if (ls && ls.trim()) return ls.trim().replace(/\/$/, '');
  } catch {}
  return 'http://127.0.0.1:8008';
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

export async function extractWithDocling(file: File, options: DoclingExtractOptions = {}): Promise<string> {
  const base = (options.endpoint || getEndpoint()).replace(/\/$/, '');
  const mode = options.mode || 'simple';

  // Use XHR to get upload progress in browser environment
  const form = new FormData();
  form.append('file', file, file.name);

  const url = `${base}/extract?mode=${encodeURIComponent(mode)}`;
  const xhr = new XMLHttpRequest();
  const signal = options.signal;

  const promise = new Promise<string>((resolve, reject) => {
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

  return promise;
}
