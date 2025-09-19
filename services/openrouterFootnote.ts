import { ProcessingMode } from '../types';
import { callOpenRouter } from './openRouterService';
import { buildMasterPrompt } from './masterPrompt';
import { getFootnotesTaskDocling, getTablePreservationGuard } from '../prompts/doclingTemplates';
import { cleanText } from './textCleanup';
import { auditInlineNumericRefs } from './footnoteAudit';

function normalizeSuperscripts(input: string): string {
  if (!input) return input;
  const map: Record<string, string> = { '⁰':'0','ⁱ':'i','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9' };
  return input.replace(/[⁰ⁱ¹²³⁴⁵⁶⁷⁸⁹]/g, ch => map[ch] || ch);
}

export interface ORFootnoteArgs {
  main_chunk_content: string;
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  onApiCall: () => void;
  mode: ProcessingMode;
  model?: string; // optional override model id
}

export async function processFootnotesChunkOpenRouter(args: ORFootnoteArgs): Promise<string> {
  // Cleanup-only short-circuit to deterministic normalization without API call
  try {
    if (localStorage.getItem('cleanup_only_mode') === '1') {
      const cleaned = normalizeSuperscripts(cleanText(args.main_chunk_content));
      return cleaned;
    }
  } catch {}
  args.onApiCall();

  const originalChunk = args.main_chunk_content;
  const normalizedChunk = normalizeSuperscripts(originalChunk);
  const task = getFootnotesTaskDocling() + '\n' + getTablePreservationGuard();
  const prompt = buildMasterPrompt({
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    task_instructions: task,
    main_chunk_content: normalizedChunk,
    injectFootnoteBlock: true,
    includeTaggingExamples: true
  });

  const model = args.model || localStorage.getItem('openrouter_model') || 'qwen/qwen-2.5-7b-instruct';
  const temperature = 0.1;
  try {
    const result = await callOpenRouter({ model, temperature, messages: [{ role: 'user', content: prompt }] });
    let finalText = (result || '').trim() || originalChunk;
    // Audit for numeric loss; optional retry
    try {
      const numericAudit = auditInlineNumericRefs(normalizedChunk, finalText);
      const enableRetry = localStorage.getItem('enable_openrouter_retry_numeric') === '1';
      const lossRatioThreshold = parseFloat(localStorage.getItem('openrouter_retry_loss_ratio') || '0.15');
      const maxRetryLostCap = parseInt(localStorage.getItem('openrouter_retry_max_lost_cap') || '5', 10);
      const shouldRetry = enableRetry && numericAudit.lost.length > 0 && (numericAudit.lossRatio >= lossRatioThreshold || numericAudit.lost.length <= maxRetryLostCap);
      if (shouldRetry) {
        const reinforcement = `\n[CORRECTION PASS]\nYou removed inline numeric references: ${numericAudit.lost.join(', ')}. Restore EACH digit exactly in original positions. Return full corrected chunk only.`;
        const retry = await callOpenRouter({ model, temperature, messages: [{ role: 'user', content: prompt + reinforcement }] });
        if (retry && retry.trim().length > 0) finalText = retry.trim();
      }
      // Fail-safe default ON unless explicitly disabled
      const fsFlag = localStorage.getItem('enable_openrouter_fail_safe');
      const enableFailSafe = fsFlag === '1' || fsFlag === null;
      const finalAudit = auditInlineNumericRefs(normalizedChunk, finalText);
      if (enableFailSafe && finalAudit.lost.length > 0) {
        finalText = normalizedChunk;
      }
    } catch {}
    return finalText;
  } catch (e: any) {
    console.warn('[OpenRouter][Footnote] erro', e?.message || e);
    return originalChunk; // preserve content on failure
  }
}
