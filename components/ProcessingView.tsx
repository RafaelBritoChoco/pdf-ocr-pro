import React from 'react';

interface ProcessingViewProps {
  results: any[];
  isProcessing: boolean;
  isReformatting: boolean;
  progress: number;
  error?: string | null;
  processingMessage?: string;
  reformattingTimer?: number;
  footnoteAnalysis?: any;
  currentStatus?: string;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  results,
  isProcessing,
  isReformatting,
  progress,
  error,
  processingMessage,
  reformattingTimer,
  footnoteAnalysis,
  currentStatus
}) => {
  return (
    <div className="w-full space-y-4">
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Status message */}
      <div className="text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {processingMessage || (isProcessing ? 'Processing PDF...' : 'Ready')}
        </p>
        {currentStatus && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {currentStatus}
          </p>
        )}
      </div>
      
      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error occurred:</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}
      
      {/* Results display */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Processing Results
          </h3>
          <div className="space-y-1">
            {results.map((result, index) => (
              <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                Page {result.pageNumber}: {result.method} - {result.status}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Footnote analysis */}
      {footnoteAnalysis && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900">Footnote Analysis</h4>
          <p className="text-blue-700 text-sm mt-1">
            Found {footnoteAnalysis.count || 0} footnotes
          </p>
        </div>
      )}
    </div>
  );
};