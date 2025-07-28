

export enum PageStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing OCR',
  CORRECTING = 'AI Correction',
  COMPLETED = 'Completed',
  ERROR = 'Error',
}

export type ExtractionMethod = 'Quick Text' | 'AI Correction' | 'AI OCR' | null;

export interface ExtractionResult {
  pageNumber: number;
  status: PageStatus;
  text: string | null;
  imageUrl: string | null;
  method: ExtractionMethod;
  changes?: string; // Description of changes made by AI
}