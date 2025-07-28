import { useState, useEffect, useCallback, useRef } from 'react';

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
  // Flag para prevenir execução múltipla do useEffect de inicialização
  const didMountRef = useRef(false);
  
  const [autoResumeState, setAutoResumeState] = useState<AutoResumeState>({
    hasIncompleteProcess: false,
    processInfo: null
  });

  const [showResumeDialog, setShowResumeDialog] = useState(false);

  /**
   * Verifica se há processos incompletos salvos no localStorage
   */
  const checkForIncompleteProcess = useCallback(() => {
    console.log('🔍 [AUTO-RESUME] Verificando processo incompleto no localStorage...');
    try {
      const savedState = window.localStorage.getItem('pdfProcessState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        
        // Verifica se há um processo que não foi finalizado
        if (parsed.processData && !parsed.processData.isCompleted && parsed.processData.isProcessing) {
          console.log('📋 [AUTO-RESUME] Processo incompleto encontrado:', {
            fileName: parsed.fileInfo?.name,
            progress: parsed.processData.progress?.processed,
            phase: parsed.processData.progress?.phase
          });
          
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
            console.log('💬 [AUTO-RESUME] Exibindo diálogo de retomada...');
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
        } else {
          console.log('✅ [AUTO-RESUME] Nenhum processo incompleto encontrado');
        }
      } else {
        console.log('📭 [AUTO-RESUME] localStorage vazio - nenhum estado salvo');
      }
    } catch (error) {
      console.error('❌ [AUTO-RESUME] Erro ao verificar processo incompleto:', error);
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
    console.log('🔄 [AUTO-RESUME] Fechando diálogo de retomada...');
    console.log('🔄 [AUTO-RESUME] didMountRef.current:', didMountRef.current);
    setAutoResumeState({
      hasIncompleteProcess: false,
      processInfo: null
    });
    setShowResumeDialog(false);
    console.log('✅ [AUTO-RESUME] Diálogo fechado - estado limpo');
  }, []);

  /**
   * Verifica automaticamente ao carregar a página - APENAS UMA VEZ
   * Esta proteção previne a race condition onde re-renderizações 
   * fazem com que o diálogo reapareça após ser fechado
   */
  useEffect(() => {
    // Proteção contra execução múltipla - resolve a race condition
    if (!didMountRef.current) {
      didMountRef.current = true;
      
      console.log('🔄 [AUTO-RESUME] Primeira verificação de processo incompleto...');
      
      // Aguarda um pouco para a página carregar completamente
      const timer = setTimeout(() => {
        checkForIncompleteProcess();
      }, 500);

      return () => clearTimeout(timer);
    }
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
