function exponentialDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30000);
}

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryCondition?: (error: unknown, response?: Response) => boolean;
  timeout?: number;
}

async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries = 3, retryCondition, timeout, ...fetchOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

      const existingSignal = fetchOptions.signal;
      if (existingSignal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (retryCondition && !response.ok && retryCondition(null, response)) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, exponentialDelay(attempt)));
          continue;
        }
      }

      return response;
    } catch (error) {
      if (attempt < retries && (!retryCondition || retryCondition(error))) {
        await new Promise((r) => setTimeout(r, exponentialDelay(attempt)));
        continue;
      }
      throw error;
    }
  }

  throw new Error('fetchWithRetry: exhausted retries');
}

function isNetworkOrServerError(error: unknown, response?: Response): boolean {
  if (error) return true;
  if (response && response.status >= 500) return true;
  return false;
}

export { fetchWithRetry, isNetworkOrServerError, exponentialDelay };
export type { FetchWithRetryOptions };
