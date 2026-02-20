import { PostgresError } from 'pg-error-enum';

const TIER_1_ALWAYS_RETRY = new Set([
  PostgresError.T_R_SERIALIZATION_FAILURE, // 40001
  PostgresError.T_R_DEADLOCK_DETECTED, // 40P01
]);

const TIER_2_CONNECTION = new Set([
  PostgresError.CONNECTION_EXCEPTION, // 08000
  PostgresError.CONNECTION_DOES_NOT_EXIST, // 08003
  PostgresError.CONNECTION_FAILURE, // 08006
  PostgresError.SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION, // 08001
  PostgresError.SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION, // 08004
  PostgresError.ADMIN_SHUTDOWN, // 57P01
  PostgresError.CANNOT_CONNECT_NOW, // 57P03
]);

const TIER_3_RESOURCE = new Set([
  PostgresError.INSUFFICIENT_RESOURCES, // 53000
  PostgresError.DISK_FULL, // 53100
  PostgresError.OUT_OF_MEMORY, // 53200
  PostgresError.TOO_MANY_CONNECTIONS, // 53300
  PostgresError.LOCK_NOT_AVAILABLE, // 55P03
  PostgresError.QUERY_CANCELED, // 57014
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
