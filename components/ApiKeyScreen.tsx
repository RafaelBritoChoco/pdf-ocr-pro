import React, { useState, useEffect } from 'react';

interface ApiKeyScreenProps {
  onSave: (data: { provider: string; geminiKey: string; openRouterKey: string; qwenModel: string; }) => void;
}

const DEFAULT_QWEN_MODEL = 'qwen/qwen-2.5-7b-instruct';

export const ApiKeyScreen: React.FC<ApiKeyScreenProps> = ({ onSave }) => {
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [openRouterKey, setOpenRouterKey] = useState(() => localStorage.getItem('openrouter_api_key') || '');
  const [provider, setProvider] = useState<string>(() => localStorage.getItem('ai_provider') || (geminiKey ? 'gemini' : 'openrouter'));
  const [show, setShow] = useState<{ gemini: boolean; open: boolean }>({ gemini: false, open: false });
  const [qwenModel, setQwenModel] = useState(() => localStorage.getItem('qwen_model') || DEFAULT_QWEN_MODEL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (geminiKey.trim()) localStorage.setItem('gemini_api_key', geminiKey.trim());
  }, [geminiKey]);
  useEffect(() => {
    if (openRouterKey.trim()) localStorage.setItem('openrouter_api_key', openRouterKey.trim());
  }, [openRouterKey]);
  useEffect(() => { localStorage.setItem('ai_provider', provider); }, [provider]);
  useEffect(() => { localStorage.setItem('qwen_model', qwenModel); }, [qwenModel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (provider === 'gemini' && !geminiKey.trim()) {
      setError('Informe a chave Gemini.');
      return;
    }
    if (provider === 'openrouter' && !openRouterKey.trim()) {
      setError('Informe a chave OpenRouter.');
      return;
    }
    setError(null);
    onSave({ provider, geminiKey: geminiKey.trim(), openRouterKey: openRouterKey.trim(), qwenModel });
  };

  const handleClear = () => {
    if (provider === 'gemini') {
      setGeminiKey('');
      localStorage.removeItem('gemini_api_key');
    } else {
      setOpenRouterKey('');
      localStorage.removeItem('openrouter_api_key');
    }
  };

  return (
    <div className="w-full max-w-xl p-8 bg-gray-800 rounded-xl shadow-2xl flex flex-col space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-white text-center">Configurar Chaves de API</h2>
      <p className="text-gray-400 text-sm text-center">As chaves ficam somente no seu navegador (localStorage).</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Provedor Ativo</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="radio" name="provider" value="gemini" checked={provider==='gemini'} onChange={() => setProvider('gemini')} /> Gemini
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="radio" name="provider" value="openrouter" checked={provider==='openrouter'} onChange={() => setProvider('openrouter')} /> OpenRouter (Qwen)
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Gemini API Key</label>
            <div className="flex items-stretch space-x-2">
              <input
                type={show.gemini ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="ex: AIzaSy..."
                className="flex-grow px-4 py-3 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                autoComplete="off"
              />
              <button type="button" onClick={() => setShow(s => ({...s, gemini: !s.gemini}))} className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 rounded-md text-gray-200">{show.gemini ? 'Ocultar' : 'Ver'}</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">OpenRouter API Key</label>
            <div className="flex items-stretch space-x-2">
              <input
                type={show.open ? 'text' : 'password'}
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                placeholder="ex: sk-or-v1-..."
                className="flex-grow px-4 py-3 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                autoComplete="off"
              />
              <button type="button" onClick={() => setShow(s => ({...s, open: !s.open}))} className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 rounded-md text-gray-200">{show.open ? 'Ocultar' : 'Ver'}</button>
            </div>
          </div>
          {provider === 'openrouter' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Modelo Qwen (OpenRouter)</label>
              <input
                type="text"
                value={qwenModel}
                onChange={(e) => setQwenModel(e.target.value)}
                className="w-full px-4 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
              />
              <p className="text-xs text-gray-500 mt-1">Exemplo: qwen/qwen-2.5-7b-instruct (padrão). Pode usar outro modelo disponível na OpenRouter.</p>
            </div>
          )}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md text-sm"
          >
            Limpar
          </button>
          <button
            type="submit"
            disabled={provider==='gemini' ? !geminiKey.trim() : !openRouterKey.trim()}
            className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-900 text-white rounded-md font-semibold transition-colors"
          >
            Salvar e Continuar
          </button>
        </div>
      </form>
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-gray-400 mb-1">Como obter chaves?</summary>
        <p>Gemini: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-teal-400 underline">Google AI Studio</a></p>
        <p>OpenRouter: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-teal-400 underline">OpenRouter Keys</a></p>
      </details>
    </div>
  );
};
