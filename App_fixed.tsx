import { useState, useCallback, useMemo, useEffect } from 'react';
import { setRuntimeApiKey, llmService } from './services/llmClient';
import { PdfDropzone } from './components/PdfDropzone';
import { ProcessingView } from './components/ProcessingView';
import { WorkflowStepper } from './components/WorkflowStepper';
import { usePdfProcessor } from './hooks/usePdfProcessor';
import { Button } from './components/ui/Button';
import { FileText, Download, Sparkles, RefreshCw, RotateCcw, Bot } from './components/icons';
import { FinalPreview } from './components/FinalPreview';
import { Card } from './components/ui/Card';
import { DetailedStatus, DebugPanel, AutoResumeDialog } from './components/MockComponents';
import { useAutoResume, useDebugLogs } from './hooks/MockHooks';
import { DebugClient } from './services/debugClient';
import { PageStatus } from './services/debugClient';

export default function App() {
  // Main view: 'ocr' for PDF processing app, 'api' for LLM API tester
  const [mainView, setMainView] = useState<'ocr'|'api'>('ocr');
  const [pdfApiKey, setPdfApiKey] = useState('');
  const [debugMinimized, setDebugMinimized] = useState(false);
  
  useEffect(() => {
    if (pdfApiKey) setRuntimeApiKey(pdfApiKey);
  }, [pdfApiKey]);
  
  const [file, setFile] = useState<File | null>(null);
  const { 
    results, 
    processPdf, 
    isProcessing,
    isAnalyzingFootnotes,
    isReformatting,
    footnoteAnalysis,
    formattedText,
    progress, 
    error, 
    clear,
    debugLogs
  } = usePdfProcessor();
   
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
        setResponse(result.response.text || '');
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
            <option value="gemini-1.5-flash-002">Gemini 1.5 Flash 002</option>
            <option value="gemini-1.5-pro-002">Gemini 1.5 Pro 002</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">Contents</label>
          <textarea
            className="border rounded px-3 py-2 h-24"
            placeholder="Enter your prompt"
            value={contents}
            onChange={e => setContents(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 font-medium">Config (JSON)</label>
          <textarea
            className="border rounded px-3 py-2 h-16"
            placeholder="{}"
            value={config}
            onChange={e => setConfig(e.target.value)}
          />
        </div>
        <Button onClick={callApi} disabled={loading || !apiKey}>
          {loading ? 'Loading...' : 'Call API'}
        </Button>
        {apiError && (
          <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700">
            Error: {apiError}
          </div>
        )}
        {response && (
          <div className="flex flex-col">
            <label className="mb-1 font-medium">Response</label>
            <textarea
              className="border rounded px-3 py-2 h-32"
              readOnly
              value={response}
            />
          </div>
        )}
      </Card>
    );
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setCurrentStep(1);
  }, []);

  const handleStartProcessing = useCallback(() => {
    if (file) {
      processPdf(file, false);
    }
  }, [file, processPdf]);
  
  const handleReset = useCallback(() => {
    setFile(null);
    clear();
    setActiveResultTab('summary');
  },[clear]);

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
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Please configure your API key to start processing.
                </p>
              </div>
            )}
          </div>
        );
      case 2:
      case 3:
        return (
          <div className="w-full space-y-6">
            <ProcessingView 
              results={results} 
              isProcessing={isProcessing}
              isReformatting={isReformatting}
              progress={progress} 
              error={error}
            />
          </div>
        );
      case 4:
        return (
           <div className="w-full text-center flex flex-col items-center justify-center">
              <Bot className="w-16 h-16 text-primary-500 animate-bounce" />
              <p className="mt-4 text-lg font-medium dark:text-slate-200">Finalizing with AI...</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Gathering text, removing artifacts and formatting the final document.</p>
          </div>
        );
      case 5:
        return (
           <div className="w-full h-full flex flex-col">
              <div className="border-b border-slate-200 dark:border-slate-700 mb-4">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                  <button
                    onClick={() => setActiveResultTab('summary')}
                    className={`${ activeResultTab === 'summary' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setActiveResultTab('formatted')}
                    className={`${ activeResultTab === 'formatted' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                  >
                    Formatted Text
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
                            The AI processing has analyzed and corrected the extracted text from your PDF document.
                          </p>
                      </Card>
                  </div>
                )}
                {activeResultTab === 'formatted' && formattedText && (
                  <FinalPreview text={formattedText} />
                )}
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
            {!pdfApiKey && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">API Key Required</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                      Please enter your API key to use the PDF processing features.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="password"
                      placeholder="Enter API Key"
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      value={pdfApiKey}
                      onChange={(e) => setPdfApiKey(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {renderContent()}
          </div>
        </div>
      ) : (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
          <ApiPage />
        </div>
      )}
    </>
  );
}