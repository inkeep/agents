import { getLogger } from './logger';

const logger = getLogger('retry');

export async function retryWithBackoff<T>(
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
      const delay = Math.min(500 * 2 ** (attempt - 1), maxDelayMs) + Math.random() * 100;
      logger.warn(
        { attempt, maxAttempts, status, delay: Math.round(delay), label },
        `Retrying ${label} after transient failure`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
