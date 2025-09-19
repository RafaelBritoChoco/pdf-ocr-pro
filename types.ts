export enum ProcessingState {
  IDLE = 'IDLE',
  CONFIGURING_CLEANING = 'CONFIGURING_CLEANING',
  CONFIGURING_HEADLINES = 'CONFIGURING_HEADLINES',
  CONFIGURING_FOOTNOTES = 'CONFIGURING_FOOTNOTES',
  CONFIGURING_CONTENT = 'CONFIGURING_CONTENT',
  EXTRACTING = 'EXTRACTING',
  OCR = 'OCR',
  CLEANING = 'CLEANING',
  STRUCTURING_HEADLINES = 'STRUCTURING_HEADLINES',
  STRUCTURING_FOOTNOTES = 'STRUCTURING_FOOTNOTES',
  STRUCTURING_CONTENT = 'STRUCTURING_CONTENT',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export enum DownloadFormat {
  CLEANED_TEXT = 'CLEANED_TEXT',
  HEADLINES_ONLY = 'HEADLINES_ONLY',
  FULLY_STRUCTURED = 'FULLY_STRUCTURED',
  MARKER_STAGE = 'MARKER_STAGE',
}

export enum ProcessingMode {
  FAST = 'FAST',
  QUALITY = 'QUALITY',
}

// --- Docling extraction metadata types ---
export interface DoclingHeuristicMetrics {
  pages_sampled?: number;
  total_chars?: number;
  avg_chars_per_page?: number;
  images?: number;
  sparse_pages?: number;
  sparse_pct?: number;
}

export interface DoclingMeta {
  requested_mode?: 'auto' | 'simple' | 'advanced';
  mode?: 'simple' | 'advanced';
  pages?: number | null;
  filename?: string;
  fallback_used?: boolean;
  fallback_reason?: string | null;
  service_version?: string;
  auto_threshold_chars_per_page?: string | null;
  progressive?: boolean;
  multi_phase?: boolean;
  heuristic?: DoclingHeuristicMetrics;
  heuristic_reasons?: string[];
  ocr_needed?: boolean;
  second_phase_attempted?: boolean;
  ocr_used?: boolean;
  memory_fallback?: boolean;
  hard_fallback?: boolean;
  hard_fallback_reason?: string | null;
  forced_pypdf?: boolean;
}
