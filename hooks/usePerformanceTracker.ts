import { useState, useRef, useCallback, useEffect } from 'react';

// Chave usada no localStorage
const STORAGE_KEY = 'performanceTrackerState:v1';

interface PersistedState {
  startTime: number | null; // timestamp em ms quando o timer começou (se rodando)
  elapsedTime: number;      // tempo acumulado em segundos quando parado
  apiCalls: number;
  isRunning: boolean;
  savedAt: number;          // timestamp da última gravação
}

export const usePerformanceTracker = () => {
  const [elapsedTime, setElapsedTime] = useState(0); // segundos (float)
  const [apiCalls, setApiCalls] = useState(0);
  // Timer agora pode pausar: só conta quando isRunning = true
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0); // timestamp ms do início atual

  // Carrega estado persistido apenas uma vez no mount
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedState = JSON.parse(raw);
        if (data && typeof data === 'object') {
          setApiCalls(data.apiCalls || 0);
          setElapsedTime(data.elapsedTime || 0);
          if (data.isRunning && data.startTime) {
            startTimeRef.current = data.startTime;
            setIsRunning(true);
          } else {
            startTimeRef.current = Date.now();
            setIsRunning(false);
          }
          return;
        }
      }
      // Primeira vez ou falha ao restaurar
      startTimeRef.current = Date.now();
      setIsRunning(false);
      setElapsedTime(0);
    } catch (e) {
      console.warn('Falha ao restaurar performanceTrackerState', e);
      startTimeRef.current = Date.now();
      setIsRunning(true);
    }
  }, []);

  // Inicia contagem se parado
  const startTimer = useCallback(() => {
    if (!isRunning) {
      startTimeRef.current = Date.now() - elapsedTime * 1000; // retoma a partir do acumulado
      setIsRunning(true);
    }
  }, [isRunning, elapsedTime]);
  // Pausa contagem acumulando tempo
  const stopTimer = useCallback(() => {
    if (isRunning) {
      const accumulated = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(accumulated);
      setIsRunning(false);
    }
  }, [isRunning]);
  const resetTimer = useCallback(() => {
    // Mantemos possibilidade de hard reset manual se chamado explicitamente
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    setApiCalls(0);
    setIsRunning(true);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
        startTime: startTimeRef.current,
        elapsedTime: 0,
        apiCalls: 0,
        isRunning: true,
        savedAt: Date.now(),
      })); } catch {}
    }
  }, []);

  const incrementApiCalls = useCallback(() => {
    setApiCalls(prev => prev + 1);
  }, []);

  // Atualiza o elapsed em tempo real apenas enquanto isRunning
  useEffect(() => {
    if (!isRunning) return; // não atualiza quando pausado
    intervalRef.current = window.setInterval(() => {
      const newElapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(newElapsed);
    }, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  // Persiste mudanças principais (throttle simples via timeout interno)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: PersistedState = {
        startTime: isRunning ? startTimeRef.current : null,
        elapsedTime, // valor acumulado atual
        apiCalls,
        isRunning,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // Falhou ao salvar (quota / private mode). Silenciar.
    }
  }, [elapsedTime, apiCalls, isRunning]);

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