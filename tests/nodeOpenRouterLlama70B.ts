// Node harness to test OpenRouter Llama 3 70B chunk processing without frontend.
// Requires: environment variable OPENROUTER_API_KEY (safer than hardcoding) OR will try process.env then fallback to localStorage mock if you manually set below.
// Run: npm run demo:openrouter:llama70b

import { processDocumentChunkUnified } from '../services/aiService';
import { auditInlineNumericRefs } from '../services/footnoteAudit';
import { auditHeadings } from '../services/headingAudit';
import type { ProcessingMode } from '../types';

// --- Minimal localStorage polyfill for Node ---
class MemoryStorage {
  private store = new Map<string,string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
// @ts-ignore
if (typeof globalThis.localStorage === 'undefined') { // attach polyfill
  // @ts-ignore
  globalThis.localStorage = new MemoryStorage();
}

// Accept API key from env for security
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('[Harness] Missing OPENROUTER_API_KEY env var. Set it before running.');
  process.exitCode = 1;
}
if (apiKey) {
  localStorage.setItem('openrouter_api_key', apiKey.trim());
}

// Configure model + flags
localStorage.setItem('openrouter_model','meta-llama/llama-3.1-70b-instruct');
localStorage.setItem('enable_openrouter_numeric_block','1');
localStorage.setItem('enable_openrouter_retry_numeric','1');
localStorage.setItem('enable_openrouter_fail_safe','1');
localStorage.setItem('active_session_id','node-session');

async function main() {
  const sampleChunk = `Agreement obligations survive termination 3.
3 This obligation survives termination for 2 years.
SECTION GENERAL PROVISIONS
Another clause referencing duty 12 and article 7.`;

  const result = await processDocumentChunkUnified({
    main_chunk_content: sampleChunk,
    continuous_context_summary: 'N/A',
    previous_chunk_overlap: '',
    next_chunk_overlap: '',
    task_instructions: 'Preserve all digits and headings exactly. Do NOT drop or summarize.',
    onApiCall: () => console.log('[Harness] API call'),
    mode: 'simple' as ProcessingMode,
    provider: 'openrouter',
    openRouterModel: 'meta-llama/llama-3.1-70b-instruct',
    expectedSessionId: 'node-session'
  });

  console.log('\n[Harness] RAW OUTPUT:\n', result);

  const numAudit = auditInlineNumericRefs(sampleChunk, result);
  const headingAudit = auditHeadings(sampleChunk, result);
  console.log('\n[Harness] Numeric Audit:', numAudit);
  console.log('[Harness] Heading Audit:', headingAudit);

  if (numAudit.lost.length === 0 && headingAudit.lostHeadings.length === 0) {
    console.log('\n[Harness] SUCCESS: No losses detected.');
  } else {
    console.warn('\n[Harness] WARN: Losses detected.');
  }
}

main().catch(e => {
  console.error('[Harness] Fatal error:', e);
  process.exit(1);
});
