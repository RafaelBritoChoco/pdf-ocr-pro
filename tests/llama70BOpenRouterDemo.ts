// Demo script: process a tiny artificial chunk using OpenRouter with Llama 3 70B via existing unified pipeline.
// Usage (after setting API key in localStorage manually through the app OR adapt to set here if running in browser context).
// This script is meant to be imported/run inside the browser dev console after bundling, or adapted for a Node harness with a mock localStorage.

import { processDocumentChunkUnified } from '../services/aiService';
import { ProcessingMode } from '../types';

// Helper to ensure required localStorage flags for numeric preservation are on.
function ensureFlags() {
  try {
    localStorage.setItem('enable_openrouter_numeric_block','1');
    localStorage.setItem('enable_openrouter_retry_numeric','1');
    localStorage.setItem('enable_openrouter_fail_safe','1');
    localStorage.setItem('openrouter_model','meta-llama/llama-3.1-70b-instruct');
  } catch {}
}

export async function runLlama70BDemo() {
  ensureFlags();
  const sessionId = String(Date.now());
  localStorage.setItem('active_session_id', sessionId);

  const chunk = `This is a test paragraph illustrating footnote number retention 3 and another inline reference 12.
Heading SAMPLE SECTION
Another line referencing article 7 should keep all numbers.`;

  const res = await processDocumentChunkUnified({
    main_chunk_content: chunk,
    continuous_context_summary: 'N/A',
    previous_chunk_overlap: '',
    next_chunk_overlap: '',
    task_instructions: 'Preserve text exactly. Only ensure numbers are not lost.',
    onApiCall: () => console.log('[Demo] API call fired'),
    mode: 'simple' as ProcessingMode,
    provider: 'openrouter',
    openRouterModel: 'meta-llama/llama-3.1-70b-instruct',
    expectedSessionId: sessionId
  });

  console.log('[Demo][Llama70B] Output =>\n', res);
  return res;
}

// If you want to auto-run when this file is loaded (uncomment):
// runLlama70BDemo();
