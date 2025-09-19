/**
 * Automatic Docling endpoint detection.
 * Tries stored endpoint first, then a list of candidates in parallel.
 * Persists winning endpoint to localStorage (key: 'docling_endpoint').
 */

export const DOCLING_LOCALSTORAGE_KEY = 'docling_endpoint';

// Ordered list (fastest / most common first)
export const DEFAULT_DOCLING_CANDIDATES: string[] = [
  'http://localhost:8008',
  // Removed 127.0.0.1 as it was causing connection issues
  // 'http://127.0.0.1:8008',
  // Add LAN or docker mapped hosts if needed, e.g.:
  // 'http://host.docker.internal:8008',
];

async function ping(endpoint: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log(`[DoclingDetect] Testing endpoint: ${endpoint}`);
    const res = await fetch(endpoint.replace(/\/$/, '') + '/health', { 
      signal: controller.signal,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    console.log(`[DoclingDetect] Response status: ${res.status}, ok: ${res.ok}`);
    if (!res.ok) return false;
    const js: any = await res.json().catch(() => ({}));
    const success = js && js.status === 'ok';
    console.log(`[DoclingDetect] Response data:`, js, `Success: ${success}`);
    return success;
  } catch (error) {
    console.log(`[DoclingDetect] Error testing ${endpoint}:`, error);
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function detectDoclingEndpoint(candidates: string[] = DEFAULT_DOCLING_CANDIDATES): Promise<string | null> {
  console.log(`[DoclingDetect] Starting detection with candidates:`, candidates);
  
  // 1. Already saved?
  try {
    const saved = localStorage.getItem(DOCLING_LOCALSTORAGE_KEY);
    console.log(`[DoclingDetect] Saved endpoint from localStorage:`, saved);
    if (saved) {
      const cleaned = saved.trim().replace(/\/$/, '');
      console.log(`[DoclingDetect] Testing saved endpoint: ${cleaned}`);
      
      // Force localhost if saved endpoint is 127.0.0.1
      if (cleaned.includes('127.0.0.1:8008')) {
        console.log(`[DoclingDetect] Converting 127.0.0.1 to localhost for better compatibility`);
        const localhostEndpoint = cleaned.replace('127.0.0.1', 'localhost');
        if (await ping(localhostEndpoint)) {
          console.log(`[DoclingDetect] Localhost conversion successful: ${localhostEndpoint}`);
          localStorage.setItem(DOCLING_LOCALSTORAGE_KEY, localhostEndpoint);
          return localhostEndpoint;
        }
      }
      
      if (await ping(cleaned)) {
        console.log(`[DoclingDetect] Saved endpoint works: ${cleaned}`);
        return cleaned;
      } else {
        console.log(`[DoclingDetect] Saved endpoint failed, removing from localStorage`);
        localStorage.removeItem(DOCLING_LOCALSTORAGE_KEY);
      }
    }
  } catch (error) {
    console.log(`[DoclingDetect] Error checking saved endpoint:`, error);
  }

  // 2. Probe candidates concurrently
  console.log(`[DoclingDetect] Testing ${candidates.length} candidates concurrently...`);
  const attempts = candidates.map(async ep => (await ping(ep)) ? ep : null);
  const results = await Promise.all(attempts);
  console.log(`[DoclingDetect] Results:`, results);
  const found = results.find(r => !!r) || null;
  if (found) {
    console.log(`[DoclingDetect] Found working endpoint: ${found}`);
    try { 
      localStorage.setItem(DOCLING_LOCALSTORAGE_KEY, found);
      console.log(`[DoclingDetect] Saved endpoint to localStorage: ${found}`);
    } catch (error) {
      console.log(`[DoclingDetect] Error saving to localStorage:`, error);
    }
    return found;
  }
  console.log(`[DoclingDetect] No working endpoints found`);
  return null;
}

export type DoclingConnectionStatus = 'checking' | 'online' | 'offline';

import { useCallback, useEffect, useState, useRef } from 'react';

/**
 * Hook de detecção do endpoint Docling.
 * Agora suporta modo lazy (não inicia verificação automática até chamar start()).
 * Uso:
 *  const { endpoint, status, start, retry } = useDoclingEndpoint({ auto: false });
 *  // mais tarde: await start();
 */
export function useDoclingEndpoint(opts?: { auto?: boolean; timeoutMs?: number }) {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [status, setStatus] = useState<DoclingConnectionStatus>('checking');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const startedRef = useRef(false);

  const effectiveAuto = opts?.auto !== false; // default true para retrocompatibilidade
  const pingTimeout = opts?.timeoutMs ?? 1500;

  const check = useCallback(async () => {
    // Evita rodar se ainda não foi explicitamente iniciado em modo lazy
    if (!effectiveAuto && !startedRef.current) return;
    setStatus('checking');
    const t0 = performance.now();
    const ep = await detectDoclingEndpoint();
    const t1 = performance.now();
    if (ep) {
      setEndpoint(ep);
      setLatencyMs(Math.round(t1 - t0));
      setStatus('online');
    } else {
      setLatencyMs(null);
      setStatus('offline');
    }
    setLastCheck(Date.now());
  }, [effectiveAuto]);

  // Auto-start (comportamento antigo)
  useEffect(() => {
    if (effectiveAuto) {
      startedRef.current = true;
      check();
    }
  }, [effectiveAuto, check]);

  const start = useCallback(async () => {
    if (!startedRef.current) {
      startedRef.current = true;
      await check();
    } else {
      await check();
    }
  }, [check]);

  const forceEndpoint = useCallback(async (ep: string) => {
    try { localStorage.setItem(DOCLING_LOCALSTORAGE_KEY, ep); } catch {}
    setEndpoint(ep);
    setStatus('checking');
    // revalidate quickly
    const ok = await (async () => {
      try { return await ping(ep); } catch { return false; } })();
    setStatus(ok ? 'online' : 'offline');
  }, []);

  return { endpoint, status, latencyMs, lastCheck, retry: check, forceEndpoint, start, started: startedRef.current };
}
