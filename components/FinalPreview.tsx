import React from 'react';

interface FinalPreviewProps {
  text: string;
}

export const FinalPreview: React.FC<FinalPreviewProps> = ({ text }) => {
  return (
    <div className="w-full h-full overflow-auto">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
};