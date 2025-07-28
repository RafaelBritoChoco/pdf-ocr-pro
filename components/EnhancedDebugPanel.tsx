import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { AlertCircle, Eye, Search } from './icons';

interface EnhancedDebugPanelProps {
  debugLogs: string[];
  results: any[];
  isProcessing: boolean;
}

export function EnhancedDebugPanel({ debugLogs, results, isProcessing }: EnhancedDebugPanelProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'analysis' | 'pages'>('logs');
  const [minimized, setMinimized] = useState(false);

  // Análise dos logs para detectar problemas OCR
  const ocrAnalysis = {
    pagesAnalyzed: results.length,
    ocrPages: results.filter(r => r.method === 'AI OCR').length,
    correctionPages: results.filter(r => r.method === 'AI Correction').length,
    quickTextPages: results.filter(r => r.method === 'Quick Text').length,
    errorPages: results.filter(r => r.status === 'Error').length
  };

  // Detectar se houve problemas de OCR baseado nos logs
  const ocrIssues = debugLogs.filter(log => 
    log.includes('No text extracted') || 
    log.includes('Nenhum texto') ||
    log.includes('páginas needing correction: []') ||
    log.includes('no AI correction needed')
  );

  const detectionProblems = debugLogs.filter(log =>
    log.includes('problematicPages') || 
    log.includes('critério adicional') ||
    log.includes('análise local')
  );

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button 
          onClick={() => setMinimized(false)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg"
        >
          <Eye className="w-4 h-4 mr-2" />
          Debug Panel
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[70vh] z-50">
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl">
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4" />
            Debug Panel
          </h3>
          <Button 
            onClick={() => setMinimized(true)}
            className="p-1 h-auto"
          >
            ✕
          </Button>
        </div>

        {/* Análise Rápida OCR */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">OCR Status</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${ocrAnalysis.ocrPages > 0 ? 'bg-purple-500' : 'bg-slate-300'}`}></div>
              <span>OCR: {ocrAnalysis.ocrPages}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${ocrAnalysis.correctionPages > 0 ? 'bg-yellow-500' : 'bg-slate-300'}`}></div>
              <span>Correção: {ocrAnalysis.correctionPages}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${ocrAnalysis.quickTextPages > 0 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
              <span>Rápido: {ocrAnalysis.quickTextPages}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${ocrAnalysis.errorPages > 0 ? 'bg-red-500' : 'bg-slate-300'}`}></div>
              <span>Erros: {ocrAnalysis.errorPages}</span>
            </div>
          </div>
          
          {/* Alertas de problemas OCR */}
          {ocrIssues.length > 0 && (
            <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Possível problema OCR detectado</span>
              </div>
            </div>
          )}
          
          {ocrAnalysis.ocrPages === 0 && results.length > 0 && !isProcessing && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-1 text-red-700 dark:text-red-300 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Nenhuma página processada com OCR!</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          {[
            { id: 'logs', label: 'Logs', count: debugLogs.length },
            { id: 'analysis', label: 'Análise', count: detectionProblems.length },
            { id: 'pages', label: 'Páginas', count: results.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              {tab.label} {tab.count > 0 && <span className="ml-1 bg-slate-200 dark:bg-slate-600 px-1 rounded">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Conteúdo das tabs */}
        <div className="p-3 max-h-64 overflow-y-auto text-xs">
          {activeTab === 'logs' && (
            <div className="space-y-1">
              {debugLogs.slice(-20).map((log, index) => (
                <div 
                  key={index} 
                  className={`font-mono p-1 rounded text-xs ${
                    log.includes('ERROR') || log.includes('❌') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                    log.includes('WARNING') || log.includes('⚠️') ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' :
                    log.includes('SUCCESS') || log.includes('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' :
                    'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-2">
              <div>
                <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-1">Detecção de Problemas</h5>
                {detectionProblems.length > 0 ? (
                  detectionProblems.map((log, index) => (
                    <div key={index} className="text-slate-600 dark:text-slate-400 mb-1">{log}</div>
                  ))
                ) : (
                  <div className="text-slate-500 dark:text-slate-500 italic">Nenhum log de detecção encontrado</div>
                )}
              </div>
              
              {ocrIssues.length > 0 && (
                <div>
                  <h5 className="font-medium text-red-700 dark:text-red-300 mb-1">Problemas OCR</h5>
                  {ocrIssues.map((issue, index) => (
                    <div key={index} className="text-red-600 dark:text-red-400 mb-1">{issue}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="space-y-1">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded">
                  <span className="font-medium">Página {result.pageNumber}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1 rounded ${
                      result.method === 'AI OCR' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' :
                      result.method === 'AI Correction' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                      'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                    }`}>
                      {result.method || 'Quick Text'}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {result.text?.length || 0} chars
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
