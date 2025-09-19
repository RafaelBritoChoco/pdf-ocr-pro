/**
 * Banner discreto para mostrar a origem da extração (Docling vs pdf.js)
 */
import React, { useState, useEffect } from 'react';

interface ExtractionBannerProps {
  source?: 'docling' | 'pdfjs' | null;
  className?: string;
}

export function ExtractionBanner({ source, className = '' }: ExtractionBannerProps) {
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    try {
      const setting = localStorage.getItem('show_extraction_banner');
      setShowBanner(setting === '1' || setting === 'true');
    } catch {
      setShowBanner(false);
    }
  }, []);

  if (!showBanner || !source) return null;

  const isDocling = source === 'docling';
  const bgColor = isDocling ? 'bg-green-600' : 'bg-orange-600';
  const icon = isDocling ? '🚀' : '📄';
  const text = isDocling ? 'Extraído via Docling' : 'Extraído via pdf.js (fallback local)';

  return (
    <div className={`${bgColor} text-white text-sm px-3 py-1 text-center flex items-center justify-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1">
        <span>{icon}</span>
        <span>{text}</span>
      </span>
      <button
        onClick={() => {
          setShowBanner(false);
          try {
            localStorage.setItem('show_extraction_banner', '0');
          } catch {}
        }}
        className="ml-2 text-white hover:bg-black/20 rounded px-1 text-xs"
        aria-label="Ocultar banner"
      >
        ✕
      </button>
    </div>
  );
}