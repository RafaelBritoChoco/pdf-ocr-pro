import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import { ResultViewer } from './components/ResultViewer';
import { PerformanceTracker } from './components/PerformanceTracker';
import { ConfigurationScreen } from './components/ConfigurationScreen';
import { usePerformanceTracker } from './hooks/usePerformanceTracker';
import { ProcessingState, DownloadFormat, ProcessingMode } from './types';
import { extractTextFromFile, getPdfPageCount } from './services/pdfExtractor';
import { createChunksByCount } from './services/chunkingService';
import { 
  getTaskInstructionsForCleaning,
  getTaskInstructionsForStep1_Headlines,
  getTaskInstructionsForStep2_Content,
  getTaskInstructionsForFootnotes,
  getTaskInstructionsForFootnotesMarkers,
} from './services/geminiService';
import { processDocumentChunkUnified, performOcrUnified, configureProviderApiKey, Provider, initialNormalizeWithOpenRouter } from './services/aiService';
import { ApiKeyScreen } from './components/ApiKeyScreen';
// Util: remove duplicação onde um título aparece em linha isolada e logo abaixo a versão taggeada
function dedupeHeadlines(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i+1];
    // Detecta se a próxima linha é a mesma porém envolvida em {{levelX}}...{{-levelX}}
    const tagMatch = next?.match(/^\s*\{\{level(\d+)}}(.*)\{\{-level\1}}\s*$/);
    if (tagMatch) {
      const inside = tagMatch[2].trim();
      if (inside === line.trim()) {
        // pular linha duplicada e manter apenas taggeada
        out.push(next);
        i++; // skip next since already consumed
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

const BASE_CHUNK_SIZE_FOR_RECOMMENDATION = 32000;
const OVERLAP_CONTEXT_SIZE = 400; // Characters for context overlap
const MAX_CHUNK_ATTEMPTS = 3; // Max retries for a failed chunk
// Flag para simplificar OpenRouter e deixá-lo igual ao fluxo Gemini (sem pré-processamentos agressivos)
const OPENROUTER_SIMPLIFIED = true;

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
  const [initialExtractedText, setInitialExtractedText] = useState<string>('');
  const [extractedText, setExtractedText] = useState<string>('');
  const [textWithHeadlines, setTextWithHeadlines] = useState<string | null>(null);
  const [structuredText, setStructuredText] = useState<string | null>(null);
  const [markerStageText, setMarkerStageText] = useState<string | null>(null); // snapshot após footnotes markers
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [structuringMessage, setStructuringMessage] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(0);
  const [desiredChunkCount, setDesiredChunkCount] = useState<number>(1);
  const [failedChunks, setFailedChunks] = useState<number[]>([]);
  const [apiKey, setApiKey] = useState<string>(() => (localStorage.getItem('ai_provider') === 'openrouter' ? (localStorage.getItem('openrouter_api_key') || '') : (localStorage.getItem('gemini_api_key') || '')));
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('ai_provider') as Provider) || 'gemini');
  const [qwenModel, setQwenModel] = useState<string>(() => localStorage.getItem('qwen_model') || 'qwen/qwen-2.5-7b-instruct');
  const [showApiKeyScreen, setShowApiKeyScreen] = useState<boolean>(() => !localStorage.getItem('gemini_api_key') && !localStorage.getItem('openrouter_api_key'));
  const [preCleanEnabled, setPreCleanEnabled] = useState<boolean>(() => localStorage.getItem('preclean_enabled') === 'true');
  const [preCleanStats, setPreCleanStats] = useState<{original: number; cleaned: number} | null>(null);
  const lastHeadlinesDedupedRef = useRef<string>('');
  const [footnotesProcessed, setFootnotesProcessed] = useState<boolean>(false);

  const {
    elapsedTime,
    apiCalls,
    startTimer,
    stopTimer,
    resetTimer,
    incrementApiCalls,
  } = usePerformanceTracker();

  const handleReset = useCallback(() => {
    setProcessingState(ProcessingState.IDLE);
    setSelectedFile(null);
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
    resetTimer();
    
    localStorage.removeItem('savedExtractedText');
    localStorage.removeItem('lastSavedTimestamp');
    setFootnotesProcessed(false);
  }, [resetTimer]);

  // Inicializa cliente Gemini quando chave carregada
  useEffect(() => {
    if (apiKey) {
      try { configureProviderApiKey(provider, apiKey); } catch (e) { console.warn('Falha ao configurar API Key:', e); }
    }
  }, [apiKey, provider]);

  const handleApiKeySave = useCallback((data: { provider: string; geminiKey: string; openRouterKey: string; qwenModel: string; }) => {
    const prov = (data.provider as Provider) || 'gemini';
    setProvider(prov);
    if (prov === 'gemini') {
      setApiKey(data.geminiKey);
      configureProviderApiKey('gemini', data.geminiKey);
    } else {
      setApiKey(data.openRouterKey);
      configureProviderApiKey('openrouter', data.openRouterKey);
      setQwenModel(data.qwenModel);
    }
    setShowApiKeyScreen(false);
  }, []);
  
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setErrorMessage('');
    setInitialExtractedText('');
    setExtractedText('');
    setTextWithHeadlines(null);
    setStructuredText(null);
    setFailedChunks([]);
    setProgress(0);
    setTotalPages(0);
    resetTimer();
    
    localStorage.removeItem('savedExtractedText');
    localStorage.removeItem('lastSavedTimestamp');

    try {
      const pages = await getPdfPageCount(file);
      setTotalPages(pages);

      setProcessingState(ProcessingState.EXTRACTING);
      const rawText = await extractTextFromFile(file, setProgress);
      
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
      
      const recommendedCount = Math.max(1, Math.ceil(combinedText.length / BASE_CHUNK_SIZE_FOR_RECOMMENDATION));
      setDesiredChunkCount(recommendedCount);

      setProcessingState(ProcessingState.CONFIGURING_CLEANING);

    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred during extraction.";
      setErrorMessage(message);
      setProcessingState(ProcessingState.ERROR);
    }
  }, [resetTimer, incrementApiCalls, processingMode]);

  const handleStartCleaning = useCallback(async () => {
    if (!initialExtractedText) return;
    
    resetTimer();
    startTimer();
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    
    try {
      setProcessingState(ProcessingState.CLEANING);
      setProgress(0);
      setStructuringMessage('Iniciando limpeza do documento...');
      // Pré-limpeza para OpenRouter antes de chunking (opcional)
      let baseText = initialExtractedText;
      if (provider === 'openrouter') {
        if (preCleanEnabled) {
          setStructuringMessage('Pré-limpeza inicial (OpenRouter)...');
          const preOriginalLen = initialExtractedText.length;
          const cleanedFull = await initialNormalizeWithOpenRouter(initialExtractedText, provider, qwenModel);
          baseText = cleanedFull;
          setPreCleanStats({ original: preOriginalLen, cleaned: cleanedFull.length });
        } else {
          console.log('[AI][OpenRouter][Pre] Pré-limpeza desativada pelo usuário. Pulando etapa.');
          setPreCleanStats(null);
        }
      }

      const chunks = createChunksByCount(baseText, desiredChunkCount);
      const cleanedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        let processedChunk = '';
        let success = false;
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          setStructuringMessage(`Limpando pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
          const instructions = (provider === 'openrouter' && OPENROUTER_SIMPLIFIED)
            ? getTaskInstructionsForCleaning() + '\n\nPRESERVE NUMERIC REFERENCES: Não mova números no fim de linha para a próxima linha.'
            : getTaskInstructionsForCleaning();
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: "Cleaning document text. No structural context needed.",
            previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : "",
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : "",
            task_instructions: instructions,
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider,
            qwenModel,
          });
          if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) {
            let finalResult = result;
            if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
              finalResult = restoreTrailingReferenceNumber(chunks[i], finalResult); // heurística leve somente
            }
            processedChunk = finalResult;
            success = true;
            break;
          }
          console.warn(`Cleaning chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
          if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(r => setTimeout(r, 1000));
        }

        if (!success) {
            console.error(`Chunk ${i + 1} failed cleaning after ${MAX_CHUNK_ATTEMPTS} attempts. Using original content.`);
            cleanedChunks.push(chunks[i]);
            localFailedChunks.push(i + 1);
        } else {
            cleanedChunks.push(processedChunk);
        }

        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      const cleanedText = cleanedChunks.join('\n\n');

      setExtractedText(cleanedText);
      setFailedChunks(localFailedChunks);
      setProcessingState(ProcessingState.SUCCESS);
      stopTimer();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred during processing.";
      setErrorMessage(message);
      setProcessingState(ProcessingState.ERROR);
      stopTimer();
    }
  }, [initialExtractedText, desiredChunkCount, resetTimer, startTimer, stopTimer, incrementApiCalls, processingMode, provider, qwenModel, preCleanEnabled]);
  
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
    startTimer();
    setStructuredText(null);
    setTextWithHeadlines(null);
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    
    setProcessingState(ProcessingState.STRUCTURING_HEADLINES);
    try {
      const chunks = createChunksByCount(textToProcess, desiredChunkCount);
      const processedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        let success = false;
        let processedChunk = '';
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          setStructuringMessage(`Etapa 1: Marcando headlines no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
          let step1Instructions = getTaskInstructionsForStep1_Headlines();
          if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
            step1Instructions += '\n\nOPENROUTER SIMPLE MODE: Não mover números de footnote; não duplicar linhas; apenas envolver cabeçalhos claros.';
          }
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: "Currently tagging headlines.",
            previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : "",
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : "",
            task_instructions: step1Instructions,
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider,
            qwenModel,
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
                const reinforcedInstructions = step1Instructions + '\n\nREFORÇO CRÍTICO: Você deve OBRIGATORIAMENTE envolver títulos detectáveis (CHAPTER / ARTICLE / SECTION / CAPÍTULO / ARTIGO / Art. N) com {{levelX}} mantendo o texto idêntico. NÃO devolver bloco cru se houver padrão.';
                const retry = await processDocumentChunkUnified({
                  main_chunk_content: chunks[i],
                  continuous_context_summary: 'Reinforcement pass due to missing headline tags.',
                  previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : '',
                  next_chunk_overlap: i < chunks.length - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
                  task_instructions: reinforcedInstructions,
                  onApiCall: incrementApiCalls,
                  mode: processingMode,
                  provider,
                  qwenModel,
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
      setFailedChunks(localFailedChunks);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred.";
      setTextWithHeadlines(`Error: ${message}`);
    } finally {
      setProcessingState(ProcessingState.SUCCESS);
      stopTimer();
    }
  }, [extractedText, desiredChunkCount, startTimer, stopTimer, incrementApiCalls, processingMode, provider]);

  const handleStartFootnoteTagging = useCallback(async () => {
    const textToProcess = localStorage.getItem('savedExtractedText') || textWithHeadlines || extractedText;
    if (!textToProcess) return;
    startTimer();
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    setProcessingState(ProcessingState.STRUCTURING_FOOTNOTES);
    try {
      const chunks = createChunksByCount(textToProcess, desiredChunkCount);
      const processedChunks: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        let success = false;
        let processedChunk = '';
        for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
          setStructuringMessage(`Etapa Footnotes: Marcando notas no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
          const result = await processDocumentChunkUnified({
            main_chunk_content: chunks[i],
            continuous_context_summary: 'Tagging footnote references and footnote content lines only.',
            previous_chunk_overlap: i > 0 ? chunks[i-1].slice(-OVERLAP_CONTEXT_SIZE) : '',
            next_chunk_overlap: i < chunks.length - 1 ? chunks[i+1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
            task_instructions: getTaskInstructionsForFootnotesMarkers(),
            onApiCall: incrementApiCalls,
            mode: processingMode,
            provider,
            qwenModel,
          });
          if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) { processedChunk = result; success = true; break; }
          console.warn(`Footnote tagging for chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
          if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(res => setTimeout(res, 1000));
        }
        if (!success) { processedChunks.push(chunks[i]); localFailedChunks.push(i+1); } else { processedChunks.push(processedChunk); }
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }
      const joined = processedChunks.join('\n\n');
      if (textWithHeadlines) setTextWithHeadlines(joined); else setExtractedText(joined);
  setMarkerStageText(joined); // guardar versão com markers antes de headlines
      setFailedChunks(localFailedChunks);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'An error occurred.';
      if (textWithHeadlines) setTextWithHeadlines(`Error: ${msg}`); else setExtractedText(`Error: ${msg}`);
    } finally {
      setFootnotesProcessed(true);
      // Após footnotes (openrouter) permitir configurar headlines a seguir.
      setProcessingState(ProcessingState.SUCCESS);
      stopTimer();
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
    startTimer();
    setStructuredText(null);
    setFailedChunks([]);
    let localFailedChunks: number[] = [];
    
    setProcessingState(ProcessingState.STRUCTURING_CONTENT);
    try {
        const chunks = createChunksByCount(textToProcess, desiredChunkCount);
        const processedChunks: string[] = [];
        let continuous_context_summary = "No context yet.";

        for (let i = 0; i < chunks.length; i++) {
            let success = false;
            let processedChunk = '';
            for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
                setStructuringMessage(`Etapa 2: Marcando conteúdo no pedaço ${i + 1} de ${chunks.length} (Tentativa ${attempt})...`);
                let step2Instructions = getTaskInstructionsForStep2_Content();
                if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
                  step2Instructions += '\n\nOPENROUTER SIMPLE MODE: Não mover números de fim de linha; não alterar linhas já taggeadas; não envolver footnotes.';
                }
                const result = await processDocumentChunkUnified({
                    main_chunk_content: chunks[i],
                    continuous_context_summary,
                    previous_chunk_overlap: i > 0 ? chunks[i-1].slice(-OVERLAP_CONTEXT_SIZE) : "",
                    next_chunk_overlap: i < chunks.length - 1 ? chunks[i+1].slice(0, OVERLAP_CONTEXT_SIZE) : "",
                    task_instructions: step2Instructions,
                    onApiCall: incrementApiCalls,
                    mode: processingMode,
                    provider,
                    qwenModel,
                });
                if (result && result.trim().length > 0 && !result.startsWith('[ERROR')) {
                  let finalResult = result;
                  if (provider === 'openrouter' && OPENROUTER_SIMPLIFIED) {
                    finalResult = restoreTrailingReferenceNumber(chunks[i], finalResult);
                  }
                  processedChunk = finalResult;
                  success = true;
                  break;
                }
                console.warn(`Content tagging for chunk ${i + 1} failed on attempt ${attempt}. Retrying...`);
                if (attempt < MAX_CHUNK_ATTEMPTS) await new Promise(res => setTimeout(res, 1000));
            }

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

        setStructuredText(processedChunks.join('\n\n'));
        setFailedChunks(localFailedChunks);
    } catch (error) {
        const message = error instanceof Error ? error.message : "An error occurred.";
        setStructuredText(`Error: ${message}`);
    } finally {
        setProcessingState(ProcessingState.SUCCESS);
        stopTimer();
    }
  }, [textWithHeadlines, desiredChunkCount, startTimer, stopTimer, incrementApiCalls, processingMode]);

  const handleDownload = useCallback((format: DownloadFormat, contentOverride?: string) => {
    if (!selectedFile) return;

    let content = '';
    const mimeType = 'text/plain';
    const fileExtension = 'txt';
    const baseFileName = selectedFile.name.replace(/\.pdf$/i, '');
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

  }, [extractedText, textWithHeadlines, structuredText, selectedFile]);
  
  const handleCancelConfiguration = useCallback(() => {
    setProcessingState(ProcessingState.SUCCESS);
  }, []);

  const renderContent = () => {
    if (showApiKeyScreen) {
      return <ApiKeyScreen onSave={handleApiKeySave} />;
    }
    switch (processingState) {
      case ProcessingState.IDLE:
        return <FileUpload onFileSelect={handleFileSelect} disabled={false} />;
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
        return selectedFile && (
          <ResultViewer
            fileName={selectedFile.name}
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
            onReset={handleReset}
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
              onClick={handleReset}
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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
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
              {apiKey && !showApiKeyScreen && (
                <button
                  onClick={() => setShowApiKeyScreen(true)}
                  className="self-center px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-gray-200"
                >
                  Alterar API Key
                </button>
              )}
              {!showApiKeyScreen && (
                <div className="text-xs text-gray-400 flex flex-col items-end gap-1">
                  <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Provider: <strong className={provider==='gemini' ? 'text-teal-300' : 'text-indigo-300'}>{provider}</strong></span>
                  {provider==='openrouter' && <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Modelo: <code className="text-indigo-300">{qwenModel}</code></span>}
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
            <p>AI text structuring uses the Gemini API.</p>
        </footer>
    </div>
  );
}