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

const SPICEDB_ID_SEPARATOR = '/';

/**
 * Branded SpiceDB object ID types.
 *
 * SpiceDB object IDs are global — `credential_reference:cred_foo` refers to one
 * object regardless of who wrote the tuple. To prevent cross-tenant collisions we
 * namespace composite-PK resources under their scope (`{tenantId}/{projectId}/...`).
 *
 * The brand is enforcement, not decoration: downstream helpers accept only the
 * branded type, so a raw DB ID can never be passed to a SpiceDB call without
 * going through the appropriate `toSpiceDb*Id` constructor. This catches at
 * compile time the "forgot to tenant-prefix" bug class.
 */
export type SpiceDbProjectId = string & { readonly __brand: 'SpiceDbProjectId' };
export type SpiceDbCredentialReferenceId = string & {
  readonly __brand: 'SpiceDbCredentialReferenceId';
};

/**
 * Compose a tenant-scoped SpiceDB project object ID.
 *
 * Format: `{tenantId}/{projectId}` — projects' backing-store PK is
 * `(tenantId, projectId)`, so this mirrors that composite key verbatim.
 */
export function toSpiceDbProjectId(tenantId: string, projectId: string): SpiceDbProjectId {
  return `${tenantId}${SPICEDB_ID_SEPARATOR}${projectId}` as SpiceDbProjectId;
}

/**
 * Parse a tenant-scoped SpiceDB project object ID back into its parts.
 *
 * @returns `{ tenantId, projectId }` extracted from the composite ID.
 * @throws if the ID does not contain the separator.
 */
export function fromSpiceDbProjectId(spiceDbProjectId: SpiceDbProjectId | string): {
  tenantId: string;
  projectId: string;
} {
  const separatorIndex = spiceDbProjectId.indexOf(SPICEDB_ID_SEPARATOR);
  if (separatorIndex === -1) {
    throw new Error(`Invalid SpiceDB project ID format: ${spiceDbProjectId}`);
  }
  return {
    tenantId: spiceDbProjectId.substring(0, separatorIndex),
    projectId: spiceDbProjectId.substring(separatorIndex + 1),
  };
}

/**
 * Compose a tenant+project-scoped SpiceDB credential_reference object ID.
 *
 * Format: `{tenantId}/{projectId}/{credentialReferenceId}` — credentials' backing-store
 * PK is `(tenantId, projectId, id)`, so this mirrors that composite key verbatim.
 * Without this scoping, two tenants that each define a credential with the same
 * slug (e.g. `cred_helpscout`) would share the same SpiceDB object and any grant
 * on one would appear to grant the other.
 */
export function toSpiceDbCredentialReferenceId(
  tenantId: string,
  projectId: string,
  credentialReferenceId: string
): SpiceDbCredentialReferenceId {
  return `${tenantId}${SPICEDB_ID_SEPARATOR}${projectId}${SPICEDB_ID_SEPARATOR}${credentialReferenceId}` as SpiceDbCredentialReferenceId;
}
