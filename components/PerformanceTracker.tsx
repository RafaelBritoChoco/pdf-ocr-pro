
import React from 'react';

interface PerformanceTrackerProps {
  elapsedTime: number;
  apiCalls: number;
  isVisible: boolean;
}

export const PerformanceTracker: React.FC<PerformanceTrackerProps> = ({ elapsedTime, apiCalls, isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 bg-gray-800/80 backdrop-blur-sm text-white p-3 rounded-lg shadow-lg z-50 animate-fade-in-down text-sm">
      <div className="flex flex-col items-end space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Time:</span>
          <span className="font-mono text-teal-300 w-20 text-right">{elapsedTime.toFixed(2)}s</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">API Calls:</span>
          <span className="font-mono text-sky-300 w-20 text-right">{apiCalls}</span>
        </div>
      </div>
    </div>
  );
};
