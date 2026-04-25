/**
 * Batch Processing Utilities for Pipeline Stages
 * 
 * Provides concurrent batch processing with retry mechanism
 * to significantly improve pipeline performance.
 */

/**
 * Configuration for batch processing
 */
export interface BatchConfig {
  /** Number of items to process concurrently */
  batchSize: number;
  /** Maximum retry attempts for failed items */
  maxRetries: number;
  /** Delay between retries (milliseconds) */
  retryDelay?: number;
  /** Whether to retry on specific errors */
  retryableErrors?: string[];
  /** Callback function called after each batch completes */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Result of processing a single item
 */
export interface BatchItemResult<T> {
  item: T;
  success: boolean;
  error?: string;
  retries: number;
}

/**
 * Process items in concurrent batches with retry mechanism
 * 
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param config - Batch processing configuration
 * @returns Array of results for each item
 */
export async function processInBatches<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  config: BatchConfig
): Promise<BatchItemResult<T>[]> {
  const {
    batchSize = 5,
    maxRetries = 2,
    retryDelay = 1000,
    retryableErrors = [],
    onProgress,
  } = config;

  const results: BatchItemResult<T>[] = [];
  const total = items.length;
  
  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        let lastError: Error | null = null;
        let retries = 0;
        
        // Retry loop
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            await processor(item);
            return { item, success: true, retries: attempt };
          } catch (error) {
            lastError = error as Error;
            retries = attempt;
            
            // Check if error is retryable
            const errorMessage = String(error);
            const isRetryable = retryableErrors.length === 0 || 
              retryableErrors.some(pattern => errorMessage.includes(pattern));
            
            // Don't retry if not retryable or last attempt
            if (!isRetryable || attempt === maxRetries) {
              break;
            }
            
            // Wait before retry
            if (retryDelay && attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }
        
        return { 
          item, 
          success: false, 
          error: lastError ? String(lastError) : "Unknown error",
          retries 
        };
      })
    );
    
    // Collect results
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // This shouldn't happen with our error handling, but just in case
        results.push({
          item: items[i], // Approximate item
          success: false,
          error: String(result.reason),
          retries: 0,
        });
      }
    });
    
    // Call progress callback after each batch
    if (onProgress) {
      onProgress(results.length, total);
    }
    
    // Small delay between batches to avoid overwhelming the system
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Update progress in a thread-safe way
 * 
 * @param progressRef - Object with success and error counters
 * @param success - Whether the operation succeeded
 * @returns Updated counts
 */
export function updateProgress(
  progressRef: { success: number; errors: number },
  success: boolean
): { success: number; errors: number } {
  if (success) {
    progressRef.success++;
  } else {
    progressRef.errors++;
  }
  return progressRef;
}

/**
 * Check if an error is a network/AI timeout that should be retried
 */
export function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    "timeout",
    "Timeout",
    "Connection error",
    "connection error",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "Request timed out",
    "rate limit",
    "Rate limit",
    "429", // HTTP 429 Too Many Requests
  ];
  
  return retryablePatterns.some(pattern => error.includes(pattern));
}

/**
 * Filter out non-retryable errors (e.g., unsupported file types)
 */
export function isNonRetryableError(error: string): boolean {
  const nonRetryablePatterns = [
    "不支持的文件类型",
    "Unsupported file type",
    "文件不存在",
    "File not found",
    "ENOENT",
    "权限不足",
    "Permission denied",
    "EACCES",
  ];
  
  return nonRetryablePatterns.some(pattern => error.includes(pattern));
}
