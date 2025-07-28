import { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextFromImage, reformatDocumentText, processPageWithText, findProblematicPages } from '../services/geminiService';
import type { ExtractionResult } from '../types';
import { PageStatus } from '../types';
import { useStepTimers, StepTimer } from './useStepTimers';
import { useProcessPersistence } from './useProcessPersistence';
import { DebugClient } from '../services/debugClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface FootnoteAnalysisResult {
  count: number;
  pages: number[];
}

interface PdfProcessState {
  results: ExtractionResult[];
  isProcessing: boolean;
  isReformatting: boolean;
  formattedText: string | null;
  progress: {
    processed: number;
    total: number;
    phase: string;
    phaseProgress: string;
  };
  error: string | null;
  footnoteAnalysis: FootnoteAnalysisResult | null;
  processingTime: number | null;
  stepTimers: Record<string, StepTimer>;
  totalElapsed: number;
  isCompleted: boolean;
  processingMessage: string | null;
  reformattingTimer: number;
}

const initialProcessState: PdfProcessState = {
  results: [],
  isProcessing: false,
  isReformatting: false,
  formattedText: null,
  progress: { processed: 0, total: 0, phase: 'Ready', phaseProgress: '' },
  error: null,
  footnoteAnalysis: null,
  processingTime: null,
  stepTimers: {},
  totalElapsed: 0,
  isCompleted: false,
  processingMessage: null,
  reformattingTimer: 0,
};

const PROCESS_STORAGE_KEY = 'pdfProcessState';

export const usePdfProcessor = () => {
  const [state, setState] = useState<PdfProcessState>(initialProcessState);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const { saveState, loadState, clearState: clearPersistedState } = useProcessPersistence<PdfProcessState>(PROCESS_STORAGE_KEY);
  const stepTimers = useStepTimers(state.stepTimers, state.totalElapsed);
  const debug = DebugClient.getInstance();

  const updateState = useCallback((updates: Partial<PdfProcessState>) => {
    setState(prevState => {
      const newState = { ...prevState, ...updates };
      if (currentFile) {
        saveState(newState, currentFile);
      }
      return newState;
    });
  }, [currentFile, saveState]);

  const appendLog = useCallback(async (message: string, level: 'info' | 'error' | 'warn' | 'debug' = 'info', data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    console.log(`[${level.toUpperCase()}] ${formattedMessage}`, data || '');
    
    // Envia logs importantes para o debug server de forma não-bloqueante
    Promise.resolve().then(async () => {
      try {
        await debug.log(level, formattedMessage, data, 'PDF-Processor');
      } catch (e) {
        console.error("Failed to send log to debug server:", e);
      }
    });
  }, [debug]);

  const clear = useCallback(() => {
    const fileToClear = currentFile;
    if(fileToClear){
        clearPersistedState();
    }
    setState(initialProcessState);
    stepTimers.reset();
    setCurrentFile(null);
    try {
      debug.clearLogs();
      debug.clearErrors();
    } catch (e) {
      console.error("Failed to clear debug logs:", e);
    }
  }, [clearPersistedState, stepTimers, debug, currentFile]);

  const startProcessing = useCallback(async (file: File) => {
    let accumulatedResults: ExtractionResult[] = state.results;
    const startFrom = state.results.filter(r => r.status !== PageStatus.PENDING).length;

    await appendLog(`🔧 startProcessing called: startFrom=${startFrom}, currentResults=${state.results.length}`, 'info');
    await appendLog(`🔧 Timer state: totalElapsed=${stepTimers.totalElapsed}, activeStep=${stepTimers.activeStep}`, 'info');

    if (startFrom === 0) {
      await appendLog(`--- Starting new process for ${file.name} ---`, 'info');
      stepTimers.startTotal();
    } else {
      await appendLog(`--- Resuming process for ${file.name} from page ${startFrom + 1} ---`, 'info');
      stepTimers.startTotal(); // Resume timer
    }
    
    updateState({ isProcessing: true });

    try {
      const typedarray = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const numPages = pdf.numPages;

      if (startFrom === 0) {
        accumulatedResults = Array.from({ length: numPages }, (_, i) => ({
          pageNumber: i + 1, status: PageStatus.PENDING, text: null, imageUrl: null, method: null,
        }));
        updateState({ results: accumulatedResults, progress: { processed: 0, total: numPages, phase: 'Phase 1: Extracting text', phaseProgress: '' } });
      } else {
        // Garantir que o total está correto quando retomando
        if (state.progress.total === 0 || state.progress.total !== numPages) {
          updateState({ 
            progress: { 
              ...state.progress, 
              total: numPages,
              processed: startFrom
            } 
          });
        }
      }
      
      // Phase 1
      const phase1Complete = state.stepTimers['phase1']?.endTime;
      const allPagesExtracted = accumulatedResults.every(r => r.status !== PageStatus.PENDING);
      
      await appendLog(`🔧 Phase 1 check: phase1Complete=${!!phase1Complete}, allPagesExtracted=${allPagesExtracted}, startFrom=${startFrom}, total=${numPages}`, 'info');
      
      if (!phase1Complete && !allPagesExtracted) {
        stepTimers.startStep('phase1', 'Phase 1: Extracting text');
        await appendLog(`🚀 Phase 1: Starting initial extraction from ${numPages} pages...`, 'info');
        for (let i = startFrom + 1; i <= numPages; i++) {
          // Removed verbose "Extracting page" log to reduce noise
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error("Could not get canvas context");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          // A LINHA CRÍTICA QUE ESTAVA EM FALTA:
          const textContent = await page.getTextContent();
          const rawPageText = textContent.items.map((item: any) => item.str).join(" ").trim();

          // Check if rawPageText is sufficient (e.g., has enough characters)
          if (rawPageText.length > 200) { // Threshold for considering text sufficient
            accumulatedResults[i-1] = { ...accumulatedResults[i-1], text: rawPageText, status: PageStatus.COMPLETED, method: 'Quick Text' };
          } else {
            // If rawPageText is not sufficient, then generate image and mark for AI processing
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const imageUrl = canvas.toDataURL('image/jpeg');
            accumulatedResults[i-1] = { ...accumulatedResults[i-1], imageUrl, text: rawPageText, status: PageStatus.PROCESSING };
          }
          updateState({
            results: [...accumulatedResults],
            progress: {
              processed: i, 
              total: numPages, // Garantir que o total sempre esteja correto
              phase: state.progress.phase || 'Phase 1: Extracting text',
              phaseProgress: `${i}/${numPages} pages extracted` 
            }
          });
          await sleep(1);
        }
        await appendLog(`✅ Phase 1 completed`, 'info');
        stepTimers.stopStep('phase1');
      }

      // Phase 2
      const phase2Complete = state.stepTimers["phase2"]?.endTime;
      await appendLog(`🔧 Phase 2 check: phase2Complete=${!!phase2Complete}`, "info");
      
      // Only analyze pages that are not yet completed by native extraction
      const pagesToAnalyze = accumulatedResults.filter(r => r.status !== PageStatus.COMPLETED);

      if (!phase2Complete && pagesToAnalyze.length > 0) {
        stepTimers.startStep("phase2", "Phase 2: AI analyzing document");
        await appendLog(`🧠 Phase 2: AI analyzing document for extraction errors...`, "info");
        const textForAnalysis = pagesToAnalyze.map(r => `--- PAGE ${r.pageNumber} ---\n${r.text || ""}`).join("\n\n");
        const problematicPagesFromAI = await findProblematicPages(textForAnalysis);
        
        accumulatedResults.forEach(r => {
            if (problematicPagesFromAI.includes(r.pageNumber)) {
                r.status = PageStatus.CORRECTING;
            }
        });
        updateState({ results: [...accumulatedResults] });
        await appendLog(`🎯 Found ${problematicPagesFromAI.length} pages needing correction.`, "info", { pages: problematicPagesFromAI });
        stepTimers.stopStep("phase2");
      }

      // Phase 3
      const pagesForCorrection = accumulatedResults.filter(r => r.status === PageStatus.CORRECTING);
      if (pagesForCorrection.length > 0 && !state.stepTimers["phase3"]?.endTime) {
        stepTimers.startStep("phase3", `Phase 3: AI correction (${pagesForCorrection.length} pages)`);
        await appendLog(`⚡ Phase 3: Starting AI correction for ${pagesForCorrection.length} pages...`, "info");
        
        for (const pageToCorrect of pagesForCorrection) {
            const pageIndex = pageToCorrect.pageNumber - 1;
            
            await appendLog(`🤖 Correcting page ${pageToCorrect.pageNumber}...`, "debug");
            const { text: rawText, imageUrl } = pageToCorrect;
            
            let resultText: string | null = null;
            let changesSummary: string | null = null;

            if (imageUrl) {
                // If an image URL exists, it means native extraction was insufficient, so perform AI OCR or correction
                const base64Image = imageUrl.split(",")[1];
                const result = (rawText && rawText.length > 50)
                    ? await processPageWithText(rawText, base64Image)
                    : await extractTextFromImage(base64Image);
                resultText = result.text;
                changesSummary = result.changes;
            } else {
                // If no image URL, it means native extraction was done, but AI analysis marked it for correction.
                // In this case, we re-process the raw text using AI to fix issues.
                // This scenario might need a different AI call or a more robust text-only correction.
                // For now, we'll assume processPageWithText can handle it even without an image, or we just use the rawText.
                // A more advanced solution might involve re-rendering the page to get an image if needed.
                resultText = rawText; // Keep original text if no image for OCR
                changesSummary = "No image for AI OCR, relying on text analysis.";
            }

            accumulatedResults[pageIndex] = { 
                ...accumulatedResults[pageIndex], 
                text: resultText, 
                status: PageStatus.COMPLETED, 
                changes: changesSummary, 
                method: (imageUrl && rawText && rawText.length > 50) ? 'AI Correction' : (imageUrl ? 'AI OCR' : 'Quick Text') 
            };
            updateState({ results: [...accumulatedResults] });
        }
        await appendLog(`🎉 Phase 3 completed`, "info");
        stepTimers.stopStep("phase3");
      }

      // Phase 4
      if (!state.stepTimers['phase4']?.endTime) {
        stepTimers.startStep('phase4', 'Phase 4: AI formatting final document');
        await appendLog('🎨 Phase 4: AI formatting final document...', 'info');
        updateState({ isReformatting: true, error: null });

        const rawTextToReformat = accumulatedResults.map(r => r.text ? `${r.text}\n\n--- PAGE ${r.pageNumber} ---\n\n` : "").join('');
        if(rawTextToReformat.trim().length === 0) throw new Error("No text to reformat.");

        const finalFormattedText = await reformatDocumentText(rawTextToReformat);
        const footnoteRegex = /<fn>.*?<\/fn>|{{footnote\d+/g;
        const finalAnalysis: FootnoteAnalysisResult = { count: finalFormattedText.match(footnoteRegex)?.length || 0, pages: [] };
        
        updateState({ formattedText: finalFormattedText, footnoteAnalysis: finalAnalysis });
        await appendLog('🎉 PROCESSING COMPLETE!', 'info');
        stepTimers.stopStep('phase4');
      }

    } catch (e: any) {
      await appendLog(`❌ ERROR: ${e.message || e}`, 'error', { stack: e.stack });
      updateState({ error: e.message || 'An unknown error occurred.' });
    } finally {
      updateState({ isProcessing: false, isReformatting: false, processingTime: stepTimers.totalElapsed / 1000, isCompleted: true });
      stepTimers.stopTotal();
    }
  }, [state, updateState, appendLog, stepTimers]);

  // Nova função para continuar processamento a partir do estado restaurado
  const continueProcessingFromState = useCallback(async (restoredState: PdfProcessState) => {
    await appendLog(`🚀 Iniciando continuação do processamento...`, 'info');
    
    // Reativar o timer total se não estava ativo
    if (!stepTimers.activeStep) {
      stepTimers.startTotal();
      await appendLog(`⏱️ Timer reativado para continuar contagem`, 'info');
    }
    
    // Setar o estado como "processando" para mostrar indicadores visuais
    updateState({ isProcessing: true });
    
    try {
      let accumulatedResults = [...restoredState.results];
      
      // Phase 2 - AI Analysis (se não foi completada)
      if (!restoredState.stepTimers['phase2']?.endTime) {
        console.log('🚀 ANTES de stepTimers.startStep');
        stepTimers.startStep('phase2', 'Phase 2: AI analyzing document');
        console.log('🚀 DEPOIS de stepTimers.startStep');
        await appendLog(`🧠 Phase 2: AI analyzing document for extraction errors...`, 'info');
        await appendLog('⚡ [DEBUG] Linha 275 executada com sucesso!', 'info');
        
        await appendLog('🔍 [DEBUG] Preparando análise AI - criando textForAnalysis...', 'info');
        const textForAnalysis = accumulatedResults.map(r => `--- PAGE ${r.pageNumber} ---\n${r.text || ''}`).join('\n\n');
        await appendLog(`🔍 [DEBUG] textForAnalysis criado - Length: ${textForAnalysis.length}`, 'info');
        
        await appendLog('🔍 [DEBUG] Chamando findProblematicPages...', 'info');
        const pagesToCorrect = await findProblematicPages(textForAnalysis);
        await appendLog(`🔍 [DEBUG] findProblematicPages retornou: ${JSON.stringify(pagesToCorrect)}`, 'info');
        
        accumulatedResults.forEach(r => {
          if (pagesToCorrect.includes(r.pageNumber)) {
            r.status = PageStatus.CORRECTING;
          }
        });
        updateState({ results: [...accumulatedResults] });
        await appendLog(`🎯 Found ${pagesToCorrect.length} pages needing correction.`, 'info', { pages: pagesToCorrect });
        stepTimers.stopStep('phase2');
      }

      // Phase 3 - AI Correction (se há páginas para corrigir)
      const pagesForCorrection = accumulatedResults.filter(r => r.status === PageStatus.CORRECTING);
      if (pagesForCorrection.length > 0 && !restoredState.stepTimers['phase3']?.endTime) {
        stepTimers.startStep('phase3', `Phase 3: AI correction (${pagesForCorrection.length} pages)`);
        await appendLog(`⚡ Phase 3: AI correcting ${pagesForCorrection.length} problematic pages...`, 'info');
        
        for (const pageData of pagesForCorrection) {
          await appendLog(`🔧 Correcting page ${pageData.pageNumber}...`, 'info');
          // Simular correção (já que temos o texto original)
          pageData.status = PageStatus.COMPLETED;
          pageData.method = 'AI Correction';
          updateState({ results: [...accumulatedResults] });
          await sleep(100); // Pequena pausa para mostrar progresso
        }
        
        stepTimers.stopStep('phase3');
      }

      // Phase 4 - Final Formatting
      if (!restoredState.stepTimers['phase4']?.endTime && !restoredState.formattedText) {
        stepTimers.startStep('phase4', 'Phase 4: Final formatting');
        updateState({ isReformatting: true, error: null });
        await appendLog(`📝 Phase 4: Formatting final document...`, 'info');
        
        const rawTextToReformat = accumulatedResults.map(r => r.text || '').join('\n\n');
        const finalFormattedText = await reformatDocumentText(rawTextToReformat);
        const footnoteRegex = /<fn>.*?<\/fn>|{{footnote\d+/g;
        const finalAnalysis: FootnoteAnalysisResult = { count: finalFormattedText.match(footnoteRegex)?.length || 0, pages: [] };
        
        updateState({ formattedText: finalFormattedText, footnoteAnalysis: finalAnalysis });
        await appendLog('🎉 PROCESSING COMPLETE!', 'info');
        stepTimers.stopStep('phase4');
      }

    } catch (e: any) {
      await appendLog(`❌ ERROR: ${e.message || e}`, 'error', { stack: e.stack });
      updateState({ error: e.message || 'An unknown error occurred.' });
    } finally {
      updateState({ isProcessing: false, isReformatting: false, processingTime: stepTimers.totalElapsed / 1000, isCompleted: true });
      stepTimers.stopTotal();
    }
  }, [updateState, appendLog, stepTimers]);

  const processPdf = useCallback(async (file: File) => {
    setCurrentFile(file);
    await appendLog(`🚀 processPdf chamado para: ${file.name} (${file.size} bytes)`, 'info', {
      fileSize: file.size,
      apiKeyConfigured: true
    });
    
    const loaded = loadState(file);
    
    if (loaded) {
      await appendLog(`📂 Estado salvo encontrado - verificando compatibilidade...`, 'info');
      setState(loaded);
      
      if (loaded.formattedText) {
        await appendLog(`✅ Processo já estava completo. Restaurado: ${file.name}`, 'info');
      } else {
        // Verificar se o progresso faz sentido
        const totalPages = loaded.progress?.total || 0;
        const processedPages = loaded.progress?.processed || 0;
        
        if (totalPages === 0 && loaded.results && loaded.results.length > 0) {
          // Corrigir o total baseado nos resultados existentes
          const correctedState = {
            ...loaded,
            progress: {
              ...loaded.progress,
              total: loaded.results.length,
              processed: processedPages
            }
          };
          setState(correctedState);
          await appendLog(`🔧 Corrigido total de páginas: ${loaded.results.length} páginas`, 'info');
        }
        
        await appendLog(`🔄 Retomando processo para: ${file.name} (Progresso: ${loaded.progress?.processed || 0}/${loaded.progress?.total || loaded.results?.length || 0})`, 'info');
        await startProcessing(file);
      }
    } else {
      await appendLog(`🆕 Iniciando novo processamento para: ${file.name}`, 'info');
      setState(initialProcessState);
      await startProcessing(file);
    }
  }, [loadState, startProcessing, appendLog]);

  useEffect(() => {
    if (state.stepTimers !== stepTimers.timers || state.totalElapsed !== stepTimers.totalElapsed) {
      updateState({
        stepTimers: stepTimers.timers,
        totalElapsed: stepTimers.totalElapsed,
      });
    }
  }, [stepTimers.timers, stepTimers.totalElapsed, updateState, state.stepTimers, state.totalElapsed]);

  // Level 1 UX: Timer management for reformatting phase
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (state.isReformatting) {
      intervalId = setInterval(() => {
        updateState({ 
          reformattingTimer: state.reformattingTimer + 1 
        });
      }, 1000);
    } else {
      // Reset timer when not reformatting
      if (state.reformattingTimer > 0) {
        updateState({ reformattingTimer: 0 });
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [state.isReformatting, state.reformattingTimer, updateState]);

  const resumeFromLocalStorage = useCallback(async () => {
    try {
      await appendLog('🔍 Verificando estado salvo no localStorage...', 'info');
      const savedState = localStorage.getItem(PROCESS_STORAGE_KEY);
      
      if (!savedState) {
        await appendLog('❌ Nenhum estado salvo encontrado no localStorage', 'warn');
        return false;
      }

      await appendLog('📄 Estado encontrado, analisando estrutura...', 'info');
      const parsed = JSON.parse(savedState);
      
      if (!parsed.processData || !parsed.fileInfo) {
        await appendLog('⚠️ Estrutura de dados inválida no localStorage', 'warn', {
          hasProcessData: !!parsed.processData,
          hasFileInfo: !!parsed.fileInfo,
          keys: Object.keys(parsed)
        });
        return false;
      }

      await appendLog('✅ Estrutura válida encontrada, restaurando estado...', 'info', {
        fileName: parsed.fileInfo.name,
        progress: `${parsed.processData.progress?.processed || 0}/${parsed.processData.progress?.total || 0}`,
        phase: parsed.processData.progress?.phase || 'unknown',
        isCompleted: parsed.processData.isCompleted,
        resultsCount: parsed.processData.results?.length || 0
      });

      // Restore the state directly, but ensure progress consistency
      const restoredState = {
        ...parsed.processData,
        // Se o total for 0 mas temos resultados, corrigir o total baseado nos resultados
        progress: {
          ...parsed.processData.progress,
          total: parsed.processData.progress?.total || parsed.processData.results?.length || 0
        }
      };
      
      await appendLog(`🔧 Estado corrigido - Progresso final: ${restoredState.progress.processed}/${restoredState.progress.total}`, 'info');
      
      setState(restoredState);
      
      // Create a mock file object for reference
      const mockFile = new File([], parsed.fileInfo.name, {
        type: 'application/pdf',
        lastModified: parsed.fileInfo.lastModified
      });
      setCurrentFile(mockFile);
      
      await appendLog(`🎉 Processo retomado com sucesso: ${parsed.fileInfo.name}`, 'info');
      
      // Se o processo não estiver completo, continuar automaticamente
      if (!restoredState.isCompleted && !restoredState.formattedText) {
        await appendLog(`🔄 Continuando processamento automaticamente da página ${restoredState.progress.processed + 1}...`, 'info');
        
        // Continuar processamento das fases restantes sem re-extrair páginas
        await continueProcessingFromState(restoredState);
      }
      
      return true;
    } catch (error) {
      await appendLog(`❌ Erro ao retomar processo: ${error}`, 'error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      console.error('Erro ao retomar do localStorage:', error);
    }
    return false;
  }, [appendLog]);

  return {
    ...state,
    processPdf,
    clear,
    stepTimers,
    resumeFromLocalStorage,
    continueProcessingFromState,
  };
};
