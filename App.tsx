import React, { useState, useCallback, useEffect, useRef } from 'react';
// Global error instrumentation (once) to capture stack traces for mysterious 'reading length' errors.
if (typeof window !== 'undefined' && !(window as any).__GLOBAL_ERROR_INSTRUMENTED__) {
  (window as any).__GLOBAL_ERROR_INSTRUMENTED__ = true;
  window.addEventListener('error', (ev) => {
    try {
      const info = {
        type: 'window.error',
        message: ev.message,
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: (ev.error && (ev.error as any).stack) || 'no-stack',
        time: new Date().toISOString()
      };
      console.error('[GlobalError]', info);
      localStorage.setItem('last_global_error', JSON.stringify(info));
    } catch {}
  });
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    try {
      const reason: any = ev.reason || {};
      const info = {
        type: 'unhandledrejection',
        message: reason.message || String(reason),
        stack: reason.stack || 'no-stack',
        time: new Date().toISOString()
      };
      console.error('[GlobalUnhandledRejection]', info);
      localStorage.setItem('last_global_error', JSON.stringify(info));
    } catch {}
  });
}
import { FileUpload } from './components/FileUpload';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import { ResultViewer } from './components/ResultViewer';
import { PerformanceTracker } from './components/PerformanceTracker';
import { ExtractionBanner } from './components/ExtractionBanner';
import { ConfigurationScreen } from './components/ConfigurationScreen';
import { usePerformanceTracker } from './hooks/usePerformanceTracker';
import { ProcessingState, DownloadFormat, ProcessingMode } from './types';
import { analyzeHeadlines, analyzeFootnotes, analyzeContent, recordIntegrity } from './services/tagIntegrityService';
import { extractTextFromFile, getPdfPageCount } from './services/pdfExtractor';
import { extractWithDoclingFull, doclingHealth, waitForDoclingHealthy } from './services/doclingService';
import { DoclingMeta } from './types';
import DoclingMetaPanel from './components/DoclingMetaPanel';
import { createChunksByCount } from './services/chunkingService';
import { 
  getTaskInstructionsForCleaning,
  getTaskInstructionsForStep1_Headlines,
  getTaskInstructionsForStep2_Content,
  getTaskInstructionsForFootnotes,
  getTaskInstructionsForFootnotesMarkers,
} from './services/geminiService';
import { useDoclingEndpoint } from './services/doclingDetect';
import { processDocumentChunkUnified, performOcrUnified, configureProviderApiKey, Provider, initialNormalizeWithOpenRouter } from './services/aiService';
import { validateOpenRouterKey, abortAllOpenRouterRequests } from './services/openRouterService';
import { ApiKeyScreen } from './components/ApiKeyScreen';
// Util: remove duplicação onde um título aparece em linha isolada e logo abaixo a versão taggeada
function dedupeHeadlines(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const tagMatch = next?.match(/^\s*\{\{level(\d+)}}(.*)\{\{-level\1}}\s*$/);
    if (tagMatch) {
      const inside = tagMatch[2].trim();
      if (inside === line.trim()) {
        out.push(next);
        i++;
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

// Safe helpers to avoid undefined length / trim crashes
function safeLen(v: any): number { try { return typeof v === 'string' ? v.length : (Array.isArray(v) ? v.length : 0); } catch { return 0; } }
function safeTrim(v: any): string { try { return typeof v === 'string' ? v.trim() : ''; } catch { return ''; } }
function nonEmpty(v: any): boolean { return safeTrim(v).length > 0; }

const BASE_CHUNK_SIZE_FOR_RECOMMENDATION = 32000;
const OVERLAP_CONTEXT_SIZE = 400; // Characters for context overlap
const MAX_CHUNK_ATTEMPTS = 3; // Max retries for a failed chunk
// Flag para simplificar OpenRouter e deixá-lo igual ao fluxo Gemini (sem pré-processamentos agressivos)
const OPENROUTER_SIMPLIFIED = true;
// Chave para retomar processamento de limpeza após refresh
const CLEANING_RESUME_KEY = 'cleaning_resume_v1';

// Função central para adaptar instruções base (Gemini) para OpenRouter sem espalhar ifs
function buildProviderInstruction(base: string, provider: Provider, context: 'cleaning'|'headlines'|'content'|'footnotes_markers'): string {
  if (provider !== 'openrouter') return base;
  // Complementos específicos para robustez do modelo OpenRouter escolhido
  let extra = '';
  switch (context) {
    case 'cleaning':
      extra = `OPENROUTER ADAPTATION:\n- Baseado na instrução Gemini.\n- NÃO mover números de referência no fim de linha para a próxima.\n- Não inventar conteúdo; apenas limpar ruído óbvio.\n- Evitar remover números isolados que possam ser marcadores.`; break;
    case 'headlines':
      extra = `OPENROUTER ADAPTATION:\n- Envolver apenas títulos reais com {{levelX}}...{{-levelX}}.\n- NÃO duplicar a linha.\n- NÃO mover números de nota.\n- Marcar padrões fortes: CHAPTER / SECTION / CAP[IÍ]TULO / ARTIGO / Art. N / Article N.`; break;
    case 'content':
      extra = `OPENROUTER ADAPTATION:\n- Não alterar linhas já taggeadas como headline.\n- Não mover números de fim de linha.\n- Somente aplicar marcações de conteúdo solicitadas.`; break;
    case 'footnotes_markers':
      extra = `OPENROUTER ADAPTATION:\n- Marcar apenas referências e conteúdo das notas.\n- Não alterar outras linhas ou mover números.`; break;
  }
  return base + '\n\n' + extra;
}

// Heurística simples única (mantemos só esta versão enxuta)
function restoreTrailingReferenceNumber(originalChunk: string, processedChunk: string): string {
  const origLines = originalChunk.split(/\r?\n/);
  const procLines = processedChunk.split(/\r?\n/);
  let changed = false;
  origLines.forEach((origLine, idx) => {
    const m = origLine.match(/([;:,])\s*(\d{1,4})\s*$/);
    if (!m) return;
    const num = m[2];
    const current = procLines[idx] || '';
    const next = procLines[idx + 1] || '';
    if (current.includes(num)) return; // já ok
    if (/^\s*[-•]?\s*\d+\b/.test(next) && next.includes(num)) {
      procLines[idx] = origLine; // restaura
      procLines[idx + 1] = next.replace(new RegExp('^(\\s*[-•]?\\s*)' + num + '\\s*'), '$1').trim();
      changed = true;
    }
  });
  return changed ? procLines.join('\n') : processedChunk;
}

export default function App() {
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>(ProcessingMode.QUALITY);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Nome do arquivo selecionado (persistido) para restaurar sessão após refresh mesmo sem objeto File
  const [selectedFileName, setSelectedFileName] = useState<string | null>(() => localStorage.getItem('last_file_name') || null);
  const [initialExtractedText, setInitialExtractedText] = useState<string>('');
  const [extractedText, setExtractedText] = useState<string>('');
  const [extractorSource, setExtractorSource] = useState<'docling' | 'pdfjs' | null>(null);
  const [textWithHeadlines, setTextWithHeadlines] = useState<string | null>(null);
  const [structuredText, setStructuredText] = useState<string | null>(null);
  const [markerStageText, setMarkerStageText] = useState<string | null>(null); // snapshot após footnotes markers
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [doclingConnectMessage, setDoclingConnectMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [structuringMessage, setStructuringMessage] = useState<string>('');
  const [doclingMeta, setDoclingMeta] = useState<DoclingMeta | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [desiredChunkCount, setDesiredChunkCount] = useState<number>(1);
  const [failedChunks, setFailedChunks] = useState<number[]>([]);
  const [apiKey, setApiKey] = useState<string>(() => (localStorage.getItem('ai_provider') === 'openrouter' ? (localStorage.getItem('openrouter_api_key') || '') : (localStorage.getItem('gemini_api_key') || '')));
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('ai_provider') as Provider) || 'gemini');
  // Modelo selecionado para OpenRouter (Llama 3, Qwen, etc.) com migração de chave antiga
  const [openRouterModel, setOpenRouterModel] = useState<string>(() => {
    const migrated = localStorage.getItem('openrouter_model');
    if (migrated) return migrated;
    const legacy = localStorage.getItem('qwen_model');
    if (legacy) {
      try { localStorage.setItem('openrouter_model', legacy); } catch {}
      return legacy;
    }
    return 'meta-llama/llama-3-8b-instruct';
  });
  // Sanitiza sufixo legado ':free' se presente
  useEffect(() => {
    if (openRouterModel.endsWith(':free')) {
      const sanitized = openRouterModel.replace(/:free$/,'');
      setOpenRouterModel(sanitized);
      try { localStorage.setItem('openrouter_model', sanitized); } catch {}
    }
  }, [openRouterModel]);
  // Indica se usuário tentou selecionar um provider sem chave configurada
  const [missingKey, setMissingKey] = useState<null | 'gemini' | 'openrouter'>(null);
  const [showApiKeyScreen, setShowApiKeyScreen] = useState<boolean>(() => !localStorage.getItem('gemini_api_key') && !localStorage.getItem('openrouter_api_key'));
  const [preCleanEnabled, setPreCleanEnabled] = useState<boolean>(() => localStorage.getItem('preclean_enabled') === 'true');
  const [preCleanStats, setPreCleanStats] = useState<{original: number; cleaned: number} | null>(null);
  const lastHeadlinesDedupedRef = useRef<string>('');
  const [footnotesProcessed, setFootnotesProcessed] = useState<boolean>(false);
  // Persistência
  const PERSIST_KEY = 'app_processing_snapshot_v1';
  const LAST_FILE_NAME_KEY = 'last_file_name';
  // Retomada automática (modal removido)
  const [allowSnapshotSave, setAllowSnapshotSave] = useState(true);
  // Indica se usuário iniciou nova sessão durante este ciclo de vida (para suprimir prompt de sessão anterior)
  const newSessionStartedRef = useRef(false);
  // Flag indicando retomada ativa de limpeza
  const [resumingCleaning, setResumingCleaning] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState<CleaningResumeData | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  // Evitar múltiplas extrações paralelas causando estados inconsistentes
  const extractingRef = useRef(false);
  // Controle de cancelamento global para loops longos (cleaning, headlines, footnotes, content)
  // Auto-detecção do endpoint Docling (substitui lógica manual anterior)
  // Modo lazy: só detecta quando realmente precisamos (ex: iniciar extração que usa Docling)
  const { endpoint: autoDoclingEndpoint, status: doclingStatus, latencyMs: doclingLatencyMs, lastCheck: doclingLastCheck, retry: retryDoclingDetect, start: startDoclingDetect, started: doclingDetectStarted } = useDoclingEndpoint({ auto: false });
  const doclingOnline = doclingStatus === 'online' ? true : (doclingStatus === 'offline' ? false : null);
  const getDoclingEndpoint = useCallback(() => autoDoclingEndpoint || 'http://localhost:8008', [autoDoclingEndpoint]);
  const checkDocling = useCallback(() => retryDoclingDetect(), [retryDoclingDetect]);

  // Tipagem auxiliar para objeto de retomada
  interface CleaningResumeData {
    version: 1;
    stage: 'cleaning';
    baseText: string;
    desiredChunkCount: number;
    processedChunks: (string | null)[]; // null = não processado ainda
    failedChunks: number[];
    nextIndex: number; // índice do próximo chunk a processar
    totalChunks: number;
    provider: Provider;
    processingMode: ProcessingMode;
    preCleanEnabled: boolean;
    openRouterModel?: string;
  }

  const saveCleaningResume = useCallback((data: CleaningResumeData) => {
    try { localStorage.setItem(CLEANING_RESUME_KEY, JSON.stringify(data)); } catch {}
  }, []);
  const clearCleaningResume = useCallback(() => {
    localStorage.removeItem(CLEANING_RESUME_KEY);
  }, []);

  const {
    elapsedTime,
    apiCalls,
    startTimer,
    stopTimer,
    resetTimer,
    incrementApiCalls,
  } = usePerformanceTracker();

  // Reset de sessão sem, por padrão, zerar métricas (timer / apiCalls).
  // Passe hard=true para também limpar métricas e storage do performance tracker.
  const handleReset = useCallback((hard: boolean = false) => {
    console.log('[UI][Reset] Executando reset', { hard });
    // Sinaliza cancelamento a loops em andamento
    cancelTokenRef.current.cancelled = true;
    try { abortAllOpenRouterRequests('reset'); } catch {}
    try { localStorage.removeItem('active_session_id'); } catch {}
    setProcessingState(ProcessingState.IDLE);
    setSelectedFile(null);
    setSelectedFileName(null);
    setInitialExtractedText('');
    setExtractedText('');
    setTextWithHeadlines(null);
    setStructuredText(null);
    setMarkerStageText(null);
    setErrorMessage('');
    setProgress(0);
    setTotalPages(0);
    setFailedChunks([]);
    setPreCleanStats(null);
      if (hard) {
        resetTimer(); // hard reset ainda possível manualmente
        try { localStorage.removeItem('performanceTrackerState:v1'); } catch {}
      }
    localStorage.removeItem('savedExtractedText');
    localStorage.removeItem('lastSavedTimestamp');
    localStorage.removeItem(PERSIST_KEY);
    localStorage.removeItem(LAST_FILE_NAME_KEY);
    localStorage.removeItem(CLEANING_RESUME_KEY);
    setFootnotesProcessed(false);
    // Gera novo token para próxima execução (loops checam id para evitar corrida)
    cancelTokenRef.current = { id: Date.now(), cancelled: false };
    try { localStorage.setItem('active_session_id', String(Date.now())); } catch {}
  }, [resetTimer]);

  // Referência global de cancelamento (definida após handleReset para clareza)
  const cancelTokenRef = useRef<{id:number; cancelled:boolean}>({ id: Date.now(), cancelled: false });

  // Gera/renova session id quando o App monta (evita reuso após F5 de loops antigos)
  useEffect(() => {
    try { localStorage.setItem('active_session_id', String(Date.now())); } catch {}
  }, []);

  // Inicializa cliente Gemini quando chave carregada
  useEffect(() => {
    if (apiKey) {
      try { configureProviderApiKey(provider, apiKey); } catch (e) { console.warn('Falha ao configurar API Key:', e); }
    }
  }, [apiKey, provider]);

  // Checar Docling automaticamente quando a aplicação carrega
  useEffect(() => {
    if (processingState === ProcessingState.IDLE) {
      if (!doclingDetectStarted) {
        startDoclingDetect();
      } else {
        checkDocling();
      }
    }
  }, [processingState, checkDocling, doclingDetectStarted, startDoclingDetect]);

  const handleApiKeySave = useCallback((data: { provider: string; geminiKey: string; openRouterKey: string; openRouterModel: string; }) => {
    const prov = (data.provider as Provider) || 'gemini';
    setProvider(prov);
    if (prov === 'gemini') {
      setApiKey(data.geminiKey);
      configureProviderApiKey('gemini', data.geminiKey);
    } else {
      setApiKey(data.openRouterKey);
      configureProviderApiKey('openrouter', data.openRouterKey);
  setOpenRouterModel(data.openRouterModel);
  try { localStorage.setItem('openrouter_model', data.openRouterModel); } catch {}
    }
    // Chave fornecida elimina aviso
    setMissingKey(null);
    setShowApiKeyScreen(false);
  }, []);

  // Função para aplicar snapshot (automaticamente no load)
  const applySnapshot = useCallback((snap: any) => {
    if (!snap) return;
    // Restaurar provider / modo se presentes
    if (snap.provider && snap.provider !== provider) {
      try { localStorage.setItem('ai_provider', snap.provider); } catch {}
      setProvider(snap.provider);
    }
    if (snap.processingMode && snap.processingMode !== processingMode) {
      setProcessingMode(snap.processingMode);
    }
    setProcessingState(snap.processingState ?? ProcessingState.IDLE);
    setInitialExtractedText(snap.initialExtractedText || '');
    setExtractedText(snap.extractedText || '');
    setTextWithHeadlines(snap.textWithHeadlines || null);
    setStructuredText(snap.structuredText || null);
    setMarkerStageText(snap.markerStageText || null);
    setProgress(snap.progress || 0);
    setTotalPages(snap.totalPages || 0);
    setFailedChunks(snap.failedChunks || []);
    setDesiredChunkCount(snap.desiredChunkCount || 1);
    setFootnotesProcessed(!!snap.footnotesProcessed);
    if (snap.selectedFileName || localStorage.getItem(LAST_FILE_NAME_KEY)) {
      setSelectedFileName(snap.selectedFileName || localStorage.getItem(LAST_FILE_NAME_KEY));
    }
  // Timer contínuo: ignoramos startTimer de snapshot
  }, [startTimer]);

  // Controla timer: conta apenas em estados de processamento ativos
  useEffect(() => {
    const activeStates: ProcessingState[] = [
      ProcessingState.EXTRACTING,
      ProcessingState.OCR,
      ProcessingState.CLEANING,
      ProcessingState.STRUCTURING_HEADLINES,
      ProcessingState.STRUCTURING_FOOTNOTES,
      ProcessingState.STRUCTURING_CONTENT,
    ];
    if (activeStates.includes(processingState)) {
      startTimer();
    } else {
      stopTimer();
    }
  }, [processingState, startTimer, stopTimer]);

  // Restauração automática de snapshot (retomada de limpeza ocorre em efeito separado após definição de handleStartCleaning)
  useEffect(() => {
    if (newSessionStartedRef.current) return;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap.version === 1) {
          applySnapshot(snap);
        }
      }
    } catch (e) {
      console.warn('Falha na restauração automática:', e);
    }
  }, [applySnapshot]);

  // Salvar snapshot relevante
  useEffect(() => {
    if (!allowSnapshotSave) return;
    const snap = {
      version: 1,
      processingState,
      initialExtractedText,
      extractedText,
      textWithHeadlines,
      structuredText,
      markerStageText,
      progress,
      totalPages,
      failedChunks,
      desiredChunkCount,
      footnotesProcessed,
      selectedFileName,
      provider,
      processingMode,
      timestamp: Date.now()
    };
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(snap)); } catch {}
  }, [allowSnapshotSave, processingState, initialExtractedText, extractedText, textWithHeadlines, structuredText, markerStageText, progress, totalPages, failedChunks, desiredChunkCount, footnotesProcessed, selectedFileName, provider, processingMode]);
  
  const handleFileSelect = useCallback(async (file: File) => {
    if (extractingRef.current) {
      console.warn('[FileSelect] Ignorado porque já existe extração em andamento.');
      return;
    }
    extractingRef.current = true;
    // Ao iniciar novo arquivo descartamos snapshot anterior (sem modal)
    localStorage.removeItem(PERSIST_KEY);
    localStorage.removeItem(LAST_FILE_NAME_KEY);
    setAllowSnapshotSave(true);
    newSessionStartedRef.current = true;
    // Nova sessão invalida qualquer retomada de limpeza anterior
    localStorage.removeItem(CLEANING_RESUME_KEY);
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setErrorMessage('');
    setInitialExtractedText('');
    setExtractedText('');
    setTextWithHeadlines(null);
    setStructuredText(null);
    setFailedChunks([]);
    setProgress(0);
    setTotalPages(0);
  // não reinicia timer (contínuo)
    
    localStorage.removeItem('savedExtractedText');
    localStorage.removeItem('lastSavedTimestamp');
  try { localStorage.setItem(LAST_FILE_NAME_KEY, file.name); } catch {}

    try {
      const pages = await getPdfPageCount(file);
      setTotalPages(pages);

      setProcessingState(ProcessingState.EXTRACTING);
      let rawText = '';
      // Nova regra: para OpenRouter, Docling é obrigatório. Sem fallback para pdf.js.
      if (provider === 'openrouter') {
        // Garante que a detecção foi iniciada (lazy start)
        if (!doclingDetectStarted) {
          await startDoclingDetect();
        } else {
          // Revalida rapidamente se já iniciou
          await retryDoclingDetect();
        }
        setDoclingConnectMessage('Verificando serviço Docling...');
        const healthy = await waitForDoclingHealthy({
          timeoutMs: 30000,
          onAttempt: ({ attempt, ok, elapsedMs, nextDelayMs }) => {
            if (ok) {
              setDoclingConnectMessage('Docling online (' + Math.round(elapsedMs) + ' ms). Iniciando extração...');
            } else {
              setDoclingConnectMessage(`Aguardando Docling ficar online (tentativa ${attempt})...`);
            }
          }
        });
        let shouldCallDocling = healthy;
        if (!healthy) {
          const ep = getDoclingEndpoint();
          const allowFallback = (() => { try { const f = localStorage.getItem('allow_docling_offline_fallback'); return f == null || f === '1'; } catch { return true; } })();
          if (allowFallback) {
            setDoclingConnectMessage(`Docling offline em ${ep}. Usando extração local temporária (pdf.js) enquanto o serviço reinicia...`);
            rawText = await extractTextFromFile(file, setProgress);
            setExtractorSource('pdfjs');
            shouldCallDocling = false; // pular tentativa Docling
          } else {
            setErrorMessage(`Docling indisponível no endpoint ${ep}. Inicie o serviço local de extração (FastAPI) e tente novamente.\nDica: python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008 --reload\nSe estiver usando outra porta/host, ajuste em: Tela de Chaves → Endpoint Docling.`);
            setDoclingConnectMessage('');
            setProcessingState(ProcessingState.ERROR);
            return;
          }
        }
        if (shouldCallDocling) {
          try {
            const controller = new AbortController();
            const mode = processingMode === ProcessingMode.FAST ? 'simple' : 'advanced';
            let selectedMode: 'simple' | 'advanced' = mode === 'advanced' ? 'advanced' : 'simple';
            try {
              const full = await extractWithDoclingFull(file, {
                mode: selectedMode,
                signal: controller.signal,
                onProgress: setProgress,
              });
              rawText = full.text;
              setDoclingMeta(full.meta || null);
              setExtractorSource('docling');
            } catch (err: any) {
              const msg = String(err?.message || err);
              if (selectedMode === 'advanced' && /memory|not enough/i.test(msg)) {
                // fallback para simple
                setDoclingConnectMessage('Memória insuficiente no modo advanced. Tentando novamente em modo simple...');
                selectedMode = 'simple';
                try {
                  const full2 = await extractWithDoclingFull(file, {
                    mode: 'simple',
                    signal: controller.signal,
                    onProgress: setProgress,
                  });
                  rawText = full2.text;
                  setDoclingMeta(full2.meta || null);
                  setExtractorSource('docling');
                } catch (err2: any) {
                  throw err2; // propaga segunda falha
                }
              } else if (/Network error calling Docling service/i.test(msg)) {
                // Rede caiu no meio da extração: fallback local para não abortar fluxo
                setDoclingConnectMessage('Docling perdeu conexão durante a extração. Usando extração local temporária (pdf.js)...');
                rawText = await extractTextFromFile(file, setProgress);
                setExtractorSource('pdfjs');
              } else {
                throw err; // propaga erro original
              }
            }
            setDoclingConnectMessage('');
          } catch (e: any) {
            const ep = getDoclingEndpoint();
            const msg = (e?.message || String(e));
            // Último recurso: fallback local (pdf.js) para não bloquear o usuário
            const allowFallback = (() => { try { const f = localStorage.getItem('allow_docling_offline_fallback'); return f == null || f === '1'; } catch { return true; } })();
            if (allowFallback) {
              console.warn('[Docling][Fallback] Extração falhou:', msg, '→ usando pdf.js');
              setDoclingConnectMessage(`Falha com Docling em ${ep}. Usando extração local temporária (pdf.js).`);
              try {
                rawText = await extractTextFromFile(file, setProgress);
                setExtractorSource('pdfjs');
              } catch (localErr) {
                setErrorMessage(`Falha na extração local após erro Docling: ${String(localErr)}`);
                setDoclingConnectMessage('');
                setProcessingState(ProcessingState.ERROR);
                return;
              }
            } else {
              setErrorMessage(`Falha na extração com Docling (endpoint ${ep}): ${msg}.\nAguarde alguns segundos e tente novamente, ou verifique se o serviço está ativo e o endpoint está correto (Tela de Chaves).`);
              setDoclingConnectMessage('');
              setProcessingState(ProcessingState.ERROR);
              return;
            }
          }
        }
      } else {
        // Provider Gemini mantém extração local via pdf.js
        rawText = await extractTextFromFile(file, setProgress);
        setExtractorSource('pdfjs');
      }
      
      let ocrText = '';
      const OCR_THRESHOLD = 200;
      if (rawText.trim().length < OCR_THRESHOLD) {
        setProcessingState(ProcessingState.OCR);
        setProgress(0);

  const ocrPromise = performOcrUnified(file, incrementApiCalls, processingMode, provider);
        
        let ocrProgress = 0;
        const ocrInterval = setInterval(() => {
          ocrProgress = Math.min(ocrProgress + 5, 95);
          setProgress(ocrProgress);
        }, 400);

        ocrText = await ocrPromise;
        clearInterval(ocrInterval);
        setProgress(100);
      }
      
  const combinedText = (rawText.trim() + '\n\n' + ocrText.trim()).trim();
  setInitialExtractedText(combinedText);
  // Atualiza meta armazenada (garante reload após extração manual)
  try { const stored = localStorage.getItem('last_docling_meta'); if (stored && !doclingMeta) setDoclingMeta(JSON.parse(stored)); } catch {}
      
      const recommendedCount = Math.max(1, Math.ceil(combinedText.length / BASE_CHUNK_SIZE_FOR_RECOMMENDATION));
      setDesiredChunkCount(recommendedCount);

      setProcessingState(ProcessingState.CONFIGURING_CLEANING);

    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred during extraction.";
      setErrorMessage(message);
      setProcessingState(ProcessingState.ERROR);
    } finally {
      extractingRef.current = false;
    }
  }, [resetTimer, incrementApiCalls, processingMode]);

  const handleStartCleaning = useCallback(async (resumeFrom?: CleaningResumeData) => {
    const myToken = cancelTokenRef.current;
    // Retomada válida somente se objeto existe e ainda há chunks pendentes
    const isResume = !!(resumeFrom && typeof resumeFrom.nextIndex === 'number' && resumeFrom.nextIndex < resumeFrom.totalChunks);
    const sessionAtStart = localStorage.getItem('active_session_id') || '';
    if (!initialExtractedText && !isResume) {
      console.warn('[Cleaning] Abort: initialExtractedText vazio.');
      return;
    }
  const providerSnapshot = provider; // congelar provider para esta execução
  console.log('[Cleaning][Start] isResume=%s provider=%s preCleanEnabled=%s initialLen=%d resumeNextIndex=%s', isResume, providerSnapshot, preCleanEnabled, safeLen(initialExtractedText), resumeFrom?.nextIndex ?? 'N/A');

  // timer contínuo: não reiniciado no começo da limpeza
    setFailedChunks([]);
    let localFailedChunks: number[] = isResume ? [...(resumeFrom!.failedChunks || [])] : [];

    try {
      setProcessingState(ProcessingState.CLEANING);
      setStructuringMessage(isResume ? 'Retomando limpeza...' : 'Iniciando limpeza do documento...');
      setResumingCleaning(isResume);
      let baseText = isResume ? resumeFrom!.baseText : initialExtractedText;

      // Pré-limpeza só se provider for openrouter (gemini não precisa)
      if (!isResume && providerSnapshot === 'openrouter') {
        // Validação rápida de chave antes de gastar tempo
        const key = localStorage.getItem('openrouter_api_key');
        if (!key || key.trim().length < 10) {
          setErrorMessage('API Key OpenRouter não configurada ou muito curta. Cole uma chave válida.');
          setProcessingState(ProcessingState.ERROR);
          // timer contínuo não para em erro de pré-limpeza
          return;
        }
        if (preCleanEnabled) {
          setStructuringMessage('Pré-limpeza inicial (OpenRouter)...');
          const preOriginalLen = safeLen(initialExtractedText);
          const cleanedFull = await initialNormalizeWithOpenRouter(initialExtractedText, providerSnapshot, openRouterModel);
            baseText = cleanedFull;
            setPreCleanStats({ original: preOriginalLen, cleaned: safeLen(cleanedFull) });
            try { localStorage.setItem('preclean_len_diag', JSON.stringify({ time: Date.now(), original: preOriginalLen, cleaned: safeLen(cleanedFull) })); } catch {}
        } else {
          console.log('[AI][OpenRouter][Pre] Pré-limpeza desativada pelo usuário. Pulando etapa.');
          setPreCleanStats(null);
        }
      }

      if (!baseText || safeTrim(baseText).length === 0) {
        console.error('[Cleaning] baseText vazio após pré-limpeza. Usando texto original como fallback.');
        // Diagnostic payload para futura análise
        try {
          localStorage.setItem('preclean_empty_baseText_diag', JSON.stringify({
            time: Date.now(),
            provider,
            preCleanEnabled,
            originalLen: safeLen(initialExtractedText),
            baseLen: safeLen(baseText),
          }));
        } catch {}
        baseText = initialExtractedText || resumeFrom?.baseText || '';
        if (!baseText) {
          throw new Error('BaseText vazio após pré-limpeza e fallback indisponível.');
        }
        // Se ainda extremamente curto, informar ao usuário
        if (safeTrim(baseText).replace(/\s+/g,'').length < 40) {
          setErrorMessage('O texto extraído é muito curto ou vazio após análise. Se o PDF for imagem, tente o provider Gemini com OCR, ou verifique se o arquivo possui texto pesquisável.');
          setProcessingState(ProcessingState.ERROR);
          // timer contínuo não para em texto curto
          return;
        }
        console.log('[Cleaning][FallbackUsed] finalBaseLen=%d origLen=%d', safeLen(baseText), safeLen(initialExtractedText));
      }
      const totalChunks = isResume ? resumeFrom!.totalChunks : createChunksByCount(baseText, desiredChunkCount).length;
      const chunks = createChunksByCount(baseText, isResume ? resumeFrom!.desiredChunkCount : desiredChunkCount);
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunking retornou lista vazia.');
      }
      let processedChunks: (string | null)[] = [];
      let startIndex = 0;
      if (isResume) {
        processedChunks = resumeFrom!.processedChunks.slice();
        startIndex = resumeFrom!.nextIndex;
        setProgress(Math.round((startIndex / chunks.length) * 100));
      } else {
        processedChunks = new Array(chunks.length).fill(null);
        // Criar registro inicial de retomada
        saveCleaningResume({
          version: 1,
          stage: 'cleaning',
          baseText,
          desiredChunkCount: desiredChunkCount,
          processedChunks,
          failedChunks: localFailedChunks,
          nextIndex: 0,
          totalChunks: chunks.length,
          provider,
          processingMode,
          preCleanEnabled,
          openRouterModel,
        });
      }

          let abortAll = false;
          for (let i = startIndex; i < chunks.length; i++) {
        const liveSession = localStorage.getItem('active_session_id');
        if (!liveSession) { console.warn('[Cleaning][Session] Abort: session id ausente.'); break; }
        if (liveSession !== sessionAtStart) { console.warn('[Cleaning][Session] Changed mid-loop. Abort remaining processing.'); break; }
        const currentSession = localStorage.getItem('active_session_id');
        if (!currentSession) { console.warn('[Cleaning][Session] Abort: session id ausente.'); break; }
        if (myToken.cancelled) { console.warn('[Cleaning] Cancelado no chunk', i+1); abortAll = true; break; }
        let processedChunk = '';
        let success = false;
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          if (myToken.cancelled) { console.warn('[Cleaning] Cancelado durante tentativa', attempt, 'chunk', i+1); abortAll = true; break; }
          setStructuringMessage(`Limpando pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...` + (isResume ? ' (retomado)' : ''));
          const instructions = buildProviderInstruction(getTaskInstructionsForCleaning(), provider, 'cleaning');
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: 'Cleaning document text. No structural context needed.',
            previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : '',
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
            task_instructions: instructions,
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider: providerSnapshot,
            openRouterModel,
            expectedSessionId: sessionAtStart,
          });
              if (result && result.startsWith('[ERROR OPENROUTER 401]')) {
                setErrorMessage('Falha de autenticação OpenRouter (401). Verifique sua API key em https://openrouter.ai/keys e tente novamente. Processamento abortado sem consumir mais tentativas.');
                setProcessingState(ProcessingState.ERROR);
                abortAll = true;
                success = false;
                break; // break attempts loop
              }
          if (result && nonEmpty(result) && !result.startsWith('[ERROR')) {
            let finalResult = result;
            if (providerSnapshot === 'openrouter' && OPENROUTER_SIMPLIFIED) {
              finalResult = restoreTrailingReferenceNumber(chunks[i], finalResult);
            }
            processedChunk = finalResult;
            success = true;
            break;
          }
          console.warn(`Cleaning chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
          if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(r => setTimeout(r, 1000));
        }
            if (abortAll) {
              break; // outer loop abort
            }
        if (myToken.cancelled) { abortAll = true; break; }
        if (!success) {
          console.error(`Chunk ${i + 1} failed cleaning after ${MAX_CHUNK_ATTEMPTS} attempts. Using original content.`);
          processedChunks[i] = chunks[i];
          localFailedChunks.push(i + 1);
        } else {
          processedChunks[i] = processedChunk;
        }

        // Atualiza estado parcial para mostrar progresso textual opcional
  const partial = processedChunks.filter(c => nonEmpty(c)).join('\n\n');
        setExtractedText(partial);
        setFailedChunks([...localFailedChunks]);
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
        // Salva retomada somente se sessão não mudou
        if (localStorage.getItem('active_session_id') === sessionAtStart) {
          saveCleaningResume({
            version: 1,
            stage: 'cleaning',
            baseText,
              desiredChunkCount: (isResume ? resumeFrom!.desiredChunkCount : desiredChunkCount),
            processedChunks,
            failedChunks: localFailedChunks,
            nextIndex: i + 1,
            totalChunks: chunks.length,
            provider,
            processingMode,
            preCleanEnabled,
            openRouterModel,
          });
        } else {
          console.warn('[Cleaning][Resume] Skip save: session changed.');
        }
      }

          if (!abortAll && !myToken.cancelled) {
            const cleanedText = processedChunks.map(c => c || '').join('\n\n');
            setExtractedText(cleanedText);
            setFailedChunks(localFailedChunks);
            setProcessingState(ProcessingState.SUCCESS);
            clearCleaningResume();
          }
          setResumingCleaning(false);
  // timer contínuo não para ao finalizar limpeza
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during processing.';
      setErrorMessage(message);
      setProcessingState(ProcessingState.ERROR);
      setResumingCleaning(false);
  // timer contínuo não para em erro de limpeza
      try {
        localStorage.setItem('last_processing_error', JSON.stringify({ message, stack: (error as any)?.stack, time: Date.now() }));
      } catch {}
    }
  }, [initialExtractedText, desiredChunkCount, resetTimer, startTimer, stopTimer, incrementApiCalls, processingMode, provider, openRouterModel, preCleanEnabled, saveCleaningResume, clearCleaningResume]);

  // Tentar retomada automática de limpeza (mantido para compatibilidade se resume for gravado após load)
  useEffect(() => {
    if (newSessionStartedRef.current) return; // nova sessão manual ignora retomada
    try {
      const raw = localStorage.getItem(CLEANING_RESUME_KEY);
      if (!raw) return;
      const resume: CleaningResumeData = JSON.parse(raw);
      if (resume.version !== 1 || resume.stage !== 'cleaning') return;
      if (resume.nextIndex >= resume.totalChunks) { clearCleaningResume(); return; }
      if (resume.provider !== provider || resume.processingMode !== processingMode) {
        console.warn('[Resume][Cleaning] Provedores ou modo divergente. Ignorando retomada.');
        return;
      }
      // Em vez de retomar automaticamente, exibir prompt
      setResumeCandidate(resume);
      setShowResumePrompt(true);
    } catch (e) {
      console.warn('Falha ao preparar retomada:', e);
    }
  }, [provider, processingMode, clearCleaningResume]);

  const confirmResume = useCallback(() => {
    if (resumeCandidate) {
      handleStartCleaning(resumeCandidate);
    }
    setShowResumePrompt(false);
  }, [resumeCandidate, handleStartCleaning]);

  const discardResume = useCallback(() => {
    clearCleaningResume();
    setResumeCandidate(null);
    setShowResumePrompt(false);
  }, [clearCleaningResume]);
  
  const handleConfigureHeadlines = useCallback(() => {
    const textToProcess = localStorage.getItem('savedExtractedText') || extractedText;
    if (!textToProcess) return;
    const recommendedCount = Math.max(1, Math.ceil(textToProcess.length / BASE_CHUNK_SIZE_FOR_RECOMMENDATION));
    setDesiredChunkCount(recommendedCount);
    setProcessingState(ProcessingState.CONFIGURING_HEADLINES);
  }, [extractedText]);

  const handleStartHeadlineTagging = useCallback(async () => {
    const textToProcess = localStorage.getItem('savedExtractedText') || extractedText;
    if (!textToProcess) return;
    const myToken = cancelTokenRef.current;
    const sessionAtStart = localStorage.getItem('active_session_id') || '';
  // timer contínuo - não iniciar
    setStructuredText(null);
    setTextWithHeadlines(null);
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    
    setProcessingState(ProcessingState.STRUCTURING_HEADLINES);
    try {
      const chunks = createChunksByCount(textToProcess, desiredChunkCount);
      const processedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const liveSession = localStorage.getItem('active_session_id');
        if (!liveSession) { console.warn('[Headlines][Session] Abort: session id ausente.'); break; }
        if (liveSession !== sessionAtStart) { console.warn('[Headlines][Session] Changed mid-loop. Abort.'); break; }
        if (myToken.cancelled) { console.warn('[Headlines] Cancelado chunk', i+1); break; }
        let success = false;
        let processedChunk = '';
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          if (myToken.cancelled) { console.warn('[Headlines] Cancelado durante tentativa', attempt, 'chunk', i+1); break; }
          setStructuringMessage(`Etapa 1: Marcando headlines no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
          let step1Instructions = buildProviderInstruction(getTaskInstructionsForStep1_Headlines(), provider, 'headlines');
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: "Currently tagging headlines.",
            previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : "",
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : "",
            task_instructions: step1Instructions,
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider,
            openRouterModel,
            expectedSessionId: sessionAtStart,
          });
          if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) {
            let finalResult = result;
            if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
              finalResult = restoreTrailingReferenceNumber(chunks[i], finalResult);
              // Reforço automático: se não houve nenhuma tag mas existem padrões fortes de headline, uma tentativa extra com reforço
              const hasHeadlineTags = /\{\{level\d+}}/.test(finalResult);
              const headlinePattern = /(\bCHAPTER\b|\bARTICLE\b|\bSECTION\b|\bCAP[IÍ]TULO\b|\bARTIGO\b|^Art\.\s*\d|^Article\s+\d)/m;
              if (!hasHeadlineTags && headlinePattern.test(chunks[i])) {
                console.warn(`[OpenRouter][Reinforcement] Chunk ${i+1} sem tags apesar de padrão. Executando reforço.`);
                const reinforcedInstructions = buildProviderInstruction(step1Instructions + '\n\nREFORÇO CRÍTICO: Você deve OBRIGATORIAMENTE envolver títulos detectáveis (CHAPTER / ARTICLE / SECTION / CAPÍTULO / ARTIGO / Art. N) com {{levelX}} mantendo o texto idêntico. NÃO devolver bloco cru se houver padrão.', provider, 'headlines');
                const retry = await processDocumentChunkUnified({
                  main_chunk_content: chunks[i],
                  continuous_context_summary: 'Reinforcement pass due to missing headline tags.',
                  previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : '',
                  next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
                  task_instructions: reinforcedInstructions,
                  onApiCall: incrementApiCalls,
                  mode: processingMode,
                  provider,
                  openRouterModel,
                  expectedSessionId: sessionAtStart,
                });
                if (retry && !retry.startsWith('[ERROR') && /\{\{level\d+}}/.test(retry)) {
                  finalResult = restoreTrailingReferenceNumber(chunks[i], retry);
                }
              }
            }
            processedChunk = finalResult;
            success = true;
            break;
          }
          console.warn(`Headline tagging for chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
          if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(res => setTimeout(res, 1000));
        }

        if (myToken.cancelled) { break; }
        if (!success) {
          console.error(`Chunk ${i + 1} failed headline tagging after ${MAX_CHUNK_ATTEMPTS} attempts. Using original content.`);
          processedChunks.push(chunks[i]);
          localFailedChunks.push(i + 1);
        } else {
          processedChunks.push(processedChunk);
        }
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

  const rawJoinedText = processedChunks.join('\n\n');
  lastHeadlinesDedupedRef.current = rawJoinedText;
      
      // Post-processing step to merge headlines split across chunks.
      // This regex looks for a closing level tag, followed by newlines, 
      // followed by an opening tag of the exact same level, 
      // and replaces the tags in the middle with a single space.
      // e.g., "{{-level1}}\n{{level1}}" becomes " ".
      const mergeRegex = /({{-level(\d+)}})\s*\n+\s*({{level\2}})/g;
      const mergedText = rawJoinedText.replace(mergeRegex, ' ');

  // Pós-processamento: remover duplicação de títulos caso modelo tenha repetido
  const deduped = dedupeHeadlines(mergedText);
  lastHeadlinesDedupedRef.current = deduped;
  setTextWithHeadlines(deduped);
      try { const summary = analyzeHeadlines(deduped); recordIntegrity(summary); } catch (e) { console.warn('[Integrity][Headlines] Falha registrar', e); }
      setFailedChunks(localFailedChunks);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred.";
      setTextWithHeadlines(`Error: ${message}`);
    } finally {
      if (!myToken.cancelled) setProcessingState(ProcessingState.SUCCESS); else console.warn('[Headlines] Cancelamento finalizado antes de SUCCESS');
  // timer contínuo não para ao finalizar headlines
    }
  }, [extractedText, desiredChunkCount, startTimer, stopTimer, incrementApiCalls, processingMode, provider]);

  const handleStartFootnoteTagging = useCallback(async () => {
    const textToProcess = localStorage.getItem('savedExtractedText') || textWithHeadlines || extractedText;
    if (!textToProcess) return;
    const myToken = cancelTokenRef.current;
    const sessionAtStart = localStorage.getItem('active_session_id') || '';
  // timer contínuo - não iniciar
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    setProcessingState(ProcessingState.STRUCTURING_FOOTNOTES);
    try {
      const chunks = createChunksByCount(textToProcess, desiredChunkCount);
      const processedChunks: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const liveSession = localStorage.getItem('active_session_id');
        if (!liveSession) { console.warn('[Footnotes][Session] Abort: session id ausente.'); break; }
        if (liveSession !== sessionAtStart) { console.warn('[Footnotes][Session] Changed mid-loop. Abort.'); break; }
        if (myToken.cancelled) { console.warn('[Footnotes] Cancelado chunk', i+1); break; }
        let success = false;
        let processedChunk = '';
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          if (myToken.cancelled) { console.warn('[Footnotes] Cancelado durante tentativa', attempt, 'chunk', i+1); break; }
          setStructuringMessage(`Etapa Footnotes: Marcando notas no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: 'Tagging footnote references and footnote content lines only.',
            previous_chunk_overlap: i > 0 ? chunks[i-1].slice(-OVERLAP_CONTEXT_SIZE) : '',
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i+1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
            task_instructions: buildProviderInstruction(getTaskInstructionsForFootnotesMarkers(), provider, 'footnotes_markers'),
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider,
            openRouterModel,
            expectedSessionId: sessionAtStart,
          });
          if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) {
            let finalResult = result.trim();
            const hasAnyTag = /\{\{footnote(number)?\d+}}/i.test(finalResult);
            // Se modelo devolveu quase vazio ou sem tags mas claramente há padrões de footnote no chunk, reforçar.
            const maybeHasFootPattern = /^(\s*\d{1,3}[).:\-]\s+.{4,})/m.test(chunks[i]) || /\b\d{1,3}\b/.test(chunks[i]);
            if (!hasAnyTag && maybeHasFootPattern && attempt === 1) {
              // Reforço explícito
              const reinforcement = buildProviderInstruction(getTaskInstructionsForFootnotesMarkers() + '\n\nREFORÇO CRÍTICO: Você detectou números candidatos mas NÃO aplicou tags. Aplique as tags {{footnotenumberN}} e {{footnoteN}} conforme regras. NÃO devolva em branco.', provider, 'footnotes_markers');
              const retry = await processDocumentChunkUnified({
                main_chunk_content: chunks[i],
                continuous_context_summary: 'Reinforcement pass for missing footnote tags.',
                previous_chunk_overlap: i > 0 ? chunks[i-1].slice(-OVERLAP_CONTEXT_SIZE) : '',
                next_chunk_overlap: i < chunks.length - 1 ? chunks[i+1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
                task_instructions: reinforcement,
                onApiCall: incrementApiCalls,
                mode: processingMode,
                provider,
                openRouterModel,
                expectedSessionId: sessionAtStart,
              });
              if (retry && retry.trim().length > 0 && !retry.startsWith('[ERROR')) {
                const retryTrim = retry.trim();
                if (/\{\{footnote(number)?\d+}}/i.test(retryTrim)) {
                  finalResult = retryTrim;
                }
              }
            }
            // fallback se saída ficou vazia após reforço
            if (finalResult.length === 0) {
              finalResult = chunks[i];
            }
            processedChunk = finalResult;
            success = true;
            break;
          }
          console.warn(`Footnote tagging for chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
          if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(res => setTimeout(res, 1000));
        }
        if (myToken.cancelled) { break; }
        if (!success) { processedChunks.push(chunks[i]); localFailedChunks.push(i+1); } else { processedChunks.push(processedChunk); }
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }
  const joined = processedChunks.join('\n\n');
  if (textWithHeadlines) setTextWithHeadlines(joined); else setExtractedText(joined);
  try { const summary = analyzeFootnotes(joined); recordIntegrity(summary); } catch (e) { console.warn('[Integrity][Footnotes] Falha registrar', e); }
  setMarkerStageText(joined); // guardar versão com markers antes de headlines
      setFailedChunks(localFailedChunks);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'An error occurred.';
      if (textWithHeadlines) setTextWithHeadlines(`Error: ${msg}`); else setExtractedText(`Error: ${msg}`);
    } finally {
      if (!myToken.cancelled) {
        setFootnotesProcessed(true);
        setProcessingState(ProcessingState.SUCCESS);
      } else {
        console.warn('[Footnotes] Cancelamento finalizado antes de SUCCESS');
      }
  // timer contínuo não para ao finalizar footnotes
    }
  }, [textWithHeadlines, extractedText, desiredChunkCount, startTimer, stopTimer, incrementApiCalls, processingMode, provider]);

  const handleConfigureContent = useCallback(() => {
    const textToProcess = localStorage.getItem('savedExtractedText') || textWithHeadlines;
    if (!textToProcess) return;
    const recommendedCount = Math.max(1, Math.ceil(textToProcess.length / BASE_CHUNK_SIZE_FOR_RECOMMENDATION));
    setDesiredChunkCount(recommendedCount);
    setProcessingState(ProcessingState.CONFIGURING_CONTENT);
  }, [textWithHeadlines]);

  const handleStartContentTagging = useCallback(async () => {
    const textToProcess = localStorage.getItem('savedExtractedText') || textWithHeadlines;
    if (!textToProcess) return;
    const myToken = cancelTokenRef.current;
    const sessionAtStart = localStorage.getItem('active_session_id') || '';
  // timer contínuo - não iniciar
    setStructuredText(null);
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    
    setProcessingState(ProcessingState.STRUCTURING_CONTENT);
    try {
        const chunks = createChunksByCount(textToProcess, desiredChunkCount);
        const processedChunks: string[] = [];
        let continuous_context_summary = "No context yet.";

    for (let i = 0; i < chunks.length; i++) {
      const liveSession = localStorage.getItem('active_session_id');
      if (!liveSession) { console.warn('[Content][Session] Abort: session id ausente.'); break; }
      if (liveSession !== sessionAtStart) { console.warn('[Content][Session] Changed mid-loop. Abort.'); break; }
      if (myToken.cancelled) { console.warn('[Content] Cancelado chunk', i+1); break; }
            let success = false;
            let processedChunk = '';
            for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
        if (myToken.cancelled) { console.warn('[Content] Cancelado durante tentativa', attempt, 'chunk', i+1); break; }
                setStructuringMessage(`Etapa 2: Marcando conteúdo no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
                let step2Instructions = buildProviderInstruction(getTaskInstructionsForStep2_Content(), provider, 'content');
                const result = await processDocumentChunkUnified({
                    main_chunk_content: chunks[i],
                    continuous_context_summary,
                    previous_chunk_overlap: i > 0 ? chunks[i-1].slice(-OVERLAP_CONTEXT_SIZE) : "",
                    next_chunk_overlap: i < chunks.length - 1 ? chunks[i+1].slice(0, OVERLAP_CONTEXT_SIZE) : "",
                    task_instructions: step2Instructions,
                    onApiCall: incrementApiCalls,
                    mode: processingMode,
                    provider,
                    openRouterModel,
                    expectedSessionId: sessionAtStart,
                });
                if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) {
                  let finalResult = result;
                  if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
                    finalResult = restoreTrailingReferenceNumber(chunks[i], finalResult);
                  }
                  // Fallback de segurança: se saída muito reduzida sem adicionar nenhuma tag estrutural nova
                  const inLen = chunks[i].length;
                  const outLen = finalResult.length;
                  const ratio = outLen / Math.max(1, inLen);
                  const hasAnyStructuralTag = /\{\{level\d+}}|\{\{footnote(number)?\d+}}/i.test(finalResult);
                  if (!hasAnyStructuralTag && inLen > 200 && ratio < 0.6) {
                    console.warn('[Content][FallbackLength] Output reduzido demais sem tags. Revertendo chunk %d ratio=%s', i+1, ratio.toFixed(2));
                    finalResult = chunks[i];
                  }
                  processedChunk = finalResult;
                  success = true;
                  break;
                }
                console.warn(`Content tagging for chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
                if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(res => setTimeout(res, 1000));
            }

      if (myToken.cancelled) { break; }
      if (!success) {
                console.error(`Chunk ${i + 1} failed content tagging after ${MAX_CHUNK_ATTEMPTS} attempts. Using original content.`);
                processedChunks.push(chunks[i]);
                localFailedChunks.push(i + 1);
            } else {
                processedChunks.push(processedChunk);
                const headlinesInChunk = processedChunk.match(/{{level[0-2]}}.*?{{-level[0-2]}}/g);
                if (headlinesInChunk && headlinesInChunk.length > 0) {
                    continuous_context_summary = `Last headline found: ${headlinesInChunk[headlinesInChunk.length - 1]}`;
                }
            }
            setProgress(Math.round(((i + 1) / chunks.length) * 100));
        }

    if (!myToken.cancelled) {
      const structured = processedChunks.join('\n\n');
      setStructuredText(structured);
      try { const summary = analyzeContent(structured); recordIntegrity(summary); } catch (e) { console.warn('[Integrity][Content] Falha registrar', e); }
      setFailedChunks(localFailedChunks);
    }
    } catch (error) {
        const message = error instanceof Error ? error.message : "An error occurred.";
        setStructuredText(`Error: ${message}`);
    } finally {
    if (!myToken.cancelled) setProcessingState(ProcessingState.SUCCESS); else console.warn('[Content] Cancelamento finalizado antes de SUCCESS');
  // timer contínuo não para ao finalizar content tagging
    }
  }, [textWithHeadlines, desiredChunkCount, startTimer, stopTimer, incrementApiCalls, processingMode]);

  const handleDownload = useCallback((format: DownloadFormat, contentOverride?: string) => {
    let content = '';
    const mimeType = 'text/plain';
    const fileExtension = 'txt';
    const baseFileName = (selectedFile?.name || selectedFileName || 'document').replace(/\.pdf$/i, '');
    let finalFileName = baseFileName;

    switch (format) {
      case DownloadFormat.CLEANED_TEXT:
        content = contentOverride ?? extractedText;
        finalFileName = `${baseFileName}_edited`;
        break;
      case DownloadFormat.HEADLINES_ONLY:
        content = textWithHeadlines ?? '';
        finalFileName = `${baseFileName}_headlines`;
        break;
      case DownloadFormat.FULLY_STRUCTURED:
        content = structuredText ?? '';
        finalFileName = `${baseFileName}_structured`;
        break;
      case DownloadFormat.MARKER_STAGE:
        content = markerStageText ?? '';
        finalFileName = `${baseFileName}_markers`;
        break;
    }

    if (!content.trim()) {
        console.warn(`Attempted to download empty content for format: ${format}`);
        return;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${finalFileName}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  }, [extractedText, textWithHeadlines, structuredText, selectedFile, selectedFileName, markerStageText]);
  
  const handleCancelConfiguration = useCallback(() => {
    setProcessingState(ProcessingState.SUCCESS);
  }, []);

  const renderContent = () => {
    if (showApiKeyScreen) {
      return <ApiKeyScreen onSave={handleApiKeySave} />;
    }
    switch (processingState) {
      case ProcessingState.IDLE:
        return (
          <div className="space-y-4">
            <FileUpload onFileSelect={handleFileSelect} disabled={false} />
            {provider === 'openrouter' && (
              <div className="w-full max-w-2xl mx-auto p-4 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${doclingOnline===true ? 'bg-green-400' : doclingOnline===false ? 'bg-red-400' : 'bg-gray-500 animate-pulse'}`}></span>
                    <span className="font-medium">Docling:</span>
                    <span>
                      {doclingOnline===true && 'Online'}
                      {doclingOnline===false && 'Offline'}
                      {doclingOnline===null && 'Verificando...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`${getDoclingEndpoint()}/health`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600"
                    >Abrir /health</a>
                    <button onClick={checkDocling} className="px-3 py-1.5 text-xs rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600">Verificar</button>
                    {doclingOnline===false && (
                      <button onClick={checkDocling} className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500">Detectar</button>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 break-all">
                  Endpoint: <span className="text-gray-300">{getDoclingEndpoint()}</span>
                </div>
                {doclingLatencyMs != null && (
                  <div className="mt-1 text-[11px] text-gray-500">Latência: ~{doclingLatencyMs} ms</div>
                )}
                {doclingLastCheck != null && (
                  <div className="mt-1 text-[11px] text-gray-500">Última verificação: {new Date(doclingLastCheck).toLocaleTimeString()}</div>
                )}
                {doclingOnline===false && (
                  <p className="mt-2 text-xs text-red-300">Inicie o serviço Docling local e tente novamente. Dica: python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008 --reload</p>
                )}
              </div>
            )}
          </div>
        );
      case ProcessingState.EXTRACTING:
      case ProcessingState.OCR:
        return <ProcessingIndicator state={processingState} progress={progress} totalPages={totalPages} />;
      
      case ProcessingState.CONFIGURING_CLEANING: {
        const maxChunks = Math.max(desiredChunkCount * 2, 20);
        return (
            <ConfigurationScreen 
                title="Configurar Limpeza"
                description="Escolha em quantos pedaços o documento será dividido para a limpeza inicial com IA. Menos é mais rápido, mais pode ser mais preciso."
                value={desiredChunkCount}
                onValueChange={setDesiredChunkCount}
                onConfirm={handleStartCleaning}
                onCancel={handleReset}
                max={maxChunks}
            >
              {provider === 'openrouter' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-200">Pré-limpeza global</p>
                      <p className="text-xs text-gray-400 max-w-sm">Executa uma passagem única no texto completo para remover ruído repetitivo antes do chunking.</p>
              {/* Painel de meta Docling */}
              {(provider === 'openrouter' || doclingMeta || doclingConnectMessage) && (
                <div className="w-full max-w-4xl mb-6">
                  <DoclingMetaPanel meta={doclingMeta} connectMessage={doclingConnectMessage} />
                </div>
              )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreCleanEnabled(prev => { const next = !prev; localStorage.setItem('preclean_enabled', String(next)); return next; })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${preCleanEnabled ? 'bg-teal-600' : 'bg-gray-600'}`}
                      aria-pressed={preCleanEnabled}
                      aria-label="Alternar pré-limpeza"
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${preCleanEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">Recomendado quando o PDF tem cabeçalhos/rodapés repetidos ou numeração espalhada. Pode consumir 1 chamada adicional de API.</p>
                </div>
              )}
            </ConfigurationScreen>
        );
      }
      
      case ProcessingState.CONFIGURING_HEADLINES: {
        const maxChunks = Math.max(desiredChunkCount * 2, 20);
        return (
            <ConfigurationScreen 
                title="Configurar Etapa 1: Headlines"
                description="Escolha a granularidade para a IA marcar os títulos e notas de rodapé do documento."
                value={desiredChunkCount}
                onValueChange={setDesiredChunkCount}
                onConfirm={handleStartHeadlineTagging}
                onCancel={handleCancelConfiguration}
                max={maxChunks}
            />
        );
      }

      case ProcessingState.CONFIGURING_FOOTNOTES: {
        const maxChunks = Math.max(desiredChunkCount * 2, 20);
        return (
          <ConfigurationScreen
            title="Configurar Etapa Footnotes"
            description="Escolha a granularidade para marcar referências e conteúdo de notas de rodapé (OpenRouter)."
            value={desiredChunkCount}
            onValueChange={setDesiredChunkCount}
            onConfirm={handleStartFootnoteTagging}
            onCancel={handleCancelConfiguration}
            max={maxChunks}
          />
        );
      }

      case ProcessingState.CONFIGURING_CONTENT: {
        const maxChunks = Math.max(desiredChunkCount * 2, 20);
        return (
            <ConfigurationScreen 
                title="Configurar Etapa 2: Conteúdo"
                description="Agora, escolha a granularidade para a IA estruturar o corpo do texto dentro dos títulos já marcados."
                value={desiredChunkCount}
                onValueChange={setDesiredChunkCount}
                onConfirm={handleStartContentTagging}
                onCancel={handleCancelConfiguration}
                max={maxChunks}
            />
        );
      }
      
      case ProcessingState.CLEANING:
      case ProcessingState.STRUCTURING_HEADLINES:
  case ProcessingState.STRUCTURING_FOOTNOTES:
      case ProcessingState.STRUCTURING_CONTENT:
         // A more generic indicator is needed as these states don't track page numbers
         return <ProcessingIndicator state={ProcessingState.CLEANING} progress={progress} />;

      case ProcessingState.SUCCESS:
        return (selectedFile || selectedFileName) && (
          <ResultViewer
            fileName={selectedFile?.name || selectedFileName || 'document.txt'}
            extractedText={extractedText}
            textWithHeadlines={textWithHeadlines}
            structuredText={structuredText}
             markerStageText={markerStageText}
            provider={provider}
            footnotesProcessed={footnotesProcessed}
            onConfigureFootnotes={() => {
              const textToProcess = localStorage.getItem('savedExtractedText') || extractedText;
              if (!textToProcess) return;
              const recommendedCount = Math.max(1, Math.ceil(textToProcess.length / BASE_CHUNK_SIZE_FOR_RECOMMENDATION));
              setDesiredChunkCount(recommendedCount);
              // Processar direto (pular tela de configuração) – fluxo simplificado
              handleStartFootnoteTagging();
            }}
            processingState={processingState}
            progress={progress}
            structuringMessage={structuringMessage}
            onDownload={handleDownload}
            onConfigureHeadlines={() => {
              // Modo simplificado: vai direto para headlines
              handleConfigureHeadlines();
            }}
            onConfigureContent={handleConfigureContent}
            onReset={() => handleReset(false)}
            failedChunks={failedChunks}
            extraBanner={preCleanStats && provider === 'openrouter' ? (
              <div className="mt-4 p-3 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300">
                <p className="font-semibold text-teal-300">Pré-limpeza (OpenRouter)</p>
                <p>
                  Tamanho original: <span className="text-gray-200">{preCleanStats.original.toLocaleString()}</span> chars · Após pré-limpeza: <span className="text-gray-200">{preCleanStats.cleaned.toLocaleString()}</span> chars
                </p>
                <p>
                  Redução: {preCleanStats.original > 0 ? (((preCleanStats.original - preCleanStats.cleaned) / preCleanStats.original) * 100).toFixed(2) : '0.00'}%
                </p>
              </div>
            ) : undefined}
          />
        );
      case ProcessingState.ERROR:
        return (
          <div className="text-center p-8 bg-red-900/20 border border-red-500 rounded-xl max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-red-400">Processing Failed</h2>
            <p className="text-red-300 mt-2 mb-4">{errorMessage}</p>
            <button
              onClick={() => handleReset(false)}
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const showTracker = processingState !== ProcessingState.IDLE && 
                      processingState !== ProcessingState.ERROR &&
                      !processingState.startsWith('CONFIGURING');

  const modeButtonClasses = (isActive: boolean) =>
    `px-4 py-2 text-sm font-medium transition-colors duration-200 focus:z-10 focus:ring-2 focus:ring-teal-500 ${
        isActive
        ? 'bg-teal-600 text-white hover:bg-teal-500'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
    }`;


  return (
    <>
      <ExtractionBanner source={extractorSource} className="fixed top-0 left-0 right-0 z-50" />
      {showResumePrompt && resumeCandidate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 p-6 bg-gray-800/95 rounded-lg shadow-2xl border border-gray-700 space-y-5 animate-fade-in">
            <h3 className="text-xl font-semibold text-teal-300">Retomar processamento anterior?</h3>
            <div className="text-sm text-gray-300 space-y-3 leading-relaxed">
              <p>Existe uma sessão interrompida de limpeza em andamento.</p>
              <p>
                Próximo pedaço: <span className="font-semibold text-indigo-300">{resumeCandidate.nextIndex + 1}</span> / {resumeCandidate.totalChunks}<br/>
                Provider: <code className="text-xs text-gray-400">{resumeCandidate.provider}</code> | Modo: <code className="text-xs text-gray-400">{resumeCandidate.processingMode}</code>
              </p>
              <p className="text-xs text-gray-400">Se você clicar em Retomar, o processo continua de onde parou. Em Descartar, os dados parciais são apagados.</p>
            </div>
            <div className="flex gap-4 pt-2">
              <button onClick={discardResume} className="flex-1 px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium">Descartar</button>
              <button onClick={confirmResume} className="flex-1 px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-sm font-semibold">Retomar</button>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans"
        style={{ paddingTop: extractorSource ? '3rem' : undefined }}>
        <PerformanceTracker 
            elapsedTime={elapsedTime} 
            apiCalls={apiCalls}
            isVisible={showTracker}
        />
        <header className="text-center mb-10 w-full max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-indigo-500">
                    PDF OCR v2.0
                </h1>
                <p className="mt-3 max-w-2xl mx-auto text-lg text-gray-400">
                    Local, privacy-first PDF extraction with robust AI-powered structuring.
                </p>
              </div>
              {!showApiKeyScreen && processingState === ProcessingState.IDLE && (
                <div className="flex flex-col items-end gap-2 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (provider === 'gemini') return;
                        const key = localStorage.getItem('gemini_api_key') || '';
                        if (!key) {
                          setProvider('gemini');
                          setApiKey('');
                          setMissingKey('gemini');
                          // Não abre tela automaticamente; usuário deve clicar em Editar
                          return;
                        }
                        setProvider('gemini'); setApiKey(key); setMissingKey(null); try { configureProviderApiKey('gemini', key); localStorage.setItem('ai_provider', 'gemini'); } catch {}
                      }}
                      className={`px-4 py-2 rounded-md text-xs font-semibold tracking-wide border transition-colors ${provider==='gemini' ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                    >Gemini</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (provider === 'openrouter') return;
                        const key = localStorage.getItem('openrouter_api_key') || '';
                        if (!key) {
                          setProvider('openrouter');
                          setApiKey('');
                          setMissingKey('openrouter');
                          return;
                        }
                        setProvider('openrouter'); setApiKey(key); setMissingKey(null); try { configureProviderApiKey('openrouter', key); localStorage.setItem('ai_provider', 'openrouter'); } catch {}
                      }}
                      className={`px-4 py-2 rounded-md text-xs font-semibold tracking-wide border transition-colors ${provider==='openrouter' ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                    >OpenRouter</button>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyScreen(true)}
                      className="px-4 py-2 rounded-md text-xs font-semibold tracking-wide border bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
                    >Editar</button>
                  </div>
                  <div className="text-[11px] text-gray-400 flex flex-col items-end leading-tight">
                    <span>Provider ativo: <strong className={provider==='gemini' ? 'text-teal-300' : 'text-indigo-300'}>{provider}</strong></span>
                    {provider==='openrouter' && (
                      <span>Modelo: <code className="text-indigo-300">{openRouterModel}</code></span>
                    )}
                    {missingKey && (
                      <span className="mt-1 text-[10px] text-red-400 flex items-center gap-1">
                        Chave {missingKey === 'gemini' ? 'Gemini' : 'OpenRouter'} não configurada. Clique em Editar.
                      </span>
                    )}
                  </div>
                </div>
              )}
              {/* Botão Cancelar aparece após iniciar (qualquer estado diferente de IDLE/ERROR e não mostrando tela API) */}
              {!showApiKeyScreen && processingState !== ProcessingState.IDLE && processingState !== ProcessingState.ERROR && (
                <div className="flex flex-col items-end gap-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => handleReset(false)}
                    className="px-4 py-2 rounded-md text-xs font-semibold tracking-wide border bg-red-700/80 hover:bg-red-600 border-red-600 text-white shadow"
                  >Cancelar e Voltar</button>
                  <div className="text-[10px] text-gray-500">Descarta processamento atual</div>
                </div>
              )}
            </div>
            {!showApiKeyScreen && processingState === ProcessingState.IDLE && (
              <div className="mt-6 animate-fade-in">
                  <label className="text-sm text-gray-400 block mb-2">Modo de Processamento IA</label>
                  <div className="inline-flex rounded-md shadow-sm" role="group">
                      <button 
                        type="button" 
                        onClick={() => setProcessingMode(ProcessingMode.FAST)}
                        className={`${modeButtonClasses(processingMode === ProcessingMode.FAST)} rounded-l-lg`}
                      >
                          Rápido e Econômico
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setProcessingMode(ProcessingMode.QUALITY)}
                        className={`${modeButtonClasses(processingMode === ProcessingMode.QUALITY)} rounded-r-lg`}
                      >
                          Alta Qualidade
                      </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
                      {processingMode === ProcessingMode.FAST 
                          ? 'Ideal para documentos simples. Processamento mais rápido e menor custo de API.' 
                          : 'Recomendado para documentos complexos. Usa mais recursos da IA (Thinking) para melhores resultados.'}
                  </p>
              </div>
            )}
        </header>
        <main className="w-full flex-grow flex items-center justify-center">
            {renderContent()}
        </main>
        <footer className="text-center mt-10 text-sm text-gray-600">
            <p>All processing is local; no data is sent to external servers for extraction.</p>
            <p>
              {provider === 'gemini' && 'AI text structuring uses the Gemini API.'}
              {provider === 'openrouter' && `AI text structuring via OpenRouter (${openRouterModel}) com instruções base Gemini adaptadas.`}
            </p>
        </footer>
      </div>
    </>
  );
}