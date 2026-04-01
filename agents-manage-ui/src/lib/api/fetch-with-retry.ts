import { retryWithBackoff } from '@inkeep/agents-core/utils/retry';

interface FetchWithRetryOptions extends RequestInit {
  timeout?: number;
  maxAttempts?: number;
  label?: string;
}

async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { timeout, maxAttempts = 3, label = 'fetch', ...fetchOptions } = options;

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        if (response.status === 429 || response.status >= 500) {
          const error = new Error(`Server error: ${response.status}`);
          (error as any).status = response.status;
          (error as any).headers = response.headers;
          throw error;
        }

        return response;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    { maxAttempts, label }
  );
}

export { fetchWithRetry };
export type { FetchWithRetryOptions };
