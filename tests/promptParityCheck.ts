// Quick manual parity check (run with: node --loader ts-node/esm tests/promptParityCheck.ts) if ts-node installed.
// Since project has no test runner dependency, this is a lightweight script.
import { buildMasterPrompt } from '../services/masterPrompt.js';

function buildGeminiStyle(params: any) {
  // Intentionally reuse same builder – if in future Gemini diverges, copy its raw template here for diff.
  return buildMasterPrompt(params);
}

function buildOpenRouterStyle(params: any) {
  return buildMasterPrompt(params);
}

const sample = {
  continuous_context_summary: 'Previous processed structure summary here',
  previous_chunk_overlap: 'Last lines of prev chunk',
  next_chunk_overlap: 'First lines of next chunk',
  task_instructions: 'Perform structural tagging ONLY on headlines.',
  main_chunk_content: 'Article 1 Purpose\nThis Agreement ...' ,
};

const a = buildGeminiStyle(sample);
const b = buildOpenRouterStyle(sample);

if (a === b) {
  console.log('[PARITY OK] Prompts are identical in this sample. Length:', a.length);
} else {
  const maxContext = 400;
  let diffIndex = -1;
  for (let i=0;i<Math.min(a.length,b.length);i++) {
    if (a[i] !== b[i]) { diffIndex = i; break; }
  }
  console.log('[PARITY FAIL] Prompts diverge. First diff at index', diffIndex);
  if (diffIndex >= 0) {
    console.log('Around A:', a.slice(Math.max(0,diffIndex-40), diffIndex+40));
    console.log('Around B:', b.slice(Math.max(0,diffIndex-40), diffIndex+40));
  }
  console.log('A length:', a.length, 'B length:', b.length);
}
