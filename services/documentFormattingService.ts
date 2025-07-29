/**
 * Service for document formatting with granular progress feedback
 */

interface FormattingTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  subStatusMessage?: string;
  result?: string;
  error?: string;
  processingLog?: Array<{
    step: string;
    status: string;
    timestamp: string;
    outputLength?: number;
    error?: string;
  }>;
}

interface FormattingProgress {
  message: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: FormattingProgress) => void;

const API_BASE_URL = 'http://localhost:3001';

/**
 * Format a document with real-time progress updates
 */
export async function formatDocumentWithProgress(
  rawText: string,
  onProgress?: ProgressCallback
): Promise<string> {
  // Start formatting task
  const response = await fetch(`${API_BASE_URL}/api/format-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rawText }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start formatting: ${response.status} ${response.statusText}`);
  }

  const { taskId } = await response.json();
  console.log(`🚀 Document formatting started with taskId: ${taskId}`);

  // Poll for progress and completion
  return new Promise<string>((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${API_BASE_URL}/api/task-status/${taskId}`);
        
        if (!statusResponse.ok) {
          clearInterval(pollInterval);
          reject(new Error(`Failed to get task status: ${statusResponse.status}`));
          return;
        }

        const task: FormattingTask = await statusResponse.json();
        
        // Update progress if callback provided
        if (onProgress && task.subStatusMessage) {
          // Parse progress from subStatusMessage if it contains current/total format
          const progressMatch = task.subStatusMessage.match(/(\d+)\/(\d+)/);
          if (progressMatch) {
            onProgress({
              message: task.subStatusMessage,
              current: parseInt(progressMatch[1]),
              total: parseInt(progressMatch[2])
            });
          } else {
            // Generic progress update
            onProgress({
              message: task.subStatusMessage,
              current: task.status === 'processing' ? 1 : 0,
              total: 1
            });
          }
        }

        console.log(`📊 Task ${taskId} status: ${task.status} - ${task.subStatusMessage || task.message}`);

        if (task.status === 'completed') {
          clearInterval(pollInterval);
          
          // Get the final result
          const resultResponse = await fetch(`${API_BASE_URL}/api/task-result/${taskId}`);
          if (!resultResponse.ok) {
            reject(new Error(`Failed to get task result: ${resultResponse.status}`));
            return;
          }

          const { result } = await resultResponse.json();
          console.log(`✅ Document formatting completed. Result length: ${result?.length || 0} chars`);
          resolve(result);
          
        } else if (task.status === 'failed') {
          clearInterval(pollInterval);
          reject(new Error(`Formatting failed: ${task.error || 'Unknown error'}`));
        }
        
      } catch (error) {
        clearInterval(pollInterval);
        reject(error);
      }
    }, 1000); // Poll every second

    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      reject(new Error('Document formatting timed out after 10 minutes'));
    }, 10 * 60 * 1000);
  });
}

/**
 * Get the status of a formatting task
 */
export async function getFormattingTaskStatus(taskId: string): Promise<FormattingTask> {
  const response = await fetch(`${API_BASE_URL}/api/task-status/${taskId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get task status: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get the result of a completed formatting task
 */
export async function getFormattingTaskResult(taskId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/task-result/${taskId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get task result: ${response.status} ${response.statusText}`);
  }

  const { result } = await response.json();
  return result;
}
