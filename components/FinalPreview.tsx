
import React from 'react';
import { Button } from './ui/Button';

interface FinalPreviewProps {
  text: string;
}

export const FinalPreview: React.FC<FinalPreviewProps> = ({ text }) => {
  
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    // Add a visual indicator for copy success if desired
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold dark:text-slate-100">Resultado Final</h3>
           <Button variant="outline" size="sm" onClick={handleCopy}>
              Copiar Texto
           </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Abaixo está o texto final processado pela IA. Você pode revisar, copiar ou fazer o download como um arquivo .txt.
      </p>
      <div className="flex-grow bg-slate-50 dark:bg-slate-900/50 rounded-md ring-1 ring-slate-200 dark:ring-slate-700 h-[50vh] min-h-[300px]">
        <textarea
          readOnly
          className="w-full h-full p-4 bg-transparent border-0 resize-none focus:ring-0 text-sm font-sans dark:text-slate-300"
          value={text}
        />
      </div>
    </div>
  );
};
