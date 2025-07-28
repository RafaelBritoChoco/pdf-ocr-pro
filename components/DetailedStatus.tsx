import { Card } from './ui/Card';
import { CheckCircle, Clock, AlertCircle, Zap, Brain, FileText } from './icons';
import { StepTimerBadge } from './TimerDisplay';
import type { StepTimer } from '../hooks/useStepTimers';

export interface DetailedStatusProps {
  currentStep: number;
  isProcessing: boolean;
  isReformatting: boolean;
  progress: { processed: number; total: number; phase: string; phaseProgress: string };
  footnoteAnalysis?: any;
  pagesWithAICorrection: number[];
  debugLogs: string[]; // Adicionando debug logs para determinar fase atual
  timers?: Record<string, StepTimer>;
  formatTime?: (ms: number) => string;
}

export function DetailedStatus({
  currentStep,
  isProcessing,
  isReformatting,
  progress,
  pagesWithAICorrection,
  debugLogs,
  timers = {},
  formatTime = (ms) => `${Math.round(ms/1000)}s`
}: DetailedStatusProps) {
  
  // Determinar a fase atual baseado nos logs mais recentes
  const getCurrentPhase = () => {
    const recentLogs = debugLogs.slice(-10).join(' ');
    
    if (isReformatting || recentLogs.includes('Phase 4') || recentLogs.includes('🎨')) {
      return 4;
    }
    if (recentLogs.includes('Phase 3') || recentLogs.includes('⚡')) {
      return 3;
    }
    if (recentLogs.includes('Phase 2') || recentLogs.includes('🧠')) {
      return 2;
    }
    if (isProcessing || recentLogs.includes('Phase 1') || recentLogs.includes('🚀')) {
      return 1;
    }
    return 0;
  };

  const currentPhase = getCurrentPhase();
  const phases = [
    {
      id: 1,
      name: "Text Extraction",
      icon: FileText,
      description: "Extracting text from PDF pages using built-in text layer",
      status: currentPhase > 1 ? 'completed' : (currentPhase === 1 ? 'active' : 'pending'),
      details: progress.phaseProgress || `${progress.processed}/${progress.total} pages processed`
    },
    {
      id: 2,
      name: "AI Analysis",
      icon: Brain,
      description: "AI analyzing document to identify pages with extraction errors",
      status: currentPhase > 2 ? 'completed' : (currentPhase === 2 ? 'active' : 'pending'),
      details: pagesWithAICorrection.length > 0 ? `${pagesWithAICorrection.length} pages need AI correction` : "All pages extracted cleanly"
    },
    {
      id: 3,
      name: "AI Correction",
      icon: Zap,
      description: "Reprocessing problematic pages with AI for maximum accuracy",
      status: currentPhase > 3 ? 'completed' : (currentPhase === 3 ? 'active' : 'pending'),
      details: pagesWithAICorrection.length > 0 ? `Pages ${pagesWithAICorrection.join(', ')} corrected` : "No corrections needed"
    },
    {
      id: 4,
      name: "Final Formatting",
      icon: CheckCircle,
      description: "AI consolidating and formatting the complete document",
      status: currentPhase > 4 ? 'completed' : (currentPhase === 4 || isReformatting ? 'active' : 'pending'),
      details: "Cleaning text, removing artifacts, applying final structure"
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'active':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'pending':
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700';
      default:
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">
        Processing Status - Behind the Scenes
      </h3>
      <div className="space-y-4">
        {phases.map((phase) => {
          const Icon = phase.icon;
          return (
            <div
              key={phase.id}
              className={`p-4 border rounded-lg transition-all duration-300 ${getStatusColor(phase.status)}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(phase.status)}
                </div>
                <div className="flex-grow">
                  <div className="flex items-center space-x-2 mb-1">
                    <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <h4 className="font-medium text-slate-800 dark:text-slate-100">
                      Phase {phase.id}: {phase.name}
                    </h4>
                    <StepTimerBadge 
                      stepId={`phase${phase.id}`}
                      timers={timers}
                      formatTime={formatTime}
                      isActive={phase.status === 'active'}
                      isCompleted={phase.status === 'completed'}
                    />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    {phase.description}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 font-mono">
                    {phase.details}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Current Activity Indicator */}
      <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <h4 className="font-medium text-slate-800 dark:text-slate-100 mb-2">Current Activity</h4>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {isReformatting && "AI is formatting the final document..."}
            {isProcessing && "Processing pages and analyzing content..."}
            {!isProcessing && !isReformatting && currentStep < 4 && "Ready to process"}
            {currentStep === 4 && "Processing complete!"}
          </span>
        </div>
      </div>
    </Card>
  );
}
