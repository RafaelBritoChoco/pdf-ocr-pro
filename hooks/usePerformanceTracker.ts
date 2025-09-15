import { useState, useRef, useCallback, useEffect } from 'react';

export const usePerformanceTracker = () => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [apiCalls, setApiCalls] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startTimer = useCallback(() => {
    if (isRunning) return;
    startTimeRef.current = Date.now() - elapsedTime * 1000;
    setIsRunning(true);
  }, [isRunning, elapsedTime]);

  const stopTimer = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setElapsedTime(0);
    setApiCalls(0);
  }, []);

  const incrementApiCalls = useCallback(() => {
    setApiCalls(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }, 100); // Update every 100ms for smoother display
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  return {
    elapsedTime,
    apiCalls,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
    incrementApiCalls,
  };
};