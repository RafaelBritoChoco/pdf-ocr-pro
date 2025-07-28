
import React, { useCallback, useState } from 'react';
import { UploadCloud } from './icons';

interface PdfDropzoneProps {
  onFileSelect: (file: File) => void;
}

export const PdfDropzone: React.FC<PdfDropzoneProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Por favor, envie apenas arquivos PDF.');
      }
      e.dataTransfer.clearData();
    }
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`w-full max-w-2xl mx-auto text-center p-8 border-2 border-dashed rounded-lg transition-colors
        ${isDragging ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/50' : 'border-slate-300 dark:border-slate-600 hover:border-primary-400'}`}
    >
      <input
        id="file-upload"
        type="file"
        className="sr-only"
        accept="application/pdf"
        onChange={handleFileChange}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
        <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-200">Arraste e solte o arquivo PDF aqui</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ou</p>
        <div className="mt-2 inline-block px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 rounded-md bg-primary-500/10 hover:bg-primary-500/20">
          Escolha um arquivo do seu computador
        </div>
      </label>
    </div>
  );
};