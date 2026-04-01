interface FetchWithRetryOptions extends RequestInit {
  timeout?: number;
  maxAttempts?: number;
  label?: string;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { maxAttempts = 3, maxDelayMs = 4000, label = 'operation' } = opts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isTimeout = (error as Error).name === 'AbortError';
      const status = (error as { status?: number }).status;
      const isRateLimit = status === 429;
      const isServerError = typeof status === 'number' && status >= 500;
      if ((!isTimeout && !isServerError && !isRateLimit) || attempt === maxAttempts) throw error;
      const retryAfter = (
        error as { headers?: { get?: (name: string) => string | null } }
      ).headers?.get?.('Retry-After');
      const retryAfterMs = retryAfter ? (Number(retryAfter) || 0) * 1000 : 0;
      const baseDelay = Math.min(500 * 2 ** (attempt - 1), maxDelayMs);
      const delay = Math.max(baseDelay, retryAfterMs) + Math.random() * 100;
      console.warn(
        `[${label}] Retrying after transient failure (attempt ${attempt}/${maxAttempts}, status=${status ?? 'n/a'}, delay=${Math.round(delay)}ms)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
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
