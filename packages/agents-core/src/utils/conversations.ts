import { createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';

// This ensures IDs are always lowercase and never start with a hyphen
export const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 21);

/**
 * Derive a deterministic 32-character hex ID from natural key parts.
 * Used for junction/relation table IDs so the same logical relation
 * always produces the same ID regardless of which branch creates it.
 *
 * Keys are sorted alphabetically before hashing so property order does not matter.
 */
export function deriveRelationId(parts: Record<string, string>): string {
  const values = Object.keys(parts)
    .sort()
    .map((k) => parts[k]);
  return createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 32);
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
