import { useEffect } from 'react';

interface AutoResumeDialogProps {
  isOpen: boolean;
  processInfo: {
    fileName: string;
    progress: number;
    lastStep: string;
    timestamp: number;
  } | null;
  onResume: () => void;
  onDismiss: () => void;
}

export const AutoResumeDialog = ({ isOpen, processInfo, onResume, onDismiss }: AutoResumeDialogProps) => {
  // Auto-dismiss após 30 segundos se não interagir
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, [isOpen, onDismiss]);

  if (!isOpen || !processInfo) return null;

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `há ${hours}h${minutes % 60}min`;
    } else if (minutes > 0) {
      return `há ${minutes} minutos`;
    } else {
      return 'há pouco tempo';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700">
        {/* Ícone de processo interrompido */}
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Título */}
        <h3 className="text-xl font-bold text-center text-slate-900 dark:text-slate-100 mb-2">
          Processo Interrompido Detectado
        </h3>

        {/* Informações do processo */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Arquivo:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-48">
              {processInfo.fileName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Progresso:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {processInfo.progress} páginas processadas
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Última fase:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {processInfo.lastStep}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Interrompido:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatTime(processInfo.timestamp)}
            </span>
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors duration-200"
          >
            Ignorar
          </button>
          <button
            onClick={onResume}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8M7 7h10a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
            </svg>
            Retomar Processo
          </button>
        </div>

        {/* Aviso de auto-dismiss */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
          Este diálogo será fechado automaticamente em 30 segundos
        </p>
      </div>
    </div>
  );
};
