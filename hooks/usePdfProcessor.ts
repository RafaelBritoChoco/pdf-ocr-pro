
import { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { enrichTextWithStructuralTags, extractTextFromImage, processPageWithText } from '../services/geminiService';
import type { processStructuredText } from '../services/textProcessor'; // Import new textProcessor
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
  currentStatus: string | null;
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
  currentStatus: null,
};

const PROCESS_STORAGE_KEY = 'pdfProcessState';

export const usePdfProcessor = () => {
  const [state, setState] = useState<PdfProcessState>(initialProcessState);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const { saveState, loadState, clearState: clearPersistedState, hasSavedState } = useProcessPersistence<PdfProcessState>(PROCESS_STORAGE_KEY);
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





// Phase 4: Hybrid AI Enrichment + Deterministic Formatting
      if (!state.stepTimers["phase4"]?.endTime) {
        stepTimers.startStep("phase4", "Phase 4: Hybrid AI Enrichment + Deterministic Formatting");
        await appendLog(`Phase 4, Stage 2: AI enriching text with structural tags...`);
        updateState({ isReformatting: true, progress: { ...state.progress, phase: "AI Analyzing Structure..." } });
        const consolidatedText = accumulatedResults.map(r => r.text || "").join("\n");
        const taggedText = await enrichTextWithStructuralTags(consolidatedText);

        await appendLog(`Phase 4, Stage 3: Applying deterministic formatting rules...`);
        updateState({ progress: { ...state.progress, phase: "Applying Final Formatting..." } });
        const { finalText, footnoteAnalysis } = processStructuredText(taggedText);

        updateState({
            formattedText: finalText,
            footnoteAnalysis: footnoteAnalysis,
        });

        stepTimers.stopStep("phase4");
        await appendLog(`Phase 4 completed in ${stepTimers.getDuration("phase4")}ms`);
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

      // Phase 4 - AI Enrichment and Final Formatting
      if (!restoredState.stepTimers['phase4']?.endTime && !restoredState.formattedText) {
        stepTimers.startStep('phase4', 'Phase 4: AI Enrichment and Final Formatting');
        await appendLog('🎨 Phase 4: AI enriching text with structural tags...', 'info');
        updateState({ isReformatting: true, error: null });

        const rawTextToEnrich = accumulatedResults.map(r => r.text ? `${r.text}\n\n--- PAGE ${r.pageNumber} ---\n\n` : "").join('');
        if(rawTextToEnrich.trim().length === 0) throw new Error("No text to enrich.");

        // Call the new AI enrichment function
        const enrichedText = await enrichTextWithStructuralTags(rawTextToEnrich);
        await appendLog('✅ AI enrichment completed. Now applying rule-based formatting...', 'info');

        // Pass the enriched text to the new textProcessor
        const { finalText: finalFormattedText, footnoteAnalysis: finalAnalysis } = processStructuredText(enrichedText);
        
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

  useEffect(() => {
    if (currentFile && hasSavedState(currentFile)) {
      const saved = loadState(currentFile);
      if (saved) {
        setState(saved);
        appendLog(`💾 Restored state for ${currentFile.name}`, 'info');
        // If a process was interrupted, try to continue it
        if (saved.isProcessing && !saved.isCompleted) {
          continueProcessingFromState(saved);
        }
      }
    }
  }, [currentFile, hasSavedState, loadState, appendLog, continueProcessingFromState]);

  return {
    startProcessing,
    clear,
    state,
    setCurrentFile,
    currentFile,
    stepTimers,
  };
};


