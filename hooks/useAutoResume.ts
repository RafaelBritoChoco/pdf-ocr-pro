import { useState, useEffect, useCallback } from 'react';

export interface AutoResumeState {
  hasIncompleteProcess: boolean;
  processInfo: {
    fileName: string;
    progress: number;
    lastStep: string;
    timestamp: number;
  } | null;
}

/**
 * Hook que detecta automaticamente processos incompletos e permite retomá-los
 */
export const useAutoResume = () => {
  const [autoResumeState, setAutoResumeState] = useState<AutoResumeState>({
    hasIncompleteProcess: false,
    processInfo: null
  });

  const [showResumeDialog, setShowResumeDialog] = useState(false);

  /**
   * Verifica se há processos incompletos salvos no localStorage
   */
  const checkForIncompleteProcess = useCallback(() => {
    try {
      const savedState = window.localStorage.getItem('pdfProcessState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        
        // Verifica se há um processo que não foi finalizado
        if (parsed.processData && !parsed.processData.isCompleted && parsed.processData.isProcessing) {
          const processInfo = {
            fileName: parsed.fileInfo?.name || 'Arquivo desconhecido',
            progress: parsed.processData.progress?.processed || 0,
            lastStep: parsed.processData.progress?.phase || 'Desconhecido',
            timestamp: parsed.timestamp || Date.now()
          };

          setAutoResumeState({
            hasIncompleteProcess: true,
            processInfo
          });

          // Mostra o diálogo automaticamente após 1 segundo
          setTimeout(() => {
            setShowResumeDialog(true);
            
            // Auto-resume: Automaticamente tenta continuar o processamento após 3 segundos
            setTimeout(async () => {
              try {
                // Tenta continuar automaticamente
                console.log('🔄 [AUTO-RESUME] Iniciando continuação automática...');
                
                // Trigger de auto-resume - dispara um evento customizado
                const autoResumeEvent = new CustomEvent('autoResumeProcess', {
                  detail: { processInfo }
                });
                window.dispatchEvent(autoResumeEvent);
                
              } catch (error) {
                console.error('Erro no auto-resume:', error);
              }
            }, 3000);
          }, 1000);

          return true;
        }
      }
    } catch (error) {
      console.error('Erro ao verificar processo incompleto:', error);
    }

    setAutoResumeState({
      hasIncompleteProcess: false,
      processInfo: null
    });

    return false;
  }, []);

  /**
   * Marca um processo como finalizado para evitar auto-resume
   */
  const markProcessAsCompleted = useCallback(() => {
    try {
      const savedState = window.localStorage.getItem('pdfProcessState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.processData) {
          parsed.processData.isCompleted = true;
          parsed.processData.isProcessing = false;
          window.localStorage.setItem('pdfProcessState', JSON.stringify(parsed));
        }
      }
    } catch (error) {
      console.error('Erro ao marcar processo como finalizado:', error);
    }
  }, []);

  /**
   * Remove o estado de processo incompleto
   */
  const dismissIncompleteProcess = useCallback(() => {
    setAutoResumeState({
      hasIncompleteProcess: false,
      processInfo: null
    });
    setShowResumeDialog(false);
  }, []);

  /**
   * Verifica automaticamente ao carregar a página
   */
  useEffect(() => {
    // Aguarda um pouco para a página carregar completamente
    const timer = setTimeout(() => {
      checkForIncompleteProcess();
    }, 500);

    return () => clearTimeout(timer);
  }, [checkForIncompleteProcess]);

  return {
    autoResumeState,
    showResumeDialog,
    setShowResumeDialog,
    checkForIncompleteProcess,
    markProcessAsCompleted,
    dismissIncompleteProcess
  };
};
