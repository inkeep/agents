function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error != null && typeof error === 'object') {
    if ('name' in error && (error as { name: string }).name === 'AbortError') return true;
    const status = (error as { status?: number }).status;
    if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  }
  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { maxAttempts = 3, maxDelayMs = 30000, label = 'operation' } = opts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableHttpError(error) || attempt === maxAttempts) throw error;
      const status = (error as { status?: number }).status;
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
