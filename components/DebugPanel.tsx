import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { useDebugClient } from '../services/debugClient';
import { Card } from './ui/Card';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DebugPanel({ isOpen, onClose }: DebugPanelProps) {
  const debug = useDebugClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'errors' | 'status'>('logs');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(refreshData, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  useEffect(() => {
    // Rola para o final quando novos logs são adicionados
    if (isOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const refreshData = async () => {
    try {
      const [logsData, errorsData, statusData] = await Promise.all([
        debug.getLogs({ limit: 50 }),
        debug.getErrors(20),
        debug.getStatus()
      ]);
      
      setLogs(logsData?.logs || []);
      setErrors(errorsData?.errors || []);
      setStatus(statusData);
    } catch (error) {
      console.error('Failed to refresh debug data:', error);
    }
  };

  const clearLogs = async () => {
    await debug.clearLogs();
    refreshData();
  };

  const clearErrors = async () => {
    await debug.clearErrors();
    refreshData();
  };

  const clearAll = async () => {
    await debug.clearAll();
    refreshData();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <Card className="w-11/12 h-5/6 bg-white flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">Debug Panel</h2>
          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-sm"
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </Button>
            <Button onClick={refreshData} className="text-sm">
              Refresh
            </Button>
            <Button 
              onClick={clearAll} 
              variant="outline" 
              className="text-sm bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
            >
              🗑️ Limpar Tudo
            </Button>
            <Button onClick={onClose} variant="outline" className="text-sm">
              ×
            </Button>
          </div>
        </div>

        <div className="flex border-b">
          <button
            className={`px-4 py-2 ${activeTab === 'logs' ? 'bg-blue-100 border-b-2 border-blue-500' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Logs ({logs.length})
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'errors' ? 'bg-red-100 border-b-2 border-red-500' : ''}`}
            onClick={() => setActiveTab('errors')}
          >
            Errors ({errors.length})
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'status' ? 'bg-green-100 border-b-2 border-green-500' : ''}`}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'logs' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Application Logs</h3>
                <Button onClick={clearLogs} variant="outline" className="text-sm">
                  Clear Logs
                </Button>
              </div>
              <div className="space-y-2 font-mono text-sm">
                {logs.map((log, i) => (
                  <div key={i} className={`p-2 rounded border-l-4 ${
                    log.level === 'error' ? 'border-red-500 bg-red-50' :
                    log.level === 'warn' ? 'border-yellow-500 bg-yellow-50' :
                    log.level === 'debug' ? 'border-gray-500 bg-gray-50' :
                    'border-blue-500 bg-blue-50'
                  }`}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>[{log.level.toUpperCase()}] {log.source}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="font-medium">{log.message}</div>
                    {log.data && (
                      <pre className="mt-1 text-xs bg-white p-2 rounded overflow-auto max-h-20">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'errors' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Application Errors</h3>
                <Button onClick={clearErrors} variant="outline" className="text-sm">
                  Clear Errors
                </Button>
              </div>
              <div className="space-y-2 font-mono text-sm">
                {errors.map((error, i) => (
                  <div key={i} className="p-2 rounded border-l-4 border-red-500 bg-red-50">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>ERROR</span>
                      <span>{new Date(error.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="font-medium text-red-800">{error.error}</div>
                    {error.stack && (
                      <pre className="mt-1 text-xs bg-white p-2 rounded overflow-auto max-h-32">
                        {error.stack}
                      </pre>
                    )}
                    {error.context && (
                      <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-20">
                        {JSON.stringify(error.context, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div>
              <h3 className="font-semibold mb-4">Server Status</h3>
              {status && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h4 className="font-medium mb-2">Server Info</h4>
                      <div className="text-sm space-y-1">
                        <div>Uptime: {status.server?.uptime || 'N/A'}</div>
                        <div>Version: {status.server?.version || 'N/A'}</div>
                        <div>Platform: {status.server?.platform || 'N/A'}</div>
                      </div>
                    </Card>
                    <Card className="p-4">
                      <h4 className="font-medium mb-2">Logs Summary</h4>
                      <div className="text-sm space-y-1">
                        <div>Total: {status.logs?.total || 0}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Info: {status.logs?.byLevel?.info || 0}</div>
                          <div>Warn: {status.logs?.byLevel?.warn || 0}</div>
                          <div>Error: {status.logs?.byLevel?.error || 0}</div>
                          <div>Debug: {status.logs?.byLevel?.debug || 0}</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                  <Card className="p-4">
                    <h4 className="font-medium mb-2">Recent Errors</h4>
                    <div className="text-sm space-y-1 max-h-40 overflow-auto">
                      {status.errors?.recent?.map((error: any, i: number) => (
                        <div key={i} className="p-2 bg-red-50 rounded text-xs">
                          <div className="font-medium">{error.error}</div>
                          <div className="text-gray-600">
                            {new Date(error.timestamp).toLocaleString()}
                          </div>
                        </div>
                      )) || <div className="text-gray-500">No recent errors</div>}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
