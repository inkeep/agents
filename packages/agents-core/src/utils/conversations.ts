import { createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import type { BaseExecutionContext, ConversationMetadata } from '../types/utility';

// This ensures IDs are always lowercase and never start with a hyphen
export const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 21);

/**
 * Derive a deterministic 32-character hex ID from natural key parts.
 * Used for junction/relation table IDs so the same logical relation
 * always produces the same ID regardless of which branch creates it.
 */
export function deriveRelationId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
}

/**
 * Generates a standardized conversation ID.
 *
 * The generated ID follows these rules:
 * 1. Always lowercase
 * 2. No leading hyphens
 *
 * @returns A unique conversation ID
 *
 * @example
 * ```typescript
 * const id = getConversationId(); // returns something like "v1stgxr8z5jdhi6bmyt"
 * ```
 */
export function getConversationId(): string {
  return generateId();
}

export function buildConversationMetadata(
  executionContext: BaseExecutionContext,
  userProperties?: Record<string, unknown>,
): ConversationMetadata | undefined {
  const meta = executionContext.metadata;
  const isAuthenticated =
    meta?.authMethod === 'app_credential_web_client_authenticated';

  const result: ConversationMetadata = {};

  if (userProperties) {
    result.userContext = userProperties;
  }
  if (meta?.verifiedClaims) {
    result.verifiedClaims = meta.verifiedClaims;
  }
  if (isAuthenticated && meta?.endUserId) {
    result.externalUserId = meta.endUserId;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
