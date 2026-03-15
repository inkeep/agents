const TIER_1_ALWAYS_RETRY = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

const TIER_2_CONNECTION = new Set([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

const TIER_3_RESOURCE = new Set([
  '53000', // insufficient_resources
  '53100', // disk_full
  '53200', // out_of_memory
  '53300', // too_many_connections
  '55P03', // lock_not_available
  '57014', // query_canceled
]);

export const DEFAULT_RETRYABLE_CODES: Set<string> = new Set([
  ...TIER_1_ALWAYS_RETRY,
  ...TIER_2_CONNECTION,
  ...TIER_3_RESOURCE,
]);

export const RETRYABLE_NODE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
]);

export const RETRYABLE_POOL_MESSAGES = [
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
];

const NON_RETRYABLE_POOL_MESSAGES = ['Cannot use a pool after calling end on the pool'];

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

export function getPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as Record<string, any>;

  if (
    err.cause?.code &&
    typeof err.cause.code === 'string' &&
    SQLSTATE_PATTERN.test(err.cause.code)
  ) {
    return err.cause.code;
  }

  if (err.code && typeof err.code === 'string' && SQLSTATE_PATTERN.test(err.code)) {
    return err.code;
  }

  return undefined;
}

export function isRetryableError(
  error: unknown,
  retryableCodes: Set<string> = DEFAULT_RETRYABLE_CODES
): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;

  const sqlstate = getPostgresErrorCode(error);
  if (sqlstate && retryableCodes.has(sqlstate)) return true;

  const nodeCode = err.code ?? err.cause?.code;
  if (typeof nodeCode === 'string' && RETRYABLE_NODE_ERROR_CODES.has(nodeCode)) return true;

  const messages = [err.message, err.cause?.message].filter(
    (m): m is string => typeof m === 'string'
  );
  for (const message of messages) {
    if (NON_RETRYABLE_POOL_MESSAGES.some((m) => message.includes(m))) return false;
    if (RETRYABLE_POOL_MESSAGES.some((m) => message.includes(m))) return true;
  }

  return false;
}

export function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;
  return err?.cause?.code === '23503' || err?.code === '23503';
}

export function isSerializationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;
  const code = err?.cause?.code ?? err?.code;
  return code === '40001' || code === '40P01' || code === 'XX000';
}
