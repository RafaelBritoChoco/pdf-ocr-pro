// Mock hooks
import { useState } from 'react';

export const useAutoResume = () => {
  return {
    autoResumeState: null,
    showResumeDialog: false,
    markProcessAsCompleted: () => {},
    dismissIncompleteProcess: () => {}
  };
};

export const useDebugLogs = () => {
  return {
    logs: ['Debug log 1', 'Debug log 2']
  };
};