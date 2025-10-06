import { nanoid } from 'nanoid';

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
  let id = nanoid();

  // Convert to lowercase and remove any leading hyphens
  id = id.toLowerCase().replace(/^-+/, '');

  return id;
}
