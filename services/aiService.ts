// Aggregator service: decides which provider (Gemini or OpenRouter/Qwen) to use.
// Exposes the same interface used previously by the app: performOcrOnPdf, processDocumentChunk, plus provider management.

import { ProcessingMode } from '../types';
import { performOcrOnPdf as geminiOcr, processDocumentChunk as geminiProcess, setGeminiApiKey } from './geminiService';
import { callOpenRouter } from './openRouterService';

export type Provider = 'gemini' | 'openrouter';

// Keys are stored in localStorage externally via UI.
export function configureProviderApiKey(provider: Provider, key: string) {
  if (provider === 'gemini') setGeminiApiKey(key);
  if (provider === 'openrouter') localStorage.setItem('openrouter_api_key', key.trim());
}

export interface ProcessChunkArgs {
  main_chunk_content: string;
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  task_instructions: string;
  onApiCall: () => void;
  mode: ProcessingMode;
  provider: Provider;
  qwenModel?: string; // optional override when using openrouter
}

// Pré-limpeza específica para OpenRouter (Qwen) em texto completo antes do chunking.
// Objetivo: remover lixo óbvio (headers repetitivos, numeração de página isolada, múltiplos espaços) sem alterar estrutura.
export async function initialNormalizeWithOpenRouter(fullText: string, provider: Provider, qwenModel?: string): Promise<string> {
  if (provider !== 'openrouter') return fullText;
  const key = localStorage.getItem('openrouter_api_key');
  if (!key) return fullText;
  console.log('[AI][OpenRouter/Qwen][Pre] Iniciando pré-limpeza texto completo length=%d', fullText.length);
  const model = qwenModel || 'qwen/qwen-2.5-7b-instruct';
  const system = `You are a conservative pre-cleaning agent. You must ONLY remove obvious noise and leave meaningful content untouched.
CRITICAL: Preserve ALL footnote indicators and reference numbers (e.g., 1, 2, 3, 12) that appear inline or at line start followed by a space or punctuation. Do NOT remove or renumber them.`;
  const user = `RULES:
1. Keep all paragraphs, line breaks, list markers, numbering, indentation.
2. PRESERVE footnote markers: patterns like "1 ", "1.", "(1)", "[1]" at line start OR numeric references in superscript style represented plainly (e.g., trailing numbers after a word). Do not delete these numbers.
3. Remove page headers/footers repeated across pages (e.g., lines that appear on many pages alone at top/bottom) ONLY if they are not footnotes.
4. Remove standalone page numbers lines (e.g., "12", "- 12 -", "Page 12") but NOT footnote definition lines of the form "1 Texto da nota" (those must remain intact).
5. Normalize multiple blank lines to at most two.
6. Fix repeated spaces > 2 into single spaces.
7. Do NOT summarize or rewrite sentences.
8. Return ONLY the cleaned text.

EXAMPLES PRESERVE:
"1 Texto da nota" => Keep exactly.
"12 Esta é outra nota" => Keep exactly.
"Referência importante 3" (where 3 is a footnote reference) => Keep the 3.

TEXT:
${fullText}`;
  try {
    const cleaned = await callOpenRouter({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    if (cleaned.trim().length === 0) {
      console.warn('[AI][OpenRouter/Qwen][Pre] Resposta vazia, mantendo original.');
      return fullText;
    }
    console.log('[AI][OpenRouter/Qwen][Pre] Pré-limpeza concluída length=%d delta=%d', cleaned.length, cleaned.length - fullText.length);
    return cleaned;
  } catch (e) {
    console.error('[AI][OpenRouter/Qwen][Pre] Falha pré-limpeza, usando original:', e);
    return fullText;
  }
}

// Wrapper to normalize responses for OpenRouter
async function processWithOpenRouter(args: ProcessChunkArgs): Promise<string> {
  const systemPrompt = `You are an expert LEGAL / TECHNICAL document cleaner & structural preserver.
Rules (CRITICAL):
1. Preserve paragraph boundaries and blank lines that separate logical blocks.
2. Preserve bullet / list indicators (e.g., (a), (i), -, •, 1.) exactly as they appear unless they are obvious OCR glitches.
3. PRESERVE ALL footnote markers / reference numbers (e.g., 1, 2, 12) whether they appear:
   - At the start of a line followed by space or punctuation (likely footnote definition)
   - Inline after a word (likely a reference)
   - In parentheses or brackets: (1), [1], {1}
4. DO NOT collapse multiple paragraphs into one.
5. Remove ONLY page headers/footers, page numbers, stray artifacts – but DO NOT remove lines that look like footnote definitions (e.g., "3 Texto da nota" with meaningful text after the number).
6. Fix spacing anomalies (double spaces, space before punctuation) and OCR character errors.
7. Keep original language and wording; do not summarize.
8. Return ONLY the transformed chunk text (no explanations).`;

  const mergedPrompt = `CONTEXT SUMMARY (for continuity, do not repeat):\n${args.continuous_context_summary}\n\nOVERLAPS (for continuity only, do not include in final output)\n[PREVIOUS]\n${args.previous_chunk_overlap}\n[ NEXT ]\n${args.next_chunk_overlap}\n\nTASK INSTRUCTIONS (to apply):\n${args.task_instructions}\n\nIMPORTANT FOOTNOTE HANDLING:\n- Do NOT remove numeric footnote definitions (e.g., '5 Texto da nota')\n- Do NOT strip inline numeric references.\n- If uncertain whether a number is a page number or a footnote: KEEP IT.\n\nMAIN CHUNK TO PROCESS (transform this respecting rules):\n${args.main_chunk_content}`;
  const temperature = args.mode === ProcessingMode.FAST ? 0.1 : 0.2;
  const model = args.qwenModel || 'qwen/qwen-2.5-7b-instruct';
  const original = args.main_chunk_content;
  const originalNewlines = (original.match(/\n/g) || []).length;
  const first = await callOpenRouter({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mergedPrompt }
      ]
  });

  // Similaridade simples baseada em proporção de caracteres iguais após normalização.
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normOriginal = normalize(original);
  const normFirst = normalize(first);
  const minLen = Math.min(normOriginal.length, normFirst.length);
  let equal = 0;
  for (let i = 0; i < minLen; i++) if (normOriginal[i] === normFirst[i]) equal++;
  const similarity = minLen === 0 ? 0 : equal / minLen;
  console.log('[AI][OpenRouter/Qwen] similarity=%d lenOrig=%d lenOut=%d', similarity, normOriginal.length, normFirst.length);

  // Heurística adicional: se perdeu muitas quebras de linha (achatou)
  const firstNewlines = (first.match(/\n/g) || []).length;
  const newlineRatio = originalNewlines === 0 ? 1 : firstNewlines / originalNewlines;
  const flattened = originalNewlines > 6 && newlineRatio < 0.4; // perdeu >60% das quebras
  if (flattened) {
    console.log('[AI][OpenRouter/Qwen] Detecção de achatamento: originalNewlines=%d, firstNewlines=%d, ratio=%d', originalNewlines, firstNewlines, newlineRatio);
  }

  // Simple heuristic to detect if many leading footnote numbers disappeared:
  const lostFootnotePattern = /^\s*(\d{1,3})[\s).:-]/m;
  const originalHasNotes = (original.match(/^\s*\d{1,3}[\s).:-]/gm) || []).length;
  const firstHasNotes = (first.match(/^\s*\d{1,3}[\s).:-]/gm) || []).length;
  const footnoteLoss = originalHasNotes > 0 && firstHasNotes === 0;
  if (footnoteLoss) {
    console.log('[AI][OpenRouter/Qwen] Possível perda de notas de rodapé: restaurando números.');
  }

  if (footnoteLoss) {
    // Attempt a reinforced second pass focusing on keeping numbers
    const reinforcement = mergedPrompt + '\n\nCRITICAL: You REMOVED footnote markers. Restore ALL original numeric markers and definitions exactly while still cleaning noise.';
    const secondFoot = await callOpenRouter({
      model,
      temperature: 0.15,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: reinforcement }
      ]
    });
    // If still no markers, fallback to original (safer than losing them)
    const secondHas = (secondFoot.match(/^\s*\d{1,3}[\s).:-]/gm) || []).length;
    if (secondHas > 0) {
      return secondFoot;
    } else {
      console.warn('[AI][OpenRouter/Qwen] Segunda tentativa ainda sem footnotes. Mantendo chunk original para preservar marcadores.');
      return original;
    }
  }

  if ((similarity > 0.97 && Math.abs(normOriginal.length - normFirst.length) < 20) || flattened) {
    console.log('[AI][OpenRouter/Qwen] Output pouco alterado OU achatado. Reforçando prompt e tentando segunda vez.');
    const formattingReinforcement = flattened ? '\nYou REMOVED too many line breaks. Restore paragraph separation and list structure.' : '';
    const reinforcement = mergedPrompt + '\n\nIMPORTANT:\nApply ALL cleaning rules. Keep paragraph and list structure intact. Remove only noise.' + formattingReinforcement + '\nIf text was already clean, still ensure consistent spacing & line breaks. Return ONLY the cleaned chunk.';
    const second = await callOpenRouter({
      model,
      temperature: temperature === 0.1 ? 0.15 : temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: reinforcement }
      ]
    });
    const normSecond = normalize(second);
    const secondNewlines = (second.match(/\n/g) || []).length;
    const secondFlattened = originalNewlines > 6 && (secondNewlines / originalNewlines) < 0.4;
    if (normSecond !== normOriginal && !secondFlattened) {
      return second;
    }
    const locallyNormalized = original
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
    console.log('[AI][OpenRouter/Qwen] Segunda tentativa ainda inadequada (flatten=%s). Retornando versão localmente normalizada.', secondFlattened);
    return locallyNormalized;
  }
  return first;
}

export async function processDocumentChunkUnified(args: ProcessChunkArgs): Promise<string> {
  console.log('[AI][processDocumentChunkUnified] provider=%s mode=%s chunkSize=%d', args.provider, args.mode, args.main_chunk_content.length);
  if (args.provider === 'gemini') {
    const res = await geminiProcess({
      main_chunk_content: args.main_chunk_content,
      continuous_context_summary: args.continuous_context_summary,
      previous_chunk_overlap: args.previous_chunk_overlap,
      next_chunk_overlap: args.next_chunk_overlap,
      task_instructions: args.task_instructions,
      onApiCall: args.onApiCall,
      mode: args.mode
    });
    console.log('[AI][Gemini] chunk processed length=%d', res.length);
    return res;
  }
  args.onApiCall();
  try {
    const res = await processWithOpenRouter(args);
    console.log('[AI][OpenRouter/Qwen] chunk processed length=%d', res.length);
    return res;
  } catch (e) {
    console.error('[AI][OpenRouter/Qwen] erro processando chunk:', e);
    return `[ERROR OPENROUTER CHUNK]\n\n${args.main_chunk_content}`;
  }
}

export async function performOcrUnified(file: File, onApiCall: () => void, mode: ProcessingMode, provider: Provider): Promise<string> {
  console.log('[AI][performOcrUnified] provider=%s file=%s size=%d', provider, file.name, file.size);
  if (provider === 'gemini') {
    const res = await geminiOcr(file, onApiCall, mode);
    console.log('[AI][Gemini][OCR] length=%d', res.length);
    return res;
  }
  console.log('[AI][OpenRouter] Pular OCR (não implementado). Retornando string vazia.');
  return '';
}
