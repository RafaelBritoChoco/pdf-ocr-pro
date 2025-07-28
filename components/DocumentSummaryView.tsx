import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { DocumentSummary, analyzeDocumentStructure } from '../services/documentAnalyzer';
import { Download, ChevronDown, ChevronRight, X } from './icons';

interface DocumentSummaryViewProps {
  text: string;
  fileName?: string;
}

export const DocumentSummaryView: React.FC<DocumentSummaryViewProps> = ({ text, fileName }) => {
  const [excludeAnnexes, setExcludeAnnexes] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [customExclusions, setCustomExclusions] = useState<Set<string>>(new Set());

  // Analyze the document structure
  const documentSummary: DocumentSummary = useMemo(() => {
    return analyzeDocumentStructure(text);
  }, [text]);

  const { sections, annexes, mainContent, statistics } = documentSummary;

  // Generate filtered text
  const getFilteredText = () => {
    const lines = text.split('\n');
    const filteredLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      let shouldExclude = false;
      
      // Check if line is in an excluded section
      for (const section of sections) {
        const isInSection = lineNumber >= section.startLine && lineNumber <= section.endLine;
        const isExcluded = (excludeAnnexes && section.type === 'annex') || customExclusions.has(section.id);
        
        if (isInSection && isExcluded) {
          shouldExclude = true;
          break;
        }
      }
      
      if (!shouldExclude) {
        filteredLines.push(lines[i]);
      }
    }
    
    return filteredLines.join('\n');
  };

  const downloadFilteredText = () => {
    const filteredText = getFilteredText();
    const blob = new Blob([filteredText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate descriptive filename based on what was filtered
    const baseFileName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document';
    let filename = baseFileName;
    const modifications = [];
    
    if (excludeAnnexes && annexes.length > 0) {
      modifications.push(`without_${annexes.length}_annexes`);
    }
    
    if (customExclusions.size > 0) {
      modifications.push(`without_${customExclusions.size}_sections`);
    }
    
    if (modifications.length > 0) {
      filename += '_' + modifications.join('_and_');
    } else {
      filename += '_complete';
    }
    
    a.download = filename + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleSectionExpansion = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleCustomExclusion = (sectionId: string) => {
    const newExclusions = new Set(customExclusions);
    if (newExclusions.has(sectionId)) {
      newExclusions.delete(sectionId);
    } else {
      newExclusions.add(sectionId);
    }
    setCustomExclusions(newExclusions);
  };

  const totalExclusions = (excludeAnnexes ? annexes.length : 0) + customExclusions.size;

  return (
    <div className="w-full h-full space-y-4">
      {/* File Info Header */}
      {fileName && (
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                {fileName.replace(/\.pdf$/i, '')}
              </h2>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Original PDF document processed and ready for filtering
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{sections.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Sections</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">{mainContent.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Main</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{annexes.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Annexes</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
            {Math.round(statistics.totalWords / 1000)}K
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Words</div>
        </Card>
      </div>

      {/* Quick Controls */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Document Filtering</h3>
          <Button onClick={downloadFilteredText} size="sm">
            <Download className="w-4 h-4 mr-2" />
            Download Filtered
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeAnnexes}
              onChange={(e) => setExcludeAnnexes(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium">Exclude all annexes ({annexes.length})</span>
          </label>
          
          {totalExclusions > 0 && (
            <span className="text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded">
              {totalExclusions} section(s) excluded
            </span>
          )}
        </div>
      </Card>

      {/* Sections List */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-200">Document Structure</h3>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {sections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const isCustomExcluded = customExclusions.has(section.id);
            const isAnnexExcluded = excludeAnnexes && section.type === 'annex';
            const isExcluded = isCustomExcluded || isAnnexExcluded;
            
            return (
              <div key={section.id} className={`border rounded p-2 transition-all ${
                isExcluded 
                  ? 'opacity-50 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' 
                  : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      onClick={() => toggleSectionExpansion(section.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    
                    <span className={`px-2 py-1 rounded text-xs font-semibold shrink-0 ${
                      section.type === 'annex' 
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200'
                        : section.type === 'heading'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                    }`}>
                      {section.type.toUpperCase()}
                    </span>
                    
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {section.title}
                    </span>
                    
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      ({section.wordCount}w)
                    </span>
                  </div>
                  
                  {section.type !== 'annex' && (
                    <button
                      onClick={() => toggleCustomExclusion(section.id)}
                      className={`p-1 rounded shrink-0 ${
                        isCustomExcluded 
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500'
                      }`}
                      title={isCustomExcluded ? 'Include section' : 'Exclude section'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {isExpanded && (
                  <div className="mt-2 ml-6 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>Lines {section.startLine} - {section.endLine}</div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded max-h-20 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-xs">
                        {section.content.substring(0, 300)}
                        {section.content.length > 300 ? '...' : ''}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
