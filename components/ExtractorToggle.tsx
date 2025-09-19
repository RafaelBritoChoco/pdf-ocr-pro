import React from 'react';

interface ExtractorToggleProps {
  className?: string;
}

export function ExtractorToggle({ className = '' }: ExtractorToggleProps) {
  const toggleBanner = () => {
    try {
      const current = localStorage.getItem('show_extraction_banner');
      const newValue = current === '1' ? '0' : '1';
      localStorage.setItem('show_extraction_banner', newValue);
      window.location.reload(); // Força recarregar para mostrar/ocultar banner
    } catch {}
  };

  const isEnabled = (() => {
    try {
      return localStorage.getItem('show_extraction_banner') === '1';
    } catch {
      return false;
    }
  })();

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        <p className="font-medium text-sm text-gray-200">Banner de origem</p>
        <p className="text-xs text-gray-400">Mostra se o texto veio do Docling ou pdf.js</p>
      </div>
      <button
        type="button"
        onClick={toggleBanner}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
          isEnabled ? 'bg-teal-600' : 'bg-gray-600'
        }`}
        aria-pressed={isEnabled}
        aria-label="Alternar banner de origem"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            isEnabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}