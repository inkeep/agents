import { getLogger } from '../utils/logger';
import {
  DEFAULT_RETRYABLE_CODES,
  getPostgresErrorCode,
  isRetryableError,
} from './retryable-errors';

const logger = getLogger('retry');

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableCodes?: Set<string>;
  context?: string;
  noRetry?: boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 50,
    maxDelayMs = 5000,
    retryableCodes = DEFAULT_RETRYABLE_CODES,
    context = 'db-operation',
    noRetry = false,
  } = options;

  if (noRetry) return fn();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const retryable = isRetryableError(error, retryableCodes);

      if (isLastAttempt || !retryable) {
        throw error;
      }

      const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitteredDelay = Math.random() * expDelay;

      logger.warn(
        {
          context,
          attempt: attempt + 1,
          maxRetries,
          delayMs: Math.round(jitteredDelay),
          errorCode:
            getPostgresErrorCode(error) ?? (error as any)?.code ?? (error as any)?.cause?.code,
          errorMessage: (error as any)?.message ?? String(error),
        },
        'Retrying transient database error'
      );

      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  throw new Error('unreachable');
}

export async function withRetryTransaction<T>(
  db: { transaction: (fn: (tx: any) => Promise<T>) => Promise<T> },
  txFn: (tx: any) => Promise<T>,
  options: Omit<RetryOptions, 'noRetry'> = {}
): Promise<T> {
  return withRetry(() => db.transaction(txFn), {
    ...options,
    context: options.context ?? 'transaction',
  });
}
