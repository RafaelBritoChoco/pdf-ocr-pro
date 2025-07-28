// Sistema de logging global para capturar todas as atividades do programa
import { debugClient } from './debugClient';

export class GlobalLogger {
  private static instance: GlobalLogger;
  private isInitialized = false;

  static getInstance(): GlobalLogger {
    if (!GlobalLogger.instance) {
      GlobalLogger.instance = new GlobalLogger();
    }
    return GlobalLogger.instance;
  }

  // Inicializa todos os sistemas de monitoramento
  initialize() {
    if (this.isInitialized) return;
    
    try {
      this.setupLocalStorageMonitoring();
      this.setupPerformanceMonitoring();
      this.setupUserInteractionLogging();
      this.setupStateChangeMonitoring();
      
      this.isInitialized = true;
      debugClient.log('info', '🚀 Sistema de logging global inicializado (modo seguro)', {
        timestamp: new Date().toISOString(),
        features: ['localStorage', 'performance', 'userInteraction', 'stateChange']
      }, 'global-logger');
    } catch (error) {
      console.error('Erro ao inicializar GlobalLogger:', error);
    }
  }

  // Monitora mudanças no localStorage
  private setupLocalStorageMonitoring() {
    try {
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      const originalClear = localStorage.clear;

      localStorage.setItem = function(key: string, value: string) {
        try {
          debugClient.log('info', `💾 localStorage.setItem: ${key}`, {
            key,
            valueLength: value.length,
            valuePreview: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
            timestamp: new Date().toISOString()
          }, 'localStorage');
        } catch (e) {
          console.warn('Error logging localStorage.setItem:', e);
        }
        
        return originalSetItem.call(this, key, value);
      };

      localStorage.removeItem = function(key: string) {
        try {
          debugClient.log('info', `🗑️ localStorage.removeItem: ${key}`, {
            key,
            timestamp: new Date().toISOString()
          }, 'localStorage');
        } catch (e) {
          console.warn('Error logging localStorage.removeItem:', e);
        }
        
        return originalRemoveItem.call(this, key);
      };

      localStorage.clear = function() {
        try {
          debugClient.log('info', '🧹 localStorage.clear() chamado', {
            keysCleared: Object.keys(localStorage).length,
            timestamp: new Date().toISOString()
          }, 'localStorage');
        } catch (e) {
          console.warn('Error logging localStorage.clear:', e);
        }
        
        return originalClear.call(this);
      };
    } catch (error) {
      console.warn('Erro no setupLocalStorageMonitoring:', error);
    }
  }

  // Monitora performance da aplicação
  private setupPerformanceMonitoring() {
    // Monitora uso de memória (quando disponível)
    setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        debugClient.log('debug', '📊 Memory Usage', {
          used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
          timestamp: new Date().toISOString()
        }, 'performance');
      }
    }, 30000); // A cada 30 segundos

    // Monitora navegação
    window.addEventListener('beforeunload', () => {
      debugClient.log('info', '👋 Usuário saindo da aplicação', {
        timestamp: new Date().toISOString(),
        sessionDuration: Date.now() - performance.timeOrigin
      }, 'navigation');
    });
  }

  // Monitora interações do usuário
  private setupUserInteractionLogging() {
    try {
      // Clicks (com throttling para evitar spam)
      let lastClickTime = 0;
      document.addEventListener('click', (event) => {
        const now = Date.now();
        if (now - lastClickTime < 1000) return; // Throttle de 1 segundo
        lastClickTime = now;
        
        const target = event.target as HTMLElement;
        debugClient.log('debug', `👆 Click: ${target.tagName}`, {
          tagName: target.tagName,
          className: target.className,
          id: target.id,
          textContent: target.textContent?.substring(0, 50),
          timestamp: new Date().toISOString()
        }, 'user-interaction');
      });
    } catch (error) {
      console.warn('Erro no setupUserInteractionLogging:', error);
    }
  }

  // Monitora mudanças de estado da aplicação
  private setupStateChangeMonitoring() {
    // Monitora mudanças de visibilidade da página
    document.addEventListener('visibilitychange', () => {
      debugClient.log('info', `👁️ Page visibility: ${document.visibilityState}`, {
        visibilityState: document.visibilityState,
        timestamp: new Date().toISOString()
      }, 'app-state');
    });

    // Monitora mudanças online/offline
    window.addEventListener('online', () => {
      debugClient.log('info', '🌐 Aplicação está ONLINE', {
        timestamp: new Date().toISOString()
      }, 'app-state');
    });

    window.addEventListener('offline', () => {
      debugClient.log('warn', '📵 Aplicação está OFFLINE', {
        timestamp: new Date().toISOString()
      }, 'app-state');
    });
  }

  // Log customizado para eventos específicos da aplicação
  logAppEvent(eventName: string, data?: any) {
    debugClient.log('info', `🎯 App Event: ${eventName}`, {
      eventName,
      data,
      timestamp: new Date().toISOString()
    }, 'app-event');
  }

  // Log para operações de arquivo
  logFileOperation(operation: string, filename: string, details?: any) {
    debugClient.log('info', `📄 File ${operation}: ${filename}`, {
      operation,
      filename,
      details,
      timestamp: new Date().toISOString()
    }, 'file-operation');
  }

  // Log para processamento de PDF
  logPdfProcessing(phase: string, progress?: number, details?: any) {
    debugClient.log('info', `📑 PDF Processing - ${phase}`, {
      phase,
      progress,
      details,
      timestamp: new Date().toISOString()
    }, 'pdf-processing');
  }
}

// Instância global
export const globalLogger = GlobalLogger.getInstance();
