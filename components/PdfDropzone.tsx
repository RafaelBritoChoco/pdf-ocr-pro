import React from 'react';

interface PdfDropzoneProps {
  onFileSelect: (file: File) => void;
}

export const PdfDropzone: React.FC<PdfDropzoneProps> = ({ onFileSelect }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div 
      className="w-full max-w-md mx-auto p-8 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-gray-400 transition-colors"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => document.getElementById('pdf-upload')?.click()}
    >
      <div className="mb-4">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        Drop your PDF here
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        or click to browse files
      </p>
      <p className="text-xs text-gray-400">
        Max file size: 200MB
      </p>
      <input
        id="pdf-upload"
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};