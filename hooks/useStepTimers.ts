import { useState, useCallback, useEffect, useRef } from 'react';

export interface StepTimer {
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  duration: number;
  isActive: boolean;
  elapsedTime: number;
}

export interface TimerStats {
  totalTime: number;
  activeStep: string | null;
  steps: Record<string, StepTimer>;
  averages: Record<string, number>;
}

export const useStepTimers = (
  initialTimers: Record<string, StepTimer> = {},
  initialTotalElapsed: number = 0
) => {
  const [timers, setTimers] = useState<Record<string, StepTimer>>(initialTimers);
  const [totalStartTime, setTotalStartTime] = useState<number | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(initialTotalElapsed);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Find the active timer from the initial state
  useEffect(() => {
    const currentActiveStep = Object.keys(timers).find(key => timers[key].isActive);
    if (currentActiveStep) {
      setActiveStep(currentActiveStep);
    }
  }, [timers]);

  // Update elapsed times in real-time
  useEffect(() => {
    const hasActiveTimers = Object.values(timers).some(timer => timer.isActive);
    if (hasActiveTimers || totalStartTime) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        
        setTimers(prevTimers => {
          const updated = { ...prevTimers };
          Object.keys(updated).forEach(key => {
            if (updated[key].isActive && updated[key].startTime) {
              updated[key].elapsedTime = now - updated[key].startTime!;
            }
          });
          return updated;
        });

        if (totalStartTime) {
          setTotalElapsed(now - totalStartTime);
        }
      }, 100); // Update every 100ms for fluidity

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [timers, totalStartTime]);

  const startTotal = useCallback(() => {
    const now = Date.now();
    setTotalStartTime(now);
    setTotalElapsed(0);
  }, []);

  const stopTotal = useCallback(() => {
    if (totalStartTime) {
      setTotalElapsed(Date.now() - totalStartTime);
    }
    setTotalStartTime(null);
    setActiveStep(null);
  }, [totalStartTime]);

  const startStep = useCallback((stepId: string, stepName: string) => {
    const now = Date.now();
    
    // Parar step anterior se existir
    setTimers(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        if (updated[key].isActive) {
          updated[key].isActive = false;
          updated[key].endTime = now;
          updated[key].duration = now - (updated[key].startTime || now);
        }
      });
      return updated;
    });

    // Iniciar novo step
    setTimers(prev => ({
      ...prev,
      [stepId]: {
        id: stepId,
        name: stepName,
        startTime: now,
        endTime: null,
        duration: 0,
        isActive: true,
        elapsedTime: 0
      }
    }));
    
    setActiveStep(stepId);
  }, []);

  const stopStep = useCallback((stepId: string) => {
    const now = Date.now();
    
    setTimers(prev => {
      const timer = prev[stepId];
      if (!timer) return prev;
      
      return {
        ...prev,
        [stepId]: {
          ...timer,
          isActive: false,
          endTime: now,
          duration: timer.startTime ? now - timer.startTime : 0,
          elapsedTime: timer.startTime ? now - timer.startTime : 0
        }
      };
    });
    
    if (activeStep === stepId) {
      setActiveStep(null);
    }
  }, [activeStep]);

  const updateStepProgress = useCallback((stepId: string, progress: string) => {
    setTimers(prev => {
      const timer = prev[stepId];
      if (!timer) return prev;
      
      return {
        ...prev,
        [stepId]: {
          ...timer,
          name: `${timer.name.split(' - ')[0]} - ${progress}`
        }
      };
    });
  }, []);

  const reset = useCallback(() => {
    setTimers({});
    setTotalStartTime(null);
    setTotalElapsed(0);
    setActiveStep(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  const getStats = useCallback((): TimerStats => {
    return {
      totalTime: totalElapsed,
      activeStep,
      steps: timers,
      averages: {} // TODO: Implementar médias baseadas em histórico
    };
  }, [totalElapsed, activeStep, timers]);

  const formatTime = useCallback((milliseconds: number): string => {
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds)}ms`;
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    
    if (minutes > 0) {
      return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    
    return `${seconds}s`;
  }, []);

  const getEstimatedTimeRemaining = useCallback((currentStep: string, totalSteps: number, currentProgress: number): string => {
    const currentTimer = timers[currentStep];
    if (!currentTimer || !currentTimer.startTime || currentProgress === 0) {
      return 'Calculando...';
    }

    const elapsedInCurrentStep = Date.now() - currentTimer.startTime;
    const estimatedStepTotal = elapsedInCurrentStep / (currentProgress / 100);
    const remainingInStep = estimatedStepTotal - elapsedInCurrentStep;
    
    // Estimar baseado na média das etapas anteriores
    const completedSteps = Object.values(timers).filter(t => t.endTime && t.duration > 0);
    const avgStepTime = completedSteps.length > 0 
      ? completedSteps.reduce((sum, t) => sum + t.duration, 0) / completedSteps.length
      : estimatedStepTotal;
    
    const remainingSteps = totalSteps - Object.keys(timers).length;
    const totalRemaining = remainingInStep + (remainingSteps * avgStepTime);
    
    return formatTime(Math.max(0, totalRemaining));
  }, [timers, formatTime]);

  return {
    timers,
    totalElapsed,
    activeStep,
    startTotal,
    stopTotal,
    startStep,
    stopStep,
    updateStepProgress,
    reset,
    getStats,
    formatTime,
    getEstimatedTimeRemaining
  };
};
