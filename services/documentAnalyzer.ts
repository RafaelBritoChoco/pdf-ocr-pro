/**
 * Document structure analyzer - extracts headings, sections, and document structure
 * This runs as a final post-processing step without using LLM
 */

export interface DocumentSection {
  id: string;
  title: string;
  level: number; // 1 = main heading, 2 = sub-heading, etc.
  startLine: number;
  endLine: number;
  content: string;
  wordCount: number;
  type: 'heading' | 'section' | 'annex' | 'appendix' | 'chapter' | 'article' | 'other';
}

export interface DocumentSummary {
  sections: DocumentSection[];
  totalSections: number;
  annexes: DocumentSection[];
  mainContent: DocumentSection[];
  statistics: {
    totalLines: number;
    totalWords: number;
    totalCharacters: number;
  };
}

/**
 * Analyzes document structure and extracts headings and sections
 */
export function analyzeDocumentStructure(text: string): DocumentSummary {
  const lines = text.split('\n');
  const sections: DocumentSection[] = [];
  
  // Patterns for different types of headings and sections
  const patterns = {
    // Main headings (SECTION A, CHAPTER 1, PART I, etc.)
    mainHeading: /^(SECTION|CHAPTER|PART|TITLE|BOOK)\s+[A-Z0-9]+/i,
    
    // Sub-headings (Section 1.1, Article 1, etc.)
    subHeading: /^(Section|Article|Clause)\s+\d+(\.\d+)*/i,
    
    // Numbered sections (1., 2., 3., etc.)
    numberedSection: /^\d+\.\s+[A-Z]/,
    
    // Lettered sections (a), b), c), etc.)
    letteredSection: /^[a-z]\)\s+/,
    
    // Annexes and appendices
    annex: /^(ANNEX|APPENDIX|ATTACHMENT)\s*[A-Z0-9]*/i,
    
    // All caps titles (likely important headings)
    allCapsTitle: /^[A-Z\s]{5,}$/,
    
    // Definitions section
    definitions: /^(DEFINITIONS?|TERMS)/i
  };

  let currentSectionId = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.length < 3) continue; // Skip very short lines
    
    let sectionType: DocumentSection['type'] = 'other';
    let level = 3; // Default level
    
    // Determine section type and level
    if (patterns.mainHeading.test(line)) {
      sectionType = 'heading';
      level = 1;
    } else if (patterns.annex.test(line)) {
      sectionType = 'annex';
      level = 1;
    } else if (patterns.subHeading.test(line)) {
      sectionType = 'section';
      level = 2;
    } else if (patterns.numberedSection.test(line)) {
      sectionType = 'section';
      level = 2;
    } else if (patterns.allCapsTitle.test(line) && line.length > 10) {
      sectionType = 'heading';
      level = 1;
    } else if (patterns.definitions.test(line)) {
      sectionType = 'section';
      level = 2;
    } else {
      continue; // Not a heading/section
    }
    
    // Find the end of this section (next heading or end of document)
    let endLine = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      if (isLikelyHeading(nextLine)) {
        endLine = j - 1;
        break;
      }
    }
    
    // Extract content for this section
    const sectionLines = lines.slice(i, endLine + 1);
    const content = sectionLines.join('\n');
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    sections.push({
      id: `section-${currentSectionId++}`,
      title: line,
      level,
      startLine: i + 1, // 1-based line numbers
      endLine: endLine + 1,
      content,
      wordCount,
      type: sectionType
    });
  }
  
  // Separate annexes from main content
  const annexes = sections.filter(s => s.type === 'annex');
  const mainContent = sections.filter(s => s.type !== 'annex');
  
  // Calculate statistics
  const statistics = {
    totalLines: lines.length,
    totalWords: text.split(/\s+/).filter(word => word.length > 0).length,
    totalCharacters: text.length
  };
  
  return {
    sections,
    totalSections: sections.length,
    annexes,
    mainContent,
    statistics
  };
}

/**
 * Helper function to determine if a line is likely a heading
 */
function isLikelyHeading(line: string): boolean {
  if (line.length < 3) return false;
  
  const patterns = [
    /^(SECTION|CHAPTER|PART|TITLE|BOOK)\s+[A-Z0-9]+/i,
    /^(Section|Article|Clause)\s+\d+(\.\d+)*/i,
    /^\d+\.\s+[A-Z]/,
    /^(ANNEX|APPENDIX|ATTACHMENT)\s*[A-Z0-9]*/i,
    /^[A-Z\s]{10,}$/
  ];
  
  return patterns.some(pattern => pattern.test(line));
}

/**
 * Extracts a table of contents from the document sections
 */
export function generateTableOfContents(sections: DocumentSection[]): string {
  let toc = "TABLE OF CONTENTS\n";
  toc += "==================\n\n";
  
  sections.forEach(section => {
    const indent = "  ".repeat(section.level - 1);
    const lineRef = `(Line ${section.startLine})`;
    toc += `${indent}${section.title} ${lineRef}\n`;
  });
  
  return toc;
}
