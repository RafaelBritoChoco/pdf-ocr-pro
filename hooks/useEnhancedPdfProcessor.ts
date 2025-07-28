import { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ProcessingStorage, 
  ChunkProcessor, 
  ErrorRecovery, 
  ProgressTracker,
  ProcessingSession 
} from '../services/largeDocumentProcessor';
import { extractTextFromImage, reformatDocumentText, processPageWithText, findProblematicPages } from '../services/geminiService';
import type { ExtractionResult, ExtractionMethod } from '../types';
import { PageStatus } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface FootnoteAnalysisResult {
  count: number;
  pages: number[];
}

interface EnhancedProgress {
  processed: number;
  total: number;
  phase: string;
  phaseProgress: string;
  percentage: number;
  eta?: string;
  speed?: number;
  elapsed?: string;
}

export const useEnhancedPdfProcessor = () => {
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReformatting, setIsReformatting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [formattedText, setFormattedText] = useState<string | null>(null);
  const [progress, setProgress] = useState<EnhancedProgress>({ 
    processed: 0, 
    total: 0, 
    phase: 'Ready',
    phaseProgress: '',
    percentage: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [footnoteAnalysis, setFootnoteAnalysis] = useState<FootnoteAnalysisResult | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [canShowRecovery, setCanShowRecovery] = useState(false);
  const [progressTracker, setProgressTracker] = useState<ProgressTracker | null>(null);
  const [currentSession, setCurrentSession] = useState<ProcessingSession | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    if (ProcessingStorage.hasSession()) {
      setCanShowRecovery(true);
    }
  }, []);

  const addDebugLog = useCallback((message: string) => {
    setDebugLogs(prev => {
      const newLogs = [...prev, `${new Date().toLocaleTimeString()}: ${message}`];
      // Keep only last 200 logs to prevent memory issues
      return newLogs.slice(-200);
    });
  }, []);

  const updateProgress = useCallback((processed: number, total: number, phase: string, phaseProgress: string = '') => {
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    let progressData: EnhancedProgress = {
      processed,
      total,
      phase,
      phaseProgress,
      percentage
    };

    if (progressTracker) {
      const trackerData = progressTracker.update(processed);
      progressData = {
        ...progressData,
        eta: trackerData.eta,
        speed: trackerData.speed,
        elapsed: trackerData.elapsed
      };
    }

    setProgress(progressData);
  }, [progressTracker]);

  const saveSession = useCallback((session: Partial<ProcessingSession>) => {
    if (!currentSession) return;
    
    const updatedSession: ProcessingSession = {
      ...currentSession,
      ...session,
      lastSaveTime: Date.now()
    };
    
    setCurrentSession(updatedSession);
    ProcessingStorage.saveSession(updatedSession);
  }, [currentSession]);

  const clear = useCallback(() => {
    setDebugLogs([]);
    setResults([]);
    setIsProcessing(false);
    setIsReformatting(false);
    setIsPaused(false);
    setFormattedText(null);
    setProgress({ processed: 0, total: 0, phase: 'Ready', phaseProgress: '', percentage: 0 });
    setError(null);
    setFootnoteAnalysis(null);
    setProcessingTime(null);
    setProgressTracker(null);
    setCurrentSession(null);
    ProcessingStorage.clearSession();
  }, []);

  const restoreSession = useCallback(() => {
    const session = ProcessingStorage.loadSession();
    if (!session) return false;

    addDebugLog(`Restoring session: ${session.fileName} (${session.completedPages.length}/${session.totalPages} pages)`);
    
    setCurrentSession(session);
    setResults(session.results);
    setDebugLogs(session.debugLogs);
    setFormattedText(session.formattedText || null);
    setFootnoteAnalysis(session.footnoteAnalysis || null);
    setProgressTracker(new ProgressTracker(session.totalPages));
    
    updateProgress(
      session.completedPages.length, 
      session.totalPages, 
      `Phase ${session.currentPhase}: Resumed`,
      `${session.completedPages.length}/${session.totalPages} pages completed`
    );
    
    setCanShowRecovery(false);
    return true;
  }, [addDebugLog, updateProgress]);

  const pauseProcessing = useCallback(() => {
    setIsPaused(true);
    addDebugLog('⏸️ Processing paused by user');
  }, [addDebugLog]);

  const resumeProcessing = useCallback(() => {
    setIsPaused(false);
    addDebugLog('▶️ Processing resumed');
  }, [addDebugLog]);

  const processPdf = useCallback(async (file: File, skipWarning: boolean = false) => {
    // Check if file is large and show warning
    const isLargeFile = file.size > 10 * 1024 * 1024 || file.name.toLowerCase().includes('large'); // 10MB+ or has 'large' in name
    
    if (isLargeFile && !skipWarning) {
      // This should trigger the LargeDocumentWarning component
      return { needsConfirmation: true, fileSize: file.size };
    }

    clear();
    const startTime = Date.now();
    setIsProcessing(true);
    addDebugLog('🚀 Starting enhanced PDF processing for large documents...');
    
    // Create initial session
    const sessionId = `session_${Date.now()}`;
    const session: ProcessingSession = {
      id: sessionId,
      fileName: file.name,
      fileSize: file.size,
      totalPages: 0, // Will be updated when we know the page count
      currentPhase: 1,
      completedPages: [],
      results: [],
      startTime,
      lastSaveTime: startTime,
      debugLogs: []
    };

    let accumulatedResults: ExtractionResult[] = [];

    try {
      const typedarray = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const numPages = pdf.numPages;

      // Update session with page count
      session.totalPages = numPages;
      setCurrentSession(session);
      setProgressTracker(new ProgressTracker(numPages));
      
      addDebugLog(`📚 Document loaded: ${numPages} pages (${Math.round(file.size / 1024)}KB)`);
      
      if (numPages > 50) {
        addDebugLog(`⚠️ Large document detected - enhanced processing mode enabled`);
      }

      updateProgress(0, numPages, 'Phase 1: Extracting text', '');
      accumulatedResults = Array.from({ length: numPages }, (_, i) => ({
        pageNumber: i + 1, 
        status: PageStatus.PENDING, 
        text: null, 
        imageUrl: null, 
        method: null,
      }));
      setResults(accumulatedResults);

      // Save initial session
      saveSession({ totalPages: numPages, results: accumulatedResults });

      // Phase 1: Enhanced text extraction with chunking
      addDebugLog(`🔍 Phase 1: Starting chunked extraction...`);
      
      const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);

      await ChunkProcessor.processWithChunks(
        pageNumbers,
        async (pageNum) => {
          // Check for pause
          while (isPaused) {
            await sleep(100);
          }

          return await ErrorRecovery.withRetry(async () => {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) throw new Error("Could not get canvas context");
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const imageUrl = canvas.toDataURL('image/jpeg', 0.8); // Reduced quality for memory
            
            const textContent = await page.getTextContent();
            const rawPageText = textContent.items.map((item: any) => item.str).join(' ').trim();
            
            const pageIndex = pageNum - 1;
            accumulatedResults[pageIndex] = { 
              ...accumulatedResults[pageIndex], 
              imageUrl, 
              text: rawPageText,
              status: rawPageText.length > 100 ? PageStatus.COMPLETED : PageStatus.PENDING
            };
            
            if (rawPageText.length > 100) {
              addDebugLog(`✅ Page ${pageNum}: ${rawPageText.length} chars extracted`);
            } else {
              addDebugLog(`⚠️ Page ${pageNum}: Low text (${rawPageText.length} chars) - flagged for AI`);
            }
            
            return pageNum;
          }, `Page ${pageNum} extraction`);
        },
        (completed) => {
          updateProgress(completed, numPages, 'Phase 1: Extracting text', `${completed}/${numPages} pages`);
          
          // Save progress frequently for large documents
          if (completed % 10 === 0) {
            saveSession({ 
              completedPages: Array.from({ length: completed }, (_, i) => i + 1),
              results: accumulatedResults.slice(0, completed)
            });
          }
        }
      );

      setResults([...accumulatedResults]);
      addDebugLog(`✅ Phase 1 completed: ${numPages} pages extracted`);

      // Save after Phase 1
      saveSession({ 
        currentPhase: 2,
        completedPages: Array.from({ length: numPages }, (_, i) => i + 1),
        results: accumulatedResults
      });

      // Phase 2: AI Analysis (same as before but with better error handling)
      updateProgress(numPages, numPages, 'Phase 2: AI analyzing document', 'Detecting extraction errors...');
      addDebugLog(`🧠 Phase 2: AI analyzing for extraction errors...`);
      
      const textForAnalysis = accumulatedResults
        .map(r => `--- END OF PAGE ${r.pageNumber} ---\n${r.text || ''}`)
        .join('\n\n');
      
      const pagesToCorrect = await ErrorRecovery.withRetry(
        () => findProblematicPages(textForAnalysis),
        'AI analysis phase'
      );

      if (pagesToCorrect.length > 0) {
        addDebugLog(`🎯 Found ${pagesToCorrect.length} pages needing correction: ${JSON.stringify(pagesToCorrect)}`);
      } else {
        addDebugLog(`✨ All pages extracted cleanly - no AI correction needed!`);
      }

      // Phase 3: AI Correction with enhanced error handling
      if (pagesToCorrect.length > 0) {
        updateProgress(numPages, numPages, 'Phase 3: AI correction', `0/${pagesToCorrect.length} problematic pages`);
        addDebugLog(`⚡ Phase 3: Starting enhanced AI correction...`);
        
        await ChunkProcessor.processWithChunks(
          pagesToCorrect,
          async (pageNum) => {
            // Check for pause
            while (isPaused) {
              await sleep(100);
            }

            return await ErrorRecovery.withRetry(async () => {
              const pageIndex = accumulatedResults.findIndex(p => p.pageNumber === pageNum);
              if (pageIndex === -1) return pageNum;

              const { text: rawText, imageUrl } = accumulatedResults[pageIndex];
              if (!imageUrl) return pageNum;

              accumulatedResults[pageIndex].status = PageStatus.CORRECTING;
              setResults([...accumulatedResults]);

              const base64Image = imageUrl.split(',')[1];
              let correctedText: string;
              let method: ExtractionMethod;

              if (rawText && rawText.length > 50) {
                method = 'AI Correction';
                const result = await processPageWithText(rawText, base64Image);
                correctedText = result.text;
                addDebugLog(`✅ Page ${pageNum} corrected: ${correctedText.length} chars (was ${rawText.length})`);
              } else {
                method = 'AI OCR';
                const ocrResult = await extractTextFromImage(base64Image);
                correctedText = ocrResult.text;
                addDebugLog(`🔍 Page ${pageNum} OCR: ${correctedText.length} chars extracted`);
              }

              accumulatedResults[pageIndex] = {
                ...accumulatedResults[pageIndex],
                text: correctedText,
                method,
                status: PageStatus.COMPLETED
              };

              // Clear imageUrl to save memory after processing
              if (numPages > 100) {
                accumulatedResults[pageIndex].imageUrl = null;
              }

              return pageNum;
            }, `AI correction for page ${pageNum}`);
          },
          (completed) => {
            updateProgress(
              numPages, 
              numPages, 
              'Phase 3: AI correction', 
              `${completed}/${pagesToCorrect.length} problematic pages processed`
            );
            
            // Save progress during corrections
            if (completed % 5 === 0) {
              saveSession({ results: accumulatedResults });
            }
          },
          () => {
            setResults([...accumulatedResults]);
          }
        );

        addDebugLog(`✅ Phase 3 completed: ${pagesToCorrect.length} pages corrected`);
      }

      // Save after corrections
      saveSession({ currentPhase: 4, results: accumulatedResults });

      // Phase 4: Final formatting
      setIsReformatting(true);
      updateProgress(numPages, numPages, 'Phase 4: Final formatting', 'Consolidating and formatting...');
      addDebugLog(`📝 Phase 4: Final document formatting...`);

      const allText = accumulatedResults.map(r => r.text || '').join('\n\n');
      
      const finalText = await ErrorRecovery.withRetry(
        () => reformatDocumentText(allText),
        'Final document formatting'
      );

      // Footnote analysis
      const footnoteRegex = /<fn>.*?<\/fn>|{{footnote\d+.*?}}/g;
      const footnoteMatches = finalText.match(footnoteRegex) || [];
      const uniqueFootnotes = new Set(footnoteMatches);
      
      const footnotePages: number[] = [];
      accumulatedResults.forEach(result => {
        if (result.text && footnoteRegex.test(result.text)) {
          footnotePages.push(result.pageNumber);
        }
      });

      const footnoteData: FootnoteAnalysisResult = {
        count: uniqueFootnotes.size,
        pages: footnotePages
      };

      setFootnoteAnalysis(footnoteData);
      setFormattedText(finalText);
      setIsReformatting(false);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      setProcessingTime(totalTime);

      // Save final session
      saveSession({ 
        formattedText: finalText,
        footnoteAnalysis: footnoteData,
        currentPhase: 4
      });

      addDebugLog(`🎉 Processing completed in ${Math.round(totalTime / 1000)}s`);
      addDebugLog(`📊 Final stats: ${finalText.length} chars, ${footnoteData.count} footnotes`);

      updateProgress(numPages, numPages, 'Completed', 'Processing finished successfully');

      // Clear session after successful completion
      setTimeout(() => {
        ProcessingStorage.clearSession();
      }, 5000); // Keep for 5 seconds for review

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
      addDebugLog(`❌ Error: ${errorMessage}`);
      
      // Save error state
      saveSession({ currentPhase: -1 });
      
      throw error;
    } finally {
      setIsProcessing(false);
      setIsReformatting(false);
    }
  }, [
    addDebugLog, 
    updateProgress, 
    saveSession, 
    clear, 
    isPaused
  ]);

  return {
    results,
    debugLogs,
    isProcessing,
    isReformatting,
    isPaused,
    formattedText,
    progress,
    error,
    footnoteAnalysis,
    processingTime,
    canShowRecovery,
    
    // Actions
    processPdf,
    clear,
    restoreSession,
    discardSession: () => {
      ProcessingStorage.clearSession();
      setCanShowRecovery(false);
    },
    pauseProcessing,
    resumeProcessing
  };
};
