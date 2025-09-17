import React, { useState, useEffect } from 'react';

interface ApiKeyScreenProps {
  onSave: (data: { provider: string; geminiKey: string; openRouterKey: string; openRouterModel: string; }) => void;
}

// Modelo padrão antigo (Qwen) e opções adicionais incluindo Llama 3
const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen-2.5-7b-instruct';
const OPENROUTER_MODEL_OPTIONS = [
  { value: 'meta-llama/llama-3-8b-instruct', label: 'Llama 3 8B Instruct' },
  { value: 'meta-llama/llama-3-70b-instruct', label: 'Llama 3 70B Instruct' },
  { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct' },
  { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct' },
  { value: 'qwen/qwen-2.5-7b-instruct', label: 'Qwen 2.5 7B Instruct (padrão anterior)' },
  { value: 'qwen/qwen-2.5-14b-instruct', label: 'Qwen 2.5 14B Instruct' },
];

export const ApiKeyScreen: React.FC<ApiKeyScreenProps> = ({ onSave }) => {
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [openRouterKey, setOpenRouterKey] = useState(() => localStorage.getItem('openrouter_api_key') || '');
  const [provider, setProvider] = useState<string>(() => localStorage.getItem('ai_provider') || (geminiKey ? 'gemini' : 'openrouter'));
  const [show, setShow] = useState<{ gemini: boolean; open: boolean }>({ gemini: false, open: false });
  // Migração: se existir qwen_model e não openrouter_model, usar o antigo
  const legacyQwen = typeof window !== 'undefined' ? localStorage.getItem('qwen_model') : null;
  const initialModel = () => {
    const stored = (typeof window !== 'undefined' && (localStorage.getItem('openrouter_model') || '')) || '';
    if (stored) return stored;
    if (legacyQwen) return legacyQwen; // migra automaticamente
    return DEFAULT_OPENROUTER_MODEL;
  };
  const [openRouterModel, setOpenRouterModel] = useState(initialModel);
  const [error, setError] = useState<string | null>(null);
  const [doclingEndpoint, setDoclingEndpoint] = useState<string>(() => localStorage.getItem('docling_endpoint') || 'http://127.0.0.1:8008');

  useEffect(() => {
    if (geminiKey.trim()) localStorage.setItem('gemini_api_key', geminiKey.trim());
  }, [geminiKey]);
  useEffect(() => {
    if (openRouterKey.trim()) localStorage.setItem('openrouter_api_key', openRouterKey.trim());
  }, [openRouterKey]);
  useEffect(() => { localStorage.setItem('ai_provider', provider); }, [provider]);
  useEffect(() => { localStorage.setItem('openrouter_model', openRouterModel); }, [openRouterModel]);
  useEffect(() => { if (doclingEndpoint) localStorage.setItem('docling_endpoint', doclingEndpoint); }, [doclingEndpoint]);
  // Migração forward: se legacy existir e ainda não migramos, persiste no novo key
  useEffect(() => {
    try {
      if (legacyQwen && !localStorage.getItem('openrouter_model')) {
        localStorage.setItem('openrouter_model', legacyQwen);
      }
    } catch {}
  }, [legacyQwen]);

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
  onSave({ provider, geminiKey: geminiKey.trim(), openRouterKey: openRouterKey.trim(), openRouterModel });
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
              <input type="radio" name="provider" value="openrouter" checked={provider==='openrouter'} onChange={() => setProvider('openrouter')} /> OpenRouter
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Modelo OpenRouter</label>
              <select
                value={openRouterModel}
                onChange={(e) => {
                  const v = e.target.value.replace(/:free$/,'');
                  setOpenRouterModel(v);
                }}
                className="w-full px-4 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
              >
                {OPENROUTER_MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
                {!OPENROUTER_MODEL_OPTIONS.find(o => o.value === openRouterModel) && (
                  <option value={openRouterModel}>{openRouterModel} (custom)</option>
                )}
              </select>
              <p className="text-xs text-gray-500 mt-1">Selecione Llama 3.x ou Qwen. Se um modelo retornar 404, escolha outro (sua conta pode não ter acesso). Pode colar identificador custom.</p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Endpoint Docling (opcional)</label>
                <input
                  type="text"
                  value={doclingEndpoint}
                  onChange={(e) => setDoclingEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:8008"
                  className="w-full px-4 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">Se definido e o serviço estiver online, a extração inicial usará Docling (FAST → simple, QUALITY → advanced). Se estiver offline, o fluxo com OpenRouter não iniciará até o serviço estar online.</p>
              </div>
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
