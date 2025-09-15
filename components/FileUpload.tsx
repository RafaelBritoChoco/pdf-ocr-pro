
import React, { useRef, useState, useCallback } from 'react';
import { FileUploadIcon } from './icons';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

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
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      onFileSelect(file);
    } else {
      // Basic validation feedback
      alert("Please drop a PDF file.");
    }
  }, [disabled, onFileSelect]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const dragDropClasses = isDragging
    ? 'border-teal-400 bg-gray-700/50 scale-105'
    : 'border-gray-600 hover:border-teal-500 hover:bg-gray-800/50';

  return (
    <div
      className={`relative w-full max-w-2xl p-8 text-center border-2 border-dashed rounded-xl transition-all duration-300 cursor-pointer ${dragDropClasses} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="application/pdf"
        disabled={disabled}
      />
      <div className="flex flex-col items-center justify-center space-y-4">
        <FileUploadIcon className="w-16 h-16 text-gray-400" />
        <p className="text-lg font-semibold text-gray-300">
          Drag & drop your PDF here
        </p>
        <p className="text-sm text-gray-500">or click to browse files</p>
        <p className="text-xs text-gray-600 mt-2">Max file size: 200MB</p>
      </div>
    </div>
  );
};
