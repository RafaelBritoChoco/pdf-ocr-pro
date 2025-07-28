import { useState, useCallback, useMemo, useEffect } from 'react';
import { setRuntimeApiKey, llmService } from './services/llmClient';
import { PdfDropzone } from './components/PdfDropzone';
import { ProcessingView } from './components/ProcessingView';
import { WorkflowStepper } from './components/WorkflowStepper';
import { usePdfProcessor } from './hooks/usePdfProcessor';
import { Button } from './components/ui/Button';
import { FileText, Download, Sparkles, RefreshCw } from './components/icons';
import { FinalPreview } from './components/FinalPreview';
import { Card } from './components/ui/Card';
import { DetailedStatus } from './components/DetailedStatus';
import { DebugPanel } from './components/DebugPanel';
import { AutoResumeDialog } from './components/AutoResumeDialog';
import { useAutoResume } from './hooks/useAutoResume';
import { useDebugLogs } from './hooks/useDebugLogs';
import { DebugClient } from './services/debugClient';

export default function App() {
  // Main view: 'ocr' for PDF processing app, 'api' for LLM API tester
  const [mainView, setMainView] = useState<'ocr'|'api'>('ocr');
  const [pdfApiKey, setPdfApiKey] = useState('AIzaSyClTdMj-LJS0K_Uwcmyw1PbbytaTgru_cU');
  const [debugMinimized, setDebugMinimized] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Create debug client instance
  const debugClient = useMemo(() => new DebugClient(), []);
  
  useEffect(() => {
    if (pdfApiKey) setRuntimeApiKey(pdfApiKey);
  }, [pdfApiKey]);
  
  const [file, setFile] = useState<File | null>(null);
  const { 
    results = [], 
    processPdf, 
    isProcessing,
    isReformatting,
    footnoteAnalysis,
    formattedText,
    progress, 
    error, 
    clear,
    resumeFromLocalStorage,
    continueProcessingFromState,
    processingMessage,
    reformattingTimer
  } = usePdfProcessor();

  // Auto-resume functionality
  const {
    autoResumeState,
    showResumeDialog,
    markProcessAsCompleted,
    dismissIncompleteProcess
  } = useAutoResume();
  
  // Debug logs from server
  const { logs: debugLogs } = useDebugLogs();

  // Send a test log when app loads
  useEffect(() => {
    const debug = DebugClient.getInstance();
    debug.log('info', '🚀 PDF OCR Pro iniciado', null, 'App').catch(console.error);
  }, []);
   
   const [currentStep, setCurrentStep] = useState(0);
   const [activeResultTab, setActiveResultTab] = useState('summary');

  // Component for API tester
  const ApiPage = () => {
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState<string>(() => {
      return localStorage.getItem('selectedModel') || 'gemini-2.5-flash';
    });
    const [contents, setContents] = useState('Hello world');
    const [config, setConfig] = useState('{}');
    const [response, setResponse] = useState<string>('');
    const [apiError, setApiError] = useState<string|null>(null);
    const [loading, setLoading] = useState(false);

    const callApi = async () => {
      setApiError(null);
      setResponse('');
      setLoading(true);
      // Apply API key at runtime
      setRuntimeApiKey(apiKey);
      try {
        const parsedConfig = JSON.parse(config || '{}');
        const result = await llmService.generateContent({ model, contents, config: parsedConfig });
        setResponse(result.text);
      } catch (err: any) {
        setApiError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };
    return (
      <Card className="max-w-xl mx-auto p-6 space-y-4 overflow-y-auto max-h-[70vh]">
        <h2 className="text-2xl font-bold">LLM API Tester</h2>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">API Key</label>
          <input
            className="border rounded px-3 py-2"
            type="password"
            placeholder="Enter API Key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">Model</label>
          <select
            className="border rounded px-3 py-2"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">Contents</label>
          <textarea
            className="border rounded px-3 py-2 h-24"
            value={contents}
            onChange={e => setContents(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">Config (JSON)</label>
          <textarea
            className="border rounded px-3 py-2 h-20 font-mono text-sm"
            value={config}
            onChange={e => setConfig(e.target.value)}
          />
        </div>
        <div className="flex space-x-2">
          <Button onClick={callApi} disabled={loading} className="flex-1">
            {loading ? 'Generating...' : 'Generate'}
          </Button>
          <Button variant="outline" onClick={() => {
              localStorage.setItem('selectedModel', model);
              alert('Model saved successfully!');
              setMainView('ocr');
            }} className="flex-1">
            Save Model
          </Button>
        </div>
        {apiError && (
          <Card className="bg-red-100 border-red-400 text-red-800 p-4">
            <strong>Error:</strong> {apiError}
          </Card>
        )}
        {response && (
          <Card className="bg-green-50 p-4">
            <h3 className="font-semibold mb-2">Response</h3>
            <pre className="whitespace-pre-wrap text-sm">{response}</pre>
          </Card>
        )}
      </Card>
    );
  };

  // Handle auto-resume functionality
  const handleResumeProcess = async () => {
    if (autoResumeState.processInfo) {
      try {
        await debugClient.log('info', `🔄 Tentando retomar processo para: ${autoResumeState.processInfo.fileName}`, {
          progress: autoResumeState.processInfo.progress,
          lastStep: autoResumeState.processInfo.lastStep
        });

        // Primeiro, tenta restaurar do localStorage
        const resumed = await resumeFromLocalStorage();
        if (resumed) {
          await debugClient.log('info', `✅ Estado restaurado do localStorage`);
          
          // Agora chama a continuação automática do processamento
          const savedState = localStorage.getItem('pdfProcessState');
          if (savedState) {
            const parsed = JSON.parse(savedState);
            if (parsed.fileInfo && !parsed.processData.isCompleted) {
              await debugClient.log('info', `🚀 Iniciando continuação automática do processamento...`);
              
              // Chama a função de continuação do processamento
              await continueProcessingFromState(parsed);
              
              await debugClient.log('info', `✅ Processamento continuado automaticamente!`);
              await debugClient.log('info', `📊 Progresso salvo: ${parsed.processData.progress?.processed || 0}/${parsed.processData.progress?.total || 0} páginas`);
            }
          }
        } else {
          await debugClient.log('error', '❌ Não foi possível restaurar estado do localStorage');
        }
        dismissIncompleteProcess();
      } catch (error) {
        console.error('Erro ao retomar processo:', error);
        await debugClient.log('error', `❌ Erro ao retomar processo: ${error}`);
        dismissIncompleteProcess();
      }
    }
  };

  const handleDismissResume = () => {
    dismissIncompleteProcess();
  };

  // Mark process as completed when formattedText is available
  useEffect(() => {
    if (formattedText && !error) {
      markProcessAsCompleted();
    }
  }, [formattedText, error, markProcessAsCompleted]);

   useEffect(() => {
     if (formattedText) {
       setCurrentStep(4); // Final - processo completo
     } else if (isReformatting) {
       setCurrentStep(3); // Fase 4: Formatação final
     } else if (isProcessing) {
       // Durante o processamento, vamos determinar a subfase baseado no progresso
       if (progress.processed === progress.total && progress.total > 0) {
         setCurrentStep(2); // Fase 2: Análise IA (após extração completa)
       } else {
         setCurrentStep(2); // Fase 1-3: Processamento geral
       }
     } else if (file) {
       setCurrentStep(1); // Arquivo selecionado
     } else {
       setCurrentStep(0); // Estado inicial
     }
   }, [isProcessing, isReformatting, formattedText, file, progress]);

   const handleFileSelect = useCallback((selectedFile: File) => {
     setFile(selectedFile);
     setCurrentStep(1);
     
     // Log file selection
     const debug = DebugClient.getInstance();
     debug.log('info', `📄 Arquivo selecionado: ${selectedFile.name}`, {
       size: selectedFile.size,
       type: selectedFile.type,
       lastModified: selectedFile.lastModified
     }, 'FileSelection').catch(console.error);
   }, []);

   const handleStartProcessing = useCallback(() => {
     if (file) {
       // Log processing start
       const debug = DebugClient.getInstance();
       debug.log('info', `🚀 Iniciando processamento de: ${file.name}`, {
         fileSize: file.size,
         apiKeyConfigured: !!pdfApiKey
       }, 'ProcessingStart').catch(console.error);
       
       processPdf(file);
     }
   }, [file, processPdf, pdfApiKey]);
   
   const handleReset = useCallback(() => {
     setFile(null);
     clear();
     setActiveResultTab('summary');
   },[clear]);

   const handleDownload = useCallback(() => {
     if (!formattedText) return;

     const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${file?.name.replace(/\.pdf$/i, '')}_final.txt` || 'final_document.txt';
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
   }, [formattedText, file]);

   const steps = ['Upload', 'Confirm', 'Process', 'Analyze Notes', 'Finalize', 'Download'];
  
   const pagesWithIACorrection = useMemo(() => 
       results.filter(r => r.method === 'AI Correction' || r.method === 'AI OCR').map(r => r.pageNumber)
   , [results]);

   const renderContent = () => {
     if (mainView === 'api') return <ApiPage />;
     switch (currentStep) {
       case 0:
         return <PdfDropzone onFileSelect={handleFileSelect} />;
       case 1:
         return (
           <div className="text-center w-full">
             <FileText className="mx-auto h-16 w-16 text-primary-500" />
             <h3 className="mt-2 text-lg font-medium text-slate-900 dark:text-slate-100">PDF Selected</h3>
             <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{file?.name}</p>
             <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">({(file?.size || 0) / 1024 / 1024 > 1 ? `${((file?.size || 0) / 1024 / 1024).toFixed(2)} MB` : `${((file?.size || 0) / 1024).toFixed(2)} KB`})</p>
             
             <div className="mt-8 flex justify-center gap-4">
               <Button onClick={handleReset} variant="outline">Change File</Button>
               <Button onClick={handleStartProcessing} disabled={!pdfApiKey}>
                 <Sparkles className="mr-2 h-4 w-4" />
                 Start Processing
               </Button>
             </div>
             {/* API Key requirement message */}
             {!pdfApiKey && (
               <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                 <p className="text-amber-800 dark:text-amber-200 text-sm">
                   ⚠️ Please enter your API Key above to start processing the PDF.
                 </p>
               </div>
             )}
           </div>
         );
       case 2:
       case 3:
       case 4:
         return (
           <div className="w-full space-y-6">
             <DetailedStatus
               currentStep={currentStep}
               isProcessing={isProcessing}
               isReformatting={isReformatting}
               progress={progress}
               footnoteAnalysis={footnoteAnalysis}
               pagesWithAICorrection={pagesWithIACorrection}
               debugLogs={debugLogs}
             />
             <ProcessingView 
               results={results} 
               isProcessing={isProcessing}
               isReformatting={isReformatting}
               progress={progress} 
               error={error}
               processingMessage={processingMessage}
               reformattingTimer={reformattingTimer}
               footnoteAnalysis={footnoteAnalysis}
             />
           </div>
         );
       case 5:
         return (
            <div className="w-full h-full flex flex-col">
               <div className="border-b border-slate-200 dark:border-slate-700 mb-4">
                 <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                   <button
                     onClick={() => setActiveResultTab('summary')}
                     className={`${ activeResultTab === 'summary' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none`}
                   >
                     Processing Summary
                   </button>
                   <button
                     onClick={() => setActiveResultTab('final')}
                     className={`${ activeResultTab === 'final' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none`}
                   >
                     Final Text
                   </button>
                   <button
                     onClick={() => setActiveResultTab('debug')}
                     className={`${ activeResultTab === 'debug' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                   >
                     Debug Logs
                   </button>
                 </nav>
               </div>
               
               <div className="flex-grow min-h-[55vh]">
                 {activeResultTab === 'summary' && (
                   <div className="w-full h-full flex flex-col gap-6 text-sm animate-fade-in">
                       <Card className="p-4">
                           <h4 className="font-semibold text-base mb-2 text-slate-800 dark:text-slate-100">AI Correction Procedure</h4>
                           <p className="text-slate-600 dark:text-slate-400">
                               The document was processed with an optimized strategy for speed and precision, using the <strong className="text-slate-900 dark:text-slate-200">Gemini 2.5 Flash</strong> model.
                           </p>
                           <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-600 dark:text-slate-400">
                                <li><strong>Quick Extraction:</strong> All text was initially extracted from the PDF's text layer for maximum speed.</li>
                                <li><strong>Intelligent Analysis:</strong> AI analyzed the complete document to identify pages with likely extraction errors (e.g., broken tables, missing text).</li>
                                 {pagesWithIACorrection.length > 0 && 
                                   <li><strong>Targeted Correction:</strong> Pages <strong className="text-slate-800 dark:text-slate-100">{pagesWithIACorrection.join(', ')}</strong> were reprocessed with AI to ensure maximum fidelity.</li>
                                 }
                                <li><strong>Footnote Analysis:</strong>
                                   {footnoteAnalysis && footnoteAnalysis.count > 0 ? (
                                       <span> The system identified and marked <strong className="text-slate-800 dark:text-slate-100">{footnoteAnalysis.count}</strong> footnotes for formatting.</span>
                                   ) : (
                                       <span> No footnotes were detected in the document.</span>
                                   )}
                               </li>
                               <li><strong>Final Formatting:</strong> Text from all pages was consolidated, cleaned and reformatted by AI to generate the final document structure.</li>
                           </ul>
                       </Card>
                   </div>
                 )}
                 {activeResultTab === 'final' && formattedText && <FinalPreview text={formattedText} />}
                 {activeResultTab === 'debug' && (
                   <pre className="whitespace-pre-wrap bg-gray-100 p-4 overflow-auto h-full">{debugLogs.join('\n')}</pre>
                 )}
               </div>
           </div>
         );
       default:
         return null;
     }
   };

  return (
    <>
      {/* Navigation between OCR app and LLM API tester */}
      <div className="flex space-x-4 mb-4">
        <button onClick={() => setMainView('ocr')} className="btn">OCR App</button>
        <button onClick={() => setMainView('api')} className="btn">LLM API</button>
      </div>
      {mainView === 'ocr' ? (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
          <div className="w-full max-w-7xl mx-auto">
            <header className="text-center mb-6">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                PDF OCR Pro
              </h1>
              <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
                Extract and format documents from PDFs with precision.
              </p>
            </header>
            {/* API Key for PDF processing */}
            <div className="mb-6 flex flex-col items-center">
              <input
                className="border rounded px-3 py-2 w-80"
                type="password"
                placeholder="Enter Google Gemini API Key"
                value={pdfApiKey}
                onChange={e => setPdfApiKey(e.target.value)}
              />
              {!pdfApiKey && (
                <p className="text-red-600 text-sm mt-1">Please enter your Gemini API Key to process the PDF.</p>
              )}
            </div>
            <main className="w-full">
              <WorkflowStepper steps={steps} currentStep={currentStep} />
              <div className="mt-8 bg-white dark:bg-slate-800/50 rounded-xl shadow-lg p-6 min-h-[400px] flex flex-col justify-center items-center ring-1 ring-slate-200 dark:ring-slate-700">
                {renderContent()}
              </div>
              {currentStep === 5 && (
                <div className="mt-8 flex justify-center gap-4">
                  <Button onClick={handleReset} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Process New PDF
                  </Button>
                  <Button onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Final .txt
                  </Button>
                </div>
              )}
            </main>
            <footer className="text-center mt-12 text-sm text-slate-500 dark:text-slate-400">
              <p>&copy; {new Date().getFullYear()} PDF OCR Pro. Built with React & Gemini.</p>
            </footer>
          </div>
        </div>
      ) : (
        <ApiPage />
      )}
      
      {/* Debug Panel Overlay */}
      <DebugPanel 
        isOpen={showDebugPanel} 
        onClose={() => setShowDebugPanel(false)} 
      />
      
      {/* Persistent debug panel always visible at the bottom */}
      <div className={`fixed bottom-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 border-t z-50 transition-all duration-300 ${debugMinimized ? 'h-12' : 'h-64'}`}>
        <div className="flex justify-between items-center p-3">
          <h3 className="font-semibold text-sm">Debug Logs</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setDebugMinimized(!debugMinimized)}
              className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
            >
              {debugMinimized ? '▲ Expand' : '▼ Minimize'}
            </button>
          </div>
        </div>
        {!debugMinimized && (
          <div className="px-4 pb-6 overflow-auto" style={{ height: '220px' }}>
            <pre className="text-sm whitespace-pre-wrap leading-relaxed">{debugLogs.join('\n')}</pre>
          </div>
        )}
      </div>

      {/* Auto Resume Dialog */}
      <AutoResumeDialog
        isOpen={showResumeDialog}
        processInfo={autoResumeState.processInfo}
        onResume={handleResumeProcess}
        onDismiss={handleDismissResume}
      />
    </>
  );
}
