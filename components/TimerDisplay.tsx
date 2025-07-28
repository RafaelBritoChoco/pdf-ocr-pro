import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Clock, ChevronDown, ChevronRight } from './icons';
import type { StepTimer } from '../hooks/useStepTimers';

interface TimerDisplayProps {
  totalElapsed: number;
  activeStep: string | null;
  timers: Record<string, StepTimer>;
  formatTime: (ms: number) => string;
  estimatedTimeRemaining?: string;
  showInHeader?: boolean;
}

export function TimerDisplay({ 
  totalElapsed, 
  activeStep, 
  timers, 
  formatTime, 
  estimatedTimeRemaining,
  showInHeader = false 
}: TimerDisplayProps) {
  const [expanded, setExpanded] = useState(true);

  if (showInHeader) {
    // Versão compacta para o header
    return (
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-mono font-medium text-blue-800 dark:text-blue-200">
            {formatTime(totalElapsed)}
          </span>
        </div>
        
        {activeStep && timers[activeStep] && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 dark:text-green-300 text-xs">
              {timers[activeStep].name.split(' - ')[0]}
            </span>
            <span className="font-mono text-green-800 dark:text-green-200">
              {formatTime(timers[activeStep].elapsedTime)}
            </span>
          </div>
        )}
        
        {estimatedTimeRemaining && (
          <div className="text-slate-500 dark:text-slate-400 text-xs">
            ETA: {estimatedTimeRemaining}
          </div>
        )}
      </div>
    );
  }

  // Versão completa para o painel detalhado
  return (
    <Card className="w-full">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Cronômetro de Processamento
          </h3>
          <Button
            onClick={() => setExpanded(!expanded)}
            className="p-1 h-auto text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>

        {/* Tempo Total */}
        <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-blue-700 dark:text-blue-300 font-medium">Tempo Total</span>
            <span className="font-mono text-xl font-bold text-blue-800 dark:text-blue-200">
              {formatTime(totalElapsed)}
            </span>
          </div>
          {estimatedTimeRemaining && (
            <div className="mt-1 text-sm text-blue-600 dark:text-blue-400">
              Tempo estimado restante: {estimatedTimeRemaining}
            </div>
          )}
        </div>

        {expanded && (
          <div className="space-y-3">
            {Object.values(timers).map((timer) => (
              <div
                key={timer.id}
                className={`p-3 rounded-lg border transition-all ${
                  timer.isActive
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : timer.endTime
                    ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {timer.isActive && (
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    )}
                    <span className={`font-medium ${
                      timer.isActive 
                        ? 'text-green-800 dark:text-green-200'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {timer.name}
                    </span>
                  </div>
                  <span className={`font-mono font-bold ${
                    timer.isActive 
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {formatTime(timer.isActive ? timer.elapsedTime : timer.duration)}
                  </span>
                </div>
                
                {timer.isActive && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    Processando...
                  </div>
                )}
                
                {timer.endTime && !timer.isActive && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Concluído em {formatTime(timer.duration)}
                  </div>
                )}
              </div>
            ))}

            {Object.keys(timers).length === 0 && (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                Nenhuma etapa iniciada ainda
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// Componente específico para mostrar timer na tile de cada etapa
interface StepTimerBadgeProps {
  stepId: string;
  timers: Record<string, StepTimer>;
  formatTime: (ms: number) => string;
  isActive: boolean;
  isCompleted: boolean;
}

export function StepTimerBadge({ stepId, timers, formatTime, isActive, isCompleted }: StepTimerBadgeProps) {
  const timer = timers[stepId];
  
  if (!timer && !isActive) return null;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
      isActive
        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
        : isCompleted
        ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
    }`}>
      <Clock className="w-3 h-3" />
      <span className="font-mono">
        {timer ? formatTime(timer.isActive ? timer.elapsedTime : timer.duration) : '0s'}
      </span>
      {isActive && <div className="w-1 h-1 bg-current rounded-full animate-pulse"></div>}
    </div>
  );
}
