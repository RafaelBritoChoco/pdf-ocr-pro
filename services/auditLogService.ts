// Simple audit log service storing recent AI processing audits in localStorage.
// Ring buffer semantics: keep last N (default 50) events.

export interface AuditEvent {
  time: number;                 // epoch ms
  provider: string;             // 'openrouter' | 'gemini'
  chunkPreview: string;         // first ~60 chars of chunk
  numericLost?: string[];       // lost numeric references (if any)
  headingLost?: string[];       // lost headings (if any)
  lossRatio?: number;           // numeric loss ratio
  retried?: boolean;            // whether a retry attempted
  final?: boolean;              // final state after retry
  model?: string;               // model id used
  failSafe?: boolean;           // whether fail-safe fallback activated (returned original chunk)
}

const STORAGE_KEY = 'ai_audit_events_v1';

function loadAll(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as AuditEvent[];
  } catch {}
  return [];
}

function saveAll(events: AuditEvent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch {}
}

export function addAuditEvent(evt: AuditEvent, max = 50) {
  const events = loadAll();
  events.push(evt);
  while (events.length > max) events.shift();
  saveAll(events);
}

export function getAuditEvents(): AuditEvent[] {
  return loadAll().slice().sort((a,b) => b.time - a.time); // newest first
}

export function clearAuditEvents() {
  saveAll([]);
}
