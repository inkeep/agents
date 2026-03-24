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

const SPICEDB_PROJECT_ID_SEPARATOR = '/';

/**
 * Compose a tenant-scoped SpiceDB project object ID.
 *
 * SpiceDB object IDs are global, so we namespace projects under their tenant
 * to prevent cross-tenant collisions (e.g. two orgs with a project called "default").
 *
 * Format: `{tenantId}/{projectId}`
 */
export function toSpiceDbProjectId(tenantId: string, projectId: string): string {
  return `${tenantId}${SPICEDB_PROJECT_ID_SEPARATOR}${projectId}`;
}

/**
 * Parse a tenant-scoped SpiceDB project object ID back into its parts.
 *
 * @returns `{ tenantId, projectId }` extracted from the composite ID.
 * @throws if the ID does not contain the separator.
 */
export function fromSpiceDbProjectId(spiceDbProjectId: string): {
  tenantId: string;
  projectId: string;
} {
  const separatorIndex = spiceDbProjectId.indexOf(SPICEDB_PROJECT_ID_SEPARATOR);
  if (separatorIndex === -1) {
    throw new Error(`Invalid SpiceDB project ID format: ${spiceDbProjectId}`);
  }
  return {
    tenantId: spiceDbProjectId.substring(0, separatorIndex),
    projectId: spiceDbProjectId.substring(separatorIndex + 1),
  };
}
