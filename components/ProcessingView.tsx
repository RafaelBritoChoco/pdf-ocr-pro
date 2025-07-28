import React, { useState } from 'react';
import type { ExtractionResult } from '../types';
import { PageStatus } from '../types';
import { Card } from './ui/Card';
import { SearchCheck, Bot } from './icons';

export interface ProcessingViewProps {
  results: ExtractionResult[];
  isProcessing: boolean;
  isReformatting: boolean;
  progress: { processed: number; total: number; phase: string; phaseProgress: string };
  error: string | null;
  processingMessage?: string | null;
  reformattingTimer?: number;
  footnoteAnalysis?: { count: number; pages: number[] } | null;
}

const getStatusColor = (status: PageStatus) => {
  switch (status) {
    case PageStatus.COMPLETED:
      return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
    case PageStatus.PROCESSING:
      return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 animate-pulse';
    case PageStatus.CORRECTING:
      return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 animate-pulse';
    case PageStatus.ERROR:
      return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
    default:
      return 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
  }
};


export const ProcessingView: React.FC<ProcessingViewProps> = ({ 
  results, 
  isProcessing, 
  isReformatting, 
  progress, 
  error,
  processingMessage,
  reformattingTimer = 0,
  footnoteAnalysis
}) => {
  const [selectedPage, setSelectedPage] = useState<number>(1);
  
  const currentResult = results.find(r => r.pageNumber === selectedPage);

  // Helper function to format timer
  const formatTimer = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getProcessingMessage = () => {
    if (processingMessage) {
      return processingMessage;
    }
    if (isReformatting) {
      const timerDisplay = reformattingTimer > 0 ? ` (${formatTimer(reformattingTimer)})` : '';
      return `Phase 4: Formatting final document...${timerDisplay}`;
    }
    if (isProcessing) {
      return progress.phase;
    }
    return "Processing completed";
  };

  const getProgressPercentage = () => {
    if (isReformatting) return 95;
    if (progress.total === 0) return 0;
    
    const baseProgress = (progress.processed / progress.total) * 80; // 80% for extraction/correction
    const pagesCorrecting = results.filter(r => r.status === PageStatus.CORRECTING || r.status === PageStatus.PROCESSING).length;
    
    if (pagesCorrecting === 0 && progress.processed === progress.total) {
      return 85; // Analysis phase
    }
    return baseProgress;
  };

  // Vista 1: Análise inicial do PDF (quando não há resultados ainda)
  if (results.length === 0 && isProcessing) {
    return (
      <div className="w-full text-center">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary-500 mx-auto"></div>
        <p className="mt-4 text-lg font-medium dark:text-slate-200">Analisando o PDF...</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Isso pode levar alguns instantes.</p>
      </div>
    );
  }

  // Vista 2: Análise de notas de rodapé (step 3)
  if (isProcessing && progress.phase.includes('Analyzing') && footnoteAnalysis !== undefined) {
    return (
      <div className="w-full text-center flex flex-col items-center justify-center">
        <SearchCheck className="w-16 h-16 text-primary-500" />
        <p className="mt-4 text-lg font-medium dark:text-slate-200">Analyzing Footnotes...</p>
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400 min-h-[42px]">
          {footnoteAnalysis && footnoteAnalysis.count > 0 && (
            <div className="animate-fade-in">
              <p><strong>{footnoteAnalysis.count}</strong> notes found on pages: {footnoteAnalysis.pages.join(', ')}.</p>
              <p className="mt-1">Continuing to final formatting...</p>
            </div>
          )}
          {footnoteAnalysis && footnoteAnalysis.count === 0 && (
            <div className="animate-fade-in">
              <p>No footnotes found.</p>
              <p className="mt-1">Proceeding to finalization...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Vista 3: Finalização com IA (step 4 - isReformatting)
  if (isReformatting) {
    return (
      <div className="w-full text-center flex flex-col items-center justify-center">
        <Bot className="w-16 h-16 text-primary-500 animate-bounce" />
        <p className="mt-4 text-lg font-medium dark:text-slate-200">
          Finalizing with AI...
          {reformattingTimer > 0 && (
            <span className="ml-2 text-primary-600 dark:text-primary-400 font-mono">
              ({formatTimer(reformattingTimer)})
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gathering text, removing artifacts and formatting the final document.
        </p>
      </div>
    );
  }

  // Vista 4: Vista principal com lista de páginas (processamento normal)

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6">
      {/* Sidebar with page list */}
      <aside className="w-full lg:w-1/4 xl:w-1/5">
        <h3 className="text-lg font-semibold mb-3 px-2 dark:text-slate-100">Páginas</h3>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
          {results.map(result => (
            <button
              key={result.pageNumber}
              onClick={() => setSelectedPage(result.pageNumber)}
              className={`w-full text-left p-2 rounded-md transition-colors flex justify-between items-center ${selectedPage === result.pageNumber ? 'bg-primary-100 dark:bg-primary-900/60 text-primary-800 dark:text-primary-100' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 dark:text-slate-300'}`}
            >
              <span className="font-medium text-sm truncate pr-2">Página {result.pageNumber}</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                  {result.changes && result.status === PageStatus.COMPLETED && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full" title="AI made modifications to this page"></span>
                  )}
                  {result.method && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        result.method === 'AI OCR' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200' :
                        result.method === 'AI Correction' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200' :
                        'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200'
                    }`}>
                        {result.method}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold w-[125px] text-center ${getStatusColor(result.status)}`}>
                    {result.status}
                  </span>
              </div>
            </button>
          ))}
        </div>
        {isProcessing && (
            <div className="mt-4 px-2">
                <p className="text-sm font-medium dark:text-slate-200">{getProcessingMessage()}</p>
                {progress.phaseProgress && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{progress.phaseProgress}</p>
                )}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                    <div 
                      className="bg-primary-500 h-2.5 rounded-full transition-all duration-300" 
                      style={{ width: `${getProgressPercentage()}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>{progress.processed}/{progress.total} páginas</span>
                  <span>{Math.round(getProgressPercentage())}%</span>
                </div>
            </div>
        )}
      </aside>

      {/* Main content view */}
      <main className="w-full lg:w-3/4 xl:w-4/5">
        {currentResult ? (
          <div className="space-y-4 h-[70vh] overflow-auto">
            {/* Top row: PDF and Extracted Text */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[45vh]">
              {/* PDF Page Image */}
              <Card className="flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-semibold dark:text-slate-100">Original (Página {currentResult.pageNumber})</h4>
                </div>
                <div className="p-4 flex-grow overflow-auto bg-slate-50 dark:bg-slate-800/50">
                  {currentResult.imageUrl ? (
                    <img src={currentResult.imageUrl} alt={`Página ${currentResult.pageNumber} do PDF`} className="w-full h-auto object-contain" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">Carregando imagem...</div>
                  )}
                </div>
              </Card>

              {/* Extracted Text */}
              <Card className="flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-semibold dark:text-slate-100">Extracted Text</h4>
                  {currentResult.method && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">({currentResult.method})</span>
                  )}
                </div>
                <div className="p-4 flex-grow overflow-auto">
                  {(currentResult.status === PageStatus.PROCESSING || currentResult.status === PageStatus.CORRECTING) && (
                       <div className="flex items-center justify-center h-full flex-col">
                          <div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-primary-500"></div>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{currentResult.status}...</p>
                      </div>
                  )}
                  {currentResult.status === PageStatus.ERROR && (
                      <div className="flex items-center justify-center h-full text-red-500">
                          <p>Failed to process this page.</p>
                      </div>
                  )}
                  {(currentResult.status === PageStatus.COMPLETED || currentResult.status === PageStatus.PENDING) && (
                      <pre className="whitespace-pre-wrap text-sm font-sans dark:text-slate-300">{currentResult.text || "No text extracted."}</pre>
                  )}
                </div>
              </Card>
            </div>

            {/* Bottom row: AI Changes */}
            {currentResult.changes && currentResult.status === PageStatus.COMPLETED && (
              <Card className="flex flex-col max-h-[20vh]">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-semibold dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    Modificações Feitas pela IA
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Summary of corrections and improvements applied to text
                  </p>
                </div>
                <div className="p-4 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm font-sans text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                    {currentResult.changes}
                  </pre>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-[70vh]">
            <p className="text-slate-500 dark:text-slate-400">Selecione uma página para ver os resultados.</p>
          </div>
        )}
        {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-md">{error}</div>}
      </main>
    </div>
  );
};