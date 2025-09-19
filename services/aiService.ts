// Aggregator service: decides which provider (Gemini or OpenRouter/Qwen) to use.
// Exposes the same interface used previously by the app: performOcrOnPdf, processDocumentChunk, plus provider management.

import { ProcessingMode } from '../types';
import { performOcrOnPdf as geminiOcr, processDocumentChunk as geminiProcess, setGeminiApiKey } from './geminiService';
import { callOpenRouter } from './openRouterService';
import { processFootnotesChunkOpenRouter } from './openrouterFootnote';
import { processHeadlinesChunkOpenRouter } from './openrouterHeadline';
import { processTextLevelChunkOpenRouter } from './openrouterTextLevel';
import { buildMasterPrompt } from './masterPrompt';
import { cleanText, isCleanupOnlyMode } from './textCleanup';
import { auditInlineNumericRefs } from './footnoteAudit';
import { auditHeadings } from './headingAudit';
import { addAuditEvent } from './auditLogService';

// DRÁSTICA SIMPLIFICAÇÃO: Todo o fluxo OpenRouter agora replica exatamente o MASTER PROMPT do Gemini.
// Nenhuma estratégia, pré-limpeza, auditoria ou sanitização adicional.
function getOpenRouterStrategy(): 'clone' { return 'clone'; }
function isCloneGeminiMode() { return true; }
function recordStrategy(_: string) { /* no-op */ }
function markStrategyUsed(_: string) { /* no-op */ }

// Normalização local de dígitos sobrescritos para preservar a informação numérica em modelos que tendem a omiti-los.
function normalizeSuperscripts(input: string): string {
  if (!input) return input;
  // Não converto 'ⁱ' para número porque pode ser literal; mantemos 'i' conforme lógica usada no gemini OCR.
  const map: Record<string, string> = { '⁰':'0','ⁱ':'i','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9' };
  return input.replace(/[⁰ⁱ¹²³⁴⁵⁶⁷⁸⁹]/g, ch => map[ch] || ch);
}

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
  openRouterModel?: string; // optional override when using openrouter (Qwen, Llama 3, etc.)
  expectedSessionId?: string; // nova checagem de consistência de sessão
}

// Stage-specific simplified APIs to keep code clean for OpenRouter
export async function processFootnotesChunk(args: Omit<ProcessChunkArgs, 'provider' | 'task_instructions'> & { provider: Provider; openRouterModel?: string }): Promise<string> {
  if (args.provider === 'gemini') {
    // For parity, we reuse the unified path: Gemini uses master prompt internally
    return processDocumentChunkUnified({ ...args, provider: 'gemini', task_instructions: 'Footnote tagging pass' });
  }
  return processFootnotesChunkOpenRouter({
    main_chunk_content: args.main_chunk_content,
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    onApiCall: args.onApiCall,
    mode: args.mode,
    model: args.openRouterModel
  });
}

export async function processHeadlinesChunk(args: Omit<ProcessChunkArgs, 'provider' | 'task_instructions'> & { provider: Provider; openRouterModel?: string }): Promise<string> {
  if (args.provider === 'gemini') {
    return processDocumentChunkUnified({ ...args, provider: 'gemini', task_instructions: 'Headline tagging pass' });
  }
  return processHeadlinesChunkOpenRouter({
    main_chunk_content: args.main_chunk_content,
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    onApiCall: args.onApiCall,
    mode: args.mode,
    model: args.openRouterModel
  });
}

export async function processTextLevelChunk(args: Omit<ProcessChunkArgs, 'provider' | 'task_instructions'> & { provider: Provider; openRouterModel?: string }): Promise<string> {
  if (args.provider === 'gemini') {
    return processDocumentChunkUnified({ ...args, provider: 'gemini', task_instructions: 'Text-level tagging pass' });
  }
  return processTextLevelChunkOpenRouter({
    main_chunk_content: args.main_chunk_content,
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    onApiCall: args.onApiCall,
    mode: args.mode,
    model: args.openRouterModel
  });
}

// Pré-limpeza específica para OpenRouter (Qwen) em texto completo antes do chunking.
// Objetivo: remover lixo óbvio (headers repetitivos, numeração de página isolada, múltiplos espaços) sem alterar estrutura.
export async function initialNormalizeWithOpenRouter(fullText: string, _provider: Provider, _openRouterModel?: string): Promise<string> {
  // Pré-limpeza desativada: retornamos o texto original sem modificações.
  return fullText;
}

// Wrapper to normalize responses for OpenRouter
async function processWithOpenRouter(args: ProcessChunkArgs): Promise<string> {
  // CLEANUP-ONLY MODE: deterministic normalization without any LLM call.
  if (isCleanupOnlyMode()) {
    const original = normalizeSuperscripts(args.main_chunk_content);
    const cleaned = normalizeSuperscripts(cleanText(args.main_chunk_content));
    // Emit diagnostics event so panel shows OpenRouter context even in cleanup-only.
    try {
      const numAudit = auditInlineNumericRefs(original, cleaned);
      const headAudit = auditHeadings(original, cleaned);
      addAuditEvent({
        time: Date.now(),
        provider: 'openrouter',
        chunkPreview: original.slice(0, 60),
        numericLost: numAudit.lost.length ? numAudit.lost : undefined,
        headingLost: headAudit.lostHeadings.length ? headAudit.lostHeadings : undefined,
        lossRatio: numAudit.lossRatio,
        retried: false,
        final: true,
        model: 'cleanup-only'
      });
    } catch {}
    return cleaned;
  }
  // Prompt 100% alinhado ao MASTER_PROMPT usado em geminiService.processDocumentChunk
  const injectFootnoteBlock = (() => {
    try {
      // Enable via localStorage flag or if task_instructions menciona 'footnote'
      const flag = localStorage.getItem('enable_openrouter_numeric_block');
      if (flag === '1' || /footnote/i.test(args.task_instructions)) return true;
    } catch {}
    return false;
  })();

  // Fail-safe geral (documentado mais adiante na auditoria final):
  // localStorage.enable_openrouter_fail_safe = '1' -> Se após retry ainda houver perda de números/headings, retorna chunk original normalizado
  // Objetivo: ZERO perda silenciosa. Preferimos nenhuma transformação a perder dados.

  const originalChunk = args.main_chunk_content;
  const normalizedChunk = normalizeSuperscripts(originalChunk);

  // Extrai lista de referências numéricas inline (curtas) para reforçar preservação.
  let inlineRefList: string[] = [];
  try {
    inlineRefList = Array.from(new Set((normalizedChunk.match(/(?<=\w)(\d{1,3})(?=[\s\.,;:'"\)\]\}]|$)/g) || []).slice(0, 40)));
  } catch {}
  const enrichedTaskInstructions = injectFootnoteBlock && inlineRefList.length
    ? `${args.task_instructions}\n\n[REFERENCE DIGITS TO PRESERVE EXACTLY]\n${inlineRefList.join(', ')}`
    : args.task_instructions;

  const geminiMasterPrompt = buildMasterPrompt({
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    task_instructions: enrichedTaskInstructions,
    // Normalizamos somente o chunk principal para não alterar overlaps (que são apenas contexto)
    main_chunk_content: normalizedChunk,
    injectFootnoteBlock,
    includeTaggingExamples: injectFootnoteBlock && /tag|footnote|marcador/i.test(args.task_instructions)
  });
  const temperature = 0.1; // Paridade total com Gemini (sem variação por modo)
  const model = args.openRouterModel || localStorage.getItem('openrouter_model') || 'qwen/qwen-2.5-7b-instruct';
  try {
    const result = await callOpenRouter({
      model,
      temperature,
      messages: [ { role: 'user', content: geminiMasterPrompt } ]
    });
  const finalText = (result || '').trim() || originalChunk;
    let audited = finalText;
    let didRetry = false;
    try {
      // --- Retry / Audit Flags (documentação) ---
      // localStorage.enable_openrouter_retry_numeric = '1' -> habilita retry quando houver perda de números inline
      // localStorage.enable_openrouter_retry_headings = '1' -> habilita retry quando headings candidatas sumirem
      // localStorage.openrouter_retry_loss_ratio = '0.15'  -> limiar de proporção de perda (default 0.15 = 15%)
      // localStorage.openrouter_retry_max_lost_cap = '5'   -> se perda <= cap, ainda consideramos retry mesmo que lossRatio baixo
      // localStorage.enable_openrouter_numeric_block = '1'  -> injeta bloco de regras/footnotes no prompt
      // Todos são opcionais; ausência mantém comportamento simplificado.
  const enableRetryNumeric = localStorage.getItem('enable_openrouter_retry_numeric') === '1';
      const enableRetryHeadings = localStorage.getItem('enable_openrouter_retry_headings') === '1';
      const numericAudit = auditInlineNumericRefs(normalizedChunk, finalText);
      const headingAudit = auditHeadings(normalizedChunk, finalText);
      const lossRatioThreshold = parseFloat(localStorage.getItem('openrouter_retry_loss_ratio') || '0.15');
      const maxRetryLostCap = parseInt(localStorage.getItem('openrouter_retry_max_lost_cap') || '5', 10);

      const shouldRetryNumeric = enableRetryNumeric && numericAudit.lost.length > 0 && (numericAudit.lossRatio >= lossRatioThreshold || numericAudit.lost.length <= maxRetryLostCap);
      const shouldRetryHeadings = enableRetryHeadings && headingAudit.lostHeadings.length > 0; // for headings, any loss triggers (they're rarer)

      // Log initial audit snapshot
      if (injectFootnoteBlock) {
        addAuditEvent({
          time: Date.now(),
            provider: 'openrouter',
            chunkPreview: originalChunk.slice(0, 60),
            numericLost: numericAudit.lost.length ? numericAudit.lost : undefined,
            headingLost: headingAudit.lostHeadings.length ? headingAudit.lostHeadings : undefined,
            lossRatio: numericAudit.lossRatio,
            retried: false,
            final: false,
            model
        });
      }

      if ((shouldRetryNumeric || shouldRetryHeadings) && !didRetry) {
        didRetry = true;
        const reinforcementParts: string[] = [];
        if (shouldRetryNumeric) {
          reinforcementParts.push(`You removed inline numeric references: ${numericAudit.lost.join(', ')}. Restore EACH digit exactly in original positions.`);
        }
        if (shouldRetryHeadings) {
          reinforcementParts.push(`You removed structural heading lines: ${headingAudit.lostHeadings.map(h=>`"${h}"`).join(', ')}. Re-output them EXACTLY as they appeared.`);
        }
        reinforcementParts.push('Return FULL chunk text with corrections. Do NOT summarize, do NOT invent new headings, only restore missing elements. If already correct, just repeat previous output unchanged.');

        const reinforcement = `\n[CORRECTION PASS]\n${reinforcementParts.join('\n')}`;
        const retryPrompt = geminiMasterPrompt + reinforcement;
        try {
          const retryResult = await callOpenRouter({
            model,
            temperature,
            messages: [ { role: 'user', content: retryPrompt } ]
          });
          if (retryResult && retryResult.trim().length > 0) {
            audited = retryResult.trim();
          }
          if (injectFootnoteBlock) {
            addAuditEvent({
              time: Date.now(),
              provider: 'openrouter',
              chunkPreview: originalChunk.slice(0, 60),
              numericLost: numericAudit.lost.length ? numericAudit.lost : undefined,
              headingLost: headingAudit.lostHeadings.length ? headingAudit.lostHeadings : undefined,
              lossRatio: numericAudit.lossRatio,
              retried: true,
              final: false,
              model
            });
          }
        } catch (re) {
          console.warn('[AI][OpenRouter][Retry] Falha no retry, mantendo primeira resposta.', re);
        }
      }
      // Final audit and optional fail-safe: ALWAYS evaluate to prevent silent removals
      const finalNumericAudit = auditInlineNumericRefs(normalizedChunk, audited);
      const finalHeadingAudit = auditHeadings(normalizedChunk, audited);
      // Default fail-safe ON if flag missing; disable only if explicitly set to '0'
      const fsFlag = localStorage.getItem('enable_openrouter_fail_safe');
      const enableFailSafe = fsFlag === '1' || fsFlag === null;
      let failSafeTriggered = false;
      if (enableFailSafe && (finalNumericAudit.lost.length > 0 || finalHeadingAudit.lostHeadings.length > 0)) {
        // Fail-safe: return ORIGINAL (normalized) chunk to avoid any loss.
        console.warn('[AI][OpenRouter][FailSafe] Perdas detectadas. Retornando chunk ORIGINAL para preservar dígitos/headings.');
        audited = normalizedChunk; // keep only superscript normalization
        failSafeTriggered = true;
      } else {
        if (finalNumericAudit.lost.length) {
          console.warn('[AI][OpenRouter][Audit][Final] Ainda faltam inline refs', finalNumericAudit);
        }
        if (finalHeadingAudit.lostHeadings.length) {
          console.warn('[AI][OpenRouter][Audit][Final] Ainda faltam headings', finalHeadingAudit);
        }
      }
      // Emit diagnostic event when either numeric block active (for visibility) or fail-safe is enabled
      if (injectFootnoteBlock || enableFailSafe) {
        addAuditEvent({
          time: Date.now(),
          provider: 'openrouter',
          chunkPreview: originalChunk.slice(0, 60),
          numericLost: finalNumericAudit.lost.length ? finalNumericAudit.lost : undefined,
          headingLost: finalHeadingAudit.lostHeadings.length ? finalHeadingAudit.lostHeadings : undefined,
          lossRatio: finalNumericAudit.lossRatio,
          retried: didRetry,
          final: true,
          model,
          failSafe: failSafeTriggered || undefined
        });
      }
    } catch (e) {
      console.warn('[AI][OpenRouter][Audit] erro auditando / retry', e);
    }
    return audited;
  } catch (e: any) {
    const msg = (e?.message || '').toString();
    if (msg.includes('MODEL_NOT_FOUND 404') && model !== 'qwen/qwen-2.5-7b-instruct') {
      // Tentativa única de fallback simples
      const fallback = 'qwen/qwen-2.5-7b-instruct';
      try { localStorage.setItem('openrouter_model', fallback); } catch {}
      try {
        const second = await callOpenRouter({
          model: fallback,
          temperature,
          messages: [ { role: 'user', content: geminiMasterPrompt } ]
        });
        return (second || '').trim() || args.main_chunk_content;
      } catch {}
    }
    console.warn('[AI][OpenRouter] Falha chunk retornando original:', msg);
    return args.main_chunk_content;
  }
}

export async function processDocumentChunkUnified(args: ProcessChunkArgs): Promise<string> {
  // Verificação de sessão para evitar processamento fantasma após F5.
  try {
    const activeSession = localStorage.getItem('active_session_id');
    if (!activeSession) {
      console.warn('[AI][processDocumentChunkUnified] Abortado: sessão inexistente (possível refresh).');
      return args.main_chunk_content; // devolve original para não perder conteúdo
    }
    if (args.expectedSessionId && activeSession !== args.expectedSessionId) {
      console.warn('[AI][processDocumentChunkUnified] Abortado: sessão divergente (stale call). expected=%s current=%s', args.expectedSessionId, activeSession);
      return args.main_chunk_content;
    }
  } catch {}
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
  // For OpenRouter provider, allow cleanup-only short-circuit before any API usage.
  if (isCleanupOnlyMode()) {
    const cleaned = normalizeSuperscripts(cleanText(args.main_chunk_content));
    console.log('[AI][OpenRouter][CleanupOnly] chunk cleaned length=%d', cleaned.length);
    return cleaned;
  }
  args.onApiCall();
  try {
    const res = await processWithOpenRouter(args);
  console.log('[AI][OpenRouter] chunk processed length=%d', res.length);
    return res;
  } catch (e) {
  console.error('[AI][OpenRouter] erro processando chunk:', e);
    const msg = (e as any)?.message || String(e);
    if (msg.includes('OpenRouter 401')) {
      return '[ERROR OPENROUTER 401]';
    }
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
