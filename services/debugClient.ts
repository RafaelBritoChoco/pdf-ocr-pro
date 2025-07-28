// Debug client para enviar logs automaticamente para o backend
export class DebugClient {
  private static instance: DebugClient;
  private baseUrl = 'http://localhost:3001/api/debug';
  private enabled = true;

  static getInstance(): DebugClient {
    if (!DebugClient.instance) {
      DebugClient.instance = new DebugClient();
    }
    return DebugClient.instance;
  }

  private async sendRequest(endpoint: string, data?: any, method: 'GET' | 'POST' | 'DELETE' = 'POST') {
    if (!this.enabled) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      clearTimeout(timeoutId);
      return await response.json();
    } catch (error) {
      console.error('Failed to send debug data:', error);
    }
  }

  // Enviar logs para o backend
  async log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any, source: string = 'frontend') {
    await this.sendRequest('/log', { level, message, data, source });
    
    // Log local também
    const logMethod = level === 'error' ? console.error : 
                     level === 'warn' ? console.warn : 
                     level === 'debug' ? console.debug : console.log;
    
    logMethod(`[${level.toUpperCase()}] ${source}: ${message}`, data || '');
  }

  // Enviar erros para o backend
  error(error: string | Error, context?: any, source: string = 'frontend') {
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    
    this.sendRequest('/error', { error: errorMessage, stack, context, source });
    console.error(`[ERROR] ${source}: ${errorMessage}`, { stack, context });
  }

  // Buscar logs do backend
  async getLogs(filters?: { level?: string; source?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.level) params.set('level', filters.level);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.limit) params.set('limit', filters.limit.toString());
    
    const query = params.toString() ? `?${params}` : '';
    return this.sendRequest(`/logs${query}`, undefined, 'GET');
  }

  // Buscar erros do backend
  async getErrors(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.sendRequest(`/errors${query}`, undefined, 'GET');
  }

  // Buscar status do servidor
  async getStatus() {
    return this.sendRequest('/status', undefined, 'GET');
  }

  // Limpar logs
  async clearLogs() {
    return this.sendRequest('/logs', undefined, 'DELETE');
  }

  // Limpar erros
  async clearErrors() {
    return this.sendRequest('/errors', undefined, 'DELETE');
  }

  // Limpar tudo (logs + errors)
  async clearAll() {
    return this.sendRequest('/all', undefined, 'DELETE');
  }

  // Interceptar erros não tratados
  setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      this.error(event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }, 'global-error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error(event.reason, {
        type: 'unhandled-promise-rejection'
      }, 'global-promise');
    });
  }

  // Habilitar/desabilitar debug
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Instância global
export const debugClient = DebugClient.getInstance();

// Hook para usar o debug client em React
import { useEffect } from 'react';

export function useDebugClient() {
  useEffect(() => {
    debugClient.setupGlobalErrorHandling();
  }, []);

  return {
    log: debugClient.log.bind(debugClient),
    error: debugClient.error.bind(debugClient),
    getLogs: debugClient.getLogs.bind(debugClient),
    getErrors: debugClient.getErrors.bind(debugClient),
    getStatus: debugClient.getStatus.bind(debugClient),
    clearLogs: debugClient.clearLogs.bind(debugClient),
    clearErrors: debugClient.clearErrors.bind(debugClient),
    clearAll: debugClient.clearAll.bind(debugClient),
  };
}
