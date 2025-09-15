import React, { useState, useEffect } from 'react';
import { DownloadFormat, ProcessingState } from '../types';
import { DownloadIcon, CodeTagIcon, DocumentMagnifyingGlassIcon } from './icons';

interface ResultViewerProps {
  fileName: string;
  extractedText: string;
  textWithHeadlines: string | null;
  structuredText: string | null;
  markerStageText?: string | null;
  provider?: string;
  footnotesProcessed?: boolean;
  processingState: ProcessingState;
  progress: number;
  structuringMessage: string;
  failedChunks: number[];
  onDownload: (format: DownloadFormat, content?: string) => void;
  onConfigureFootnotes?: () => void;
  onConfigureHeadlines: () => void;
  onConfigureContent: () => void;
  onReset: () => void;
}

const LOCAL_STORAGE_KEY = 'savedExtractedText';
const TIMESTAMP_KEY = 'lastSavedTimestamp';

const DownloadButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label: string;
}> = ({ onClick, disabled = false, label }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors flex items-center space-x-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <DownloadIcon className="w-5 h-5" />
    <span>{label}</span>
  </button>
);


export const ResultViewer: React.FC<ResultViewerProps> = ({
  fileName,
  extractedText,
  textWithHeadlines,
  structuredText,
  markerStageText,
  provider,
  footnotesProcessed,
  processingState,
  progress,
  structuringMessage,
  failedChunks,
  onDownload,
  onConfigureFootnotes,
  onConfigureHeadlines,
  onConfigureContent,
  onReset,
}) => {
  const isStructuringHeadlines = processingState === ProcessingState.STRUCTURING_HEADLINES;
  const isStructuringContent = processingState === ProcessingState.STRUCTURING_CONTENT;
  const isProcessing = isStructuringHeadlines || isStructuringContent;
  
  const [editableText, setEditableText] = useState(
    () => localStorage.getItem(LOCAL_STORAGE_KEY) || extractedText
  );
  const [lastSaved, setLastSaved] = useState(
    () => localStorage.getItem(TIMESTAMP_KEY) || null
  );

  useEffect(() => {
    // If the headlines text is updated from props, update the editable text
    // This allows the user to see the result of step 1 and edit it before step 2
    if (textWithHeadlines) {
        setEditableText(textWithHeadlines);
    }
  }, [textWithHeadlines]);


  useEffect(() => {
    const handler = setTimeout(() => {
      // Save whenever the editable text changes
      localStorage.setItem(LOCAL_STORAGE_KEY, editableText);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      localStorage.setItem(TIMESTAMP_KEY, now);
      setLastSaved(now);
    }, 1000);

    return () => clearTimeout(handler);
  }, [editableText]);

  const renderStructuringProgress = (title: string) => (
    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-4">
      <div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-sky-400 mb-4"></div>
      <p className="font-semibold text-gray-300">{title}</p>
      <p className="text-sm text-gray-500 transition-opacity duration-500">
        {structuringMessage}
      </p>
      <div className="w-full max-w-xs bg-gray-700 rounded-full h-2 mt-4">
        <div
            className="bg-sky-500 h-2 rounded-full transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );

  const getViewerContent = () => {
    if (isStructuringHeadlines) {
      return renderStructuringProgress("Etapa 1: Marcando Headlines...");
    }
    if (isStructuringContent) {
        return renderStructuringProgress("Etapa 2: Marcando Conteúdo...");
    }
    const textToDisplay = structuredText ?? textWithHeadlines ?? '';
    if (textToDisplay) {
      return (
        <textarea
            readOnly
            value={textToDisplay}
            className="w-full h-full p-4 bg-gray-900 text-gray-300 border-none resize-none focus:ring-0 focus:outline-none"
        />
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
        <p>Inicie a estruturação para ver os resultados aqui.</p>
      </div>
    );
  };
  
  return (
    <div className="w-full max-w-6xl p-6 bg-gray-800 rounded-xl shadow-2xl flex flex-col space-y-6 animate-fade-in">
      <header className="flex justify-between items-center pb-4 border-b border-gray-700">
        <div>
            <h2 className="text-2xl font-bold text-white">Pronto para Estruturar</h2>
            <p className="text-sm text-gray-400">{fileName}</p>
        </div>
        <button
            onClick={onReset}
            className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-500 transition-colors"
        >
            Processar Outro Arquivo
        </button>
      </header>
      
      {failedChunks.length > 0 && (
        <div className="p-4 bg-yellow-900/40 border border-yellow-700 rounded-md text-sm text-yellow-200 animate-fade-in" role="alert">
            <h4 className="font-bold mb-1">Aviso de Processamento</h4>
            <p>A IA não conseguiu processar <span className="font-semibold">{failedChunks.length}</span> pedaço(s) do documento (números: {failedChunks.join(', ')}).</p>
            <p className="mt-1">Essas seções foram deixadas em seu estado original no texto editável abaixo e podem exigir atenção manual.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow">
        {/* Extracted Text */}
        <section className="flex flex-col space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">Conteúdo Extraído (Editável)</h3>
            {lastSaved && (
              <span className="text-xs text-gray-500 animate-fade-in">Salvo: {lastSaved}</span>
            )}
          </div>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            className="w-full h-96 p-4 bg-gray-900 text-gray-300 border border-gray-700 rounded-md resize-y focus:ring-2 focus:ring-teal-500 focus:outline-none"
            readOnly={isProcessing}
          />
        </section>

        {/* AI Structuring */}
        <section className="flex flex-col space-y-3">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-200">Estruturação com IA</h3>
                <div className="flex items-center space-x-2">
                    {provider === 'openrouter' && !footnotesProcessed && (
                      <button
                        onClick={onConfigureFootnotes}
                        disabled={isProcessing}
                        className="flex items-center space-x-2 px-3 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed transition-colors"
                      >
                        <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                        <span>Etapa Footnotes</span>
                      </button>
                    )}
          <button 
            onClick={onConfigureHeadlines} 
            disabled={isProcessing || (provider==='openrouter' && !footnotesProcessed)}
            className="flex items-center space-x-2 px-3 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 disabled:bg-sky-800 disabled:cursor-not-allowed transition-colors"
          >
                        <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                        <span>Etapa 1: Headlines</span>
                    </button>
                    <button 
                        onClick={onConfigureContent} 
                        disabled={isProcessing || !textWithHeadlines}
                        className="flex items-center space-x-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed transition-colors"
                    >
                        <CodeTagIcon className="w-4 h-4" />
                        <span>Etapa 2: Conteúdo</span>
                    </button>
                </div>
            </div>
            <div className="w-full h-96 bg-gray-900 border border-gray-700 rounded-md overflow-hidden">
                {getViewerContent()}
            </div>
        </section>
      </div>

      <footer className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-gray-700 space-y-4 sm:space-y-0">
        <p className="text-sm text-gray-400">Baixar conteúdo como .txt:</p>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
          <DownloadButton onClick={() => onDownload(DownloadFormat.CLEANED_TEXT, editableText)} label="Texto Atual Editado" />
          <DownloadButton onClick={() => onDownload(DownloadFormat.HEADLINES_ONLY)} disabled={!textWithHeadlines} label="Headlines Marcadas" />
          <DownloadButton onClick={() => onDownload(DownloadFormat.FULLY_STRUCTURED)} disabled={!structuredText} label="Estrutura Completa" />
          <DownloadButton onClick={() => onDownload(DownloadFormat.MARKER_STAGE)} disabled={!markerStageText} label="Footnotes Markers" />
        </div>
      </footer>
    </div>
  );
};