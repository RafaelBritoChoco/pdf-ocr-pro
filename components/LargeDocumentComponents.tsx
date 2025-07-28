import React from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { RefreshCw, X, FileText, Clock } from './icons';
import { ProcessingStorage } from '../services/largeDocumentProcessor';

interface RecoveryBannerProps {
  onRestore: () => void;
  onDiscard: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({ onRestore, onDiscard }) => {
  const sessionInfo = ProcessingStorage.getSessionInfo();
  
  if (!sessionInfo) return null;

  return (
    <Card className="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
            <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
              Resume Processing?
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Found incomplete processing of <strong>{sessionInfo.fileName}</strong> ({sessionInfo.progress}% complete)
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={onRestore}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Resume
          </Button>
          <Button 
            onClick={onDiscard}
            variant="outline" 
            size="sm"
            className="text-gray-600 hover:text-gray-800"
          >
            <X className="w-4 h-4 mr-2" />
            Start Fresh
          </Button>
        </div>
      </div>
    </Card>
  );
};

interface LargeDocumentWarningProps {
  pageCount: number;
  fileSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LargeDocumentWarning: React.FC<LargeDocumentWarningProps> = ({ 
  pageCount, 
  fileSize, 
  onConfirm, 
  onCancel 
}) => {
  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb * 10) / 10} MB`;
  };

  const estimatedTime = Math.ceil(pageCount / 20); // Rough estimate: 20 pages per minute

  return (
    <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        
        <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Large Document Detected
        </h3>
        
        <p className="text-blue-700 dark:text-blue-300 mb-6">
          This document has <strong>{pageCount} pages</strong> ({formatFileSize(fileSize)})
        </p>
        
        <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-blue-800 dark:text-blue-200">
              Estimated Processing Time: {estimatedTime} minutes
            </span>
          </div>
          
          <ul className="text-sm text-blue-700 dark:text-blue-300 text-left space-y-1">
            <li>• Processing will continue even if you refresh the page</li>
            <li>• You can pause and resume at any time</li>
            <li>• Memory usage will be optimized automatically</li>
            <li>• Progress will be saved continuously</li>
          </ul>
        </div>
        
        <div className="flex justify-center gap-4">
          <Button 
            onClick={onConfirm}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            Start Processing
          </Button>
          <Button 
            onClick={onCancel}
            variant="outline"
            className="px-6"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
};

interface EnhancedProgressProps {
  processed: number;
  total: number;
  phase: string;
  phaseProgress: string;
  eta?: string;
  speed?: number;
  elapsed?: string;
  canPause?: boolean;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

export const EnhancedProgress: React.FC<EnhancedProgressProps> = ({
  processed,
  total,
  phase,
  phaseProgress,
  eta,
  speed,
  elapsed,
  canPause = false,
  isPaused = false,
  onPause,
  onResume
}) => {
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Main progress bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {phase}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {percentage}%
            </span>
          </div>
          
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {phaseProgress}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {processed}/{total}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Pages</div>
          </div>
          
          {elapsed && (
            <div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {elapsed}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Elapsed</div>
            </div>
          )}
          
          {eta && (
            <div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {eta}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">ETA</div>
            </div>
          )}
          
          {speed && (
            <div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {speed}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Pages/sec</div>
            </div>
          )}
        </div>

        {/* Pause/Resume controls */}
        {canPause && (
          <div className="flex justify-center">
            {isPaused ? (
              <Button onClick={onResume} size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Resume Processing
              </Button>
            ) : (
              <Button onClick={onPause} size="sm" variant="outline">
                Pause Processing
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
