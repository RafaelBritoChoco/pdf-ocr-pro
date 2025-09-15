import React, { useState, useEffect } from 'react';
import { ProcessingState } from '../types';

interface ProcessingIndicatorProps {
  state: ProcessingState.EXTRACTING | ProcessingState.CLEANING | ProcessingState.OCR;
  progress: number;
  totalPages?: number;
}

const stateConfig = {
  [ProcessingState.EXTRACTING]: {
    title: 'Extracting Text from PDF',
    messages: [
      "Initializing extraction process...",
      "Analyzing PDF structure...",
      "Extracting machine-readable text...",
      "Running layout analysis...",
      "Finalizing content aggregation...",
    ],
  },
  [ProcessingState.OCR]: {
    title: 'Performing OCR with AI',
    messages: [ // Fallback messages if totalPages isn't available
      "Preparing document for analysis...",
      "Sending document to vision model...",
      "Recognizing characters and words...",
      "Reconstructing text from images...",
      "Finalizing OCR results...",
    ],
  },
  [ProcessingState.CLEANING]: {
    title: 'Cleaning Text with AI',
    messages: [
      "Preparing text for AI processing...",
      "Correcting OCR errors and formatting...",
      "Reconstructing footnotes and references...",
      "Ensuring content integrity...",
      "Finalizing the cleaned document...",
    ],
  },
};

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ state, progress, totalPages }) => {
  const { title, messages } = stateConfig[state] || stateConfig[ProcessingState.EXTRACTING];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // This effect is for cycling through generic messages for non-page-based states
    if (state === ProcessingState.CLEANING) {
        setCurrentStep(0);
        const interval = setInterval(() => {
            setCurrentStep((prevStep) => (prevStep + 1) % messages.length);
        }, 1500);
        return () => clearInterval(interval);
    }
  }, [state, messages.length]);

  const getMessage = () => {
    // Provide specific, page-by-page feedback for both extraction and OCR
    if ((state === ProcessingState.EXTRACTING || state === ProcessingState.OCR) && totalPages && totalPages > 0) {
      const currentPage = Math.max(1, Math.ceil((progress / 100) * totalPages));
      const action = state === ProcessingState.OCR ? 'Analyzing' : 'Extracting text from';
      return `${action} page ${currentPage} of ${totalPages}...`;
    }
    // Fallback for Cleaning state or if totalPages is not available
    return messages[currentStep];
  }

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 space-y-6 bg-gray-800/50 rounded-xl max-w-2xl w-full">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-teal-400"></div>
      <h2 className="text-2xl font-bold text-gray-200">{title}</h2>
      <p className="text-gray-400 transition-opacity duration-500">
        {getMessage()}
      </p>
      
      <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
        <div
          className="bg-teal-400 h-2.5 rounded-full transition-all duration-300 ease-linear"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <p className="text-sm text-gray-500">
        Please wait, this may take a moment for large or complex files.
      </p>
    </div>
  );
};