import { useState, useEffect, useCallback } from 'react';
import { DebugClient } from '../services/debugClient';

export const useDebugLogs = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const debug = DebugClient.getInstance();

  const fetchLogs = useCallback(async () => {
    try {
      console.log('Tentando buscar logs do servidor debug...');
      const response = await debug.getLogs({ limit: 10 }); // Últimos 10 logs
      console.log('Resposta do servidor:', response);
      
      if (response?.logs) {
        const formattedLogs = response.logs.map((log: any) => 
          `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level.toUpperCase()}: ${log.message}`
        );
        setLogs(formattedLogs);
      } else {
        setLogs(['ℹ️ Nenhum log encontrado no servidor']);
      }
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
      setLogs([
        '❌ Erro ao conectar com servidor de debug',
        '🔧 Verifique se o servidor backend está rodando na porta 3001',
        `⚠️ Erro detalhado: ${error instanceof Error ? error.message : String(error)}`
      ]);
    }
  }, [debug]);

  // Buscar logs a cada 2 segundos
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return { logs, refreshLogs: fetchLogs };
};
