// Shared MASTER PROMPT builder used by both Gemini and OpenRouter clone mode.
// Modularized into smaller components (base header + optional footnote block) for maintainability.
import { BASE_PROMPT_HEADER } from '../prompts/basePromptHeader';
import { buildFootnoteBlock } from '../prompts/footnoteBlock';

export interface MasterPromptParams {
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  task_instructions: string;
  main_chunk_content: string;
  injectFootnoteBlock?: boolean; // optional extended numeric/footnote preservation guidance
  includeTaggingExamples?: boolean; // NEW: only show tagging examples when explicitly requested
}

export function buildMasterPrompt(p: MasterPromptParams): string {
  // Extraction phase guard: when active, we force disable tagging examples even if caller asked.
  const extractionOnly = (() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const flag = localStorage.getItem('enable_extraction_phase');
        if (flag === '1') return true;
      }
    } catch {}
    if (typeof process !== 'undefined' && process.env.EXTRACTION_PHASE === '1') return true;
    return false;
  })();
  const footnoteBlock = p.injectFootnoteBlock ? buildFootnoteBlock(!extractionOnly && !!p.includeTaggingExamples) : '';
  return `${BASE_PROMPT_HEADER}\n---\n\n[PROVIDED CONTEXT]\n\n1.  **Continuous Context Summary (Structure already processed):**\n    \`${p.continuous_context_summary}\`\n\n2.  **Previous Chunk Overlap (Last few lines of the previous chunk):**\n    \`\`\`\n    ${p.previous_chunk_overlap}\n    \`\`\`\n\n3.  **Next Chunk Overlap (First few lines of the next chunk):**\n    \`\`\`\n    ${p.next_chunk_overlap}\n    \`\`\`\n\n---\n\n[YOUR TASK]\nBased on the context above, perform the following task on the [MAIN CHUNK TO PROCESS]:\n\n${p.task_instructions}\n\n---\n\n[MAIN CHUNK TO PROCESS]\n${footnoteBlock}\n\n${p.main_chunk_content}`;
}
