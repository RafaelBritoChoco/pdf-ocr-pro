import React, { useState } from 'react';
import type { ExtractionResult } from '../types';
import { PageStatus } from '../types';
import { Card } from './ui/Card';

interface ReviewChangesProps {
  results: ExtractionResult[];
}

const getStatusColor = (status: PageStatus) => {
  switch (status) {
    case PageStatus.COMPLETED:
      return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
    case PageStatus.ERROR:
      return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
    default:
      return 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
  }
};

export const ReviewChanges: React.FC<ReviewChangesProps> = ({ results }) => {
  const [selectedPage, setSelectedPage] = useState<number>(1);
  
  const currentResult = results.find(r => r.pageNumber === selectedPage);

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6 h-full">
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
                        <span className="w-2 h-2 bg-blue-500 rounded-full" title="IA fez modificações nesta página"></span>
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
                </div>
                </button>
            ))}
            </div>
        </aside>

        {/* Main content view */}
        <main className="w-full lg:w-3/4 xl:w-4/5">
            <Card className="h-full">
            {currentResult ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[70vh]">
                {/* Image view */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg overflow-auto">
                    <h4 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-300">Original - Página {currentResult.pageNumber}</h4>
                    {currentResult.imageUrl ? (
                    <img src={currentResult.imageUrl} alt={`Página ${currentResult.pageNumber}`} className="w-full h-auto" />
                    ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">Visualização indisponível</div>
                    )}
                </div>

                {/* Text view */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg overflow-auto">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Texto Extraído e Corrigido</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(currentResult.status)}`}>
                            {currentResult.status}
                        </span>
                    </div>
                    {currentResult.changes && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/30 dark:border-blue-700/50">
                            <h5 className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-1">Resumo das alterações da IA:</h5>
                            <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">{currentResult.changes}</p>
                        </div>
                    )}
                    <pre className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{currentResult.text || 'Nenhum texto extraído.'}</pre>
                </div>
                </div>
            ) : (
                <div className="flex items-center justify-center h-full">
                <p className="text-slate-500 dark:text-slate-400">Selecione uma página para ver os detalhes</p>
                </div>
            )}
            </Card>
        </main>
    </div>
  );
};
