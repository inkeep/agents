import { customAlphabet } from 'nanoid';

// This ensures IDs are always lowercase and never start with a hyphen
export const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 21);

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
