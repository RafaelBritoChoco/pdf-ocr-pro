// Storage service for large document processing persistence
export interface ProcessingSession {
  id: string;
  fileName: string;
  fileSize: number;
  totalPages: number;
  currentPhase: number;
  completedPages: number[];
  results: any[];
  formattedText?: string;
  startTime: number;
  lastSaveTime: number;
  footnoteAnalysis?: any;
  debugLogs: string[];
}

const STORAGE_KEY = 'pdf_processing_session';
const MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB limit

export class ProcessingStorage {
  static saveSession(session: ProcessingSession): boolean {
    try {
      const sessionData = JSON.stringify(session);
      
      // Check storage size
      if (sessionData.length > MAX_STORAGE_SIZE) {
        console.warn('Session too large for storage, compressing...');
        // Compress by removing old debug logs
        const compressedSession = {
          ...session,
          debugLogs: session.debugLogs.slice(-100), // Keep only last 100 logs
          results: session.results.map(r => ({
            ...r,
            imageUrl: r.imageUrl ? 'compressed' : null // Remove image data to save space
          }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compressedSession));
      } else {
        localStorage.setItem(STORAGE_KEY, sessionData);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  static loadSession(): ProcessingSession | null {
    try {
      const sessionData = localStorage.getItem(STORAGE_KEY);
      if (!sessionData) return null;
      
      return JSON.parse(sessionData);
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  static clearSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  static hasSession(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  static getSessionInfo(): { fileName: string; progress: number } | null {
    const session = this.loadSession();
    if (!session) return null;
    
    return {
      fileName: session.fileName,
      progress: Math.round((session.completedPages.length / session.totalPages) * 100)
    };
  }
}

// Chunking utilities for processing large documents
export class ChunkProcessor {
  static readonly CHUNK_SIZE = 5; // Process 5 pages at a time
  static readonly DELAY_BETWEEN_CHUNKS = 100; // 100ms delay between chunks
  static readonly MEMORY_CHECK_INTERVAL = 10; // Check memory every 10 pages

  static createChunks<T>(array: T[], chunkSize: number = this.CHUNK_SIZE): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  static async processWithChunks<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    onProgress?: (completed: number, total: number) => void,
    onChunkComplete?: () => void
  ): Promise<R[]> {
    const results: R[] = [];
    const chunks = this.createChunks(items);
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      // Process chunk items in parallel (but limited by chunk size)
      const chunkPromises = chunk.map((item, localIndex) => {
        const globalIndex = chunkIndex * this.CHUNK_SIZE + localIndex;
        return processor(item, globalIndex);
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      // Update progress
      if (onProgress) {
        onProgress(results.length, items.length);
      }
      
      // Memory management check
      if (chunkIndex % this.MEMORY_CHECK_INTERVAL === 0) {
        await this.performMemoryCleanup();
      }
      
      // Allow UI to update
      if (onChunkComplete) {
        onChunkComplete();
      }
      
      // Small delay to prevent browser freezing
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.DELAY_BETWEEN_CHUNKS));
      }
    }
    
    return results;
  }

  private static async performMemoryCleanup(): Promise<void> {
    // Force garbage collection if available
    if ((window as any).gc) {
      (window as any).gc();
    }
    
    // Yield to browser for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// Error recovery utilities
export class ErrorRecovery {
  static readonly MAX_RETRIES = 3;
  static readonly RETRY_DELAY = 1000; // 1 second

  static async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`${context} failed (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
        }
      }
    }
    
    throw new Error(`${context} failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  static isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [
      /network/i,
      /timeout/i,
      /rate limit/i,
      /temporary/i,
      /service unavailable/i
    ];
    
    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }
}

// Progress tracking with ETA calculation
export class ProgressTracker {
  private startTime: number;
  private totalItems: number;

  constructor(totalItems: number) {
    this.startTime = Date.now();
    this.totalItems = totalItems;
  }

  update(completed: number): {
    percentage: number;
    eta: string;
    speed: number;
    elapsed: string;
  } {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const percentage = Math.round((completed / this.totalItems) * 100);
    
    // Calculate ETA
    let eta = 'Calculating...';
    let speed = 0;
    
    if (completed > 0 && elapsed > 1000) {
      speed = completed / (elapsed / 1000); // items per second
      const remaining = this.totalItems - completed;
      const etaSeconds = remaining / speed;
      eta = this.formatDuration(etaSeconds * 1000);
    }
    
    return {
      percentage,
      eta,
      speed: Math.round(speed * 100) / 100,
      elapsed: this.formatDuration(elapsed)
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
