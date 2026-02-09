import { env } from '../../env';

/**
 * Check if a SpiceDB endpoint is localhost (used for TLS auto-detection).
 */
export function isLocalhostEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('localhost') || endpoint.startsWith('127.0.0.1');
}

/**
 * Get SpiceDB connection configuration from environment variables.
 * TLS is auto-detected: disabled for localhost, enabled for remote endpoints.
 */
export function getSpiceDbConfig() {
  const endpoint = env.SPICEDB_ENDPOINT || 'localhost:50051';

  return {
    endpoint,
    token: env.SPICEDB_PRESHARED_KEY || '',
    tlsEnabled: env.SPICEDB_TLS_ENABLED ?? !isLocalhostEndpoint(endpoint),
  };
}
