/**
 * Credential Reference System
 *
 * This module provides a way to reference credentials by ID without including
 * the full credential definition in the code. Credentials are resolved from
 * environment files at runtime during the push operation.
 */

/**
 * Represents a reference to a credential by its ID.
 * The actual credential will be resolved from the environment file at push time.
 */
export interface CredentialReference {
  __type: 'credential-ref';
  id: string;
}

/**
 * Create a reference to a credential by its ID.
 * The credential must be defined in the environment files.
 *
 * @param id - The ID of the credential to reference
 * @returns A credential reference that will be resolved at push time
 *
 * @example
 * ```typescript
 * const apiKeyRef = credentialRef('api-key');
 *
 * const fetchDef = fetchDefinition({
 *   credential: apiKeyRef,
 *   // ...
 * });
 * ```
 */
export function credentialRef<T extends string = string>(id: T): CredentialReference {
  return {
    __type: 'credential-ref',
    id,
  };
}

/**
 * Type guard to check if a value is a credential reference
 */
export function isCredentialReference(value: any): value is CredentialReference {
  return value && typeof value === 'object' && value.__type === 'credential-ref';
}

/**
 * Type helper to extract credential IDs from environment configuration
 */
export type ExtractCredentialIds<T> = T extends {
  credentials?: infer C;
}
  ? C extends Record<string, any>
    ? keyof C
    : never
  : never;

/**
 * Type helper to create a union of all available credential IDs from multiple environments
 */
export type UnionCredentialIds<T extends Record<string, any>> = {
  [K in keyof T]: ExtractCredentialIds<T[K]>;
}[keyof T];