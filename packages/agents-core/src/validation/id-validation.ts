import { resourceIdSchema, MAX_ID_LENGTH } from './schemas';
/**
 * Valid URL-safe characters for resource IDs based on RFC 3986.
 *
 * Allowed characters:
 * - Letters: a-z, A-Z
 * - Numbers: 0-9
 * - Hyphens: -
 * - Underscores: _
 *
 * Note: While dots (.) and tildes (~) are technically URL-safe,
 * we exclude them for consistency with existing patterns in the codebase.
 */

/**
 * Helper function to validate if a string is a valid resource ID
 */
export function isValidResourceId(id: string): boolean {
  const result = resourceIdSchema.safeParse(id);
  return result.success;
}

/**
 * Helper function to generate a URL-safe ID from a name or title.
 * Converts to lowercase and replaces invalid characters with hyphens.
 */
export function generateIdFromName(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-') // Replace invalid chars with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // Replace multiple consecutive hyphens with single hyphen

  // Ensure the generated ID is not empty
  if (!id) {
    throw new Error('Cannot generate valid ID from provided name');
  }

  // Truncate if necessary
  const truncatedId = id.substring(0, MAX_ID_LENGTH);

  // Validate the generated ID
  const result = resourceIdSchema.safeParse(truncatedId);
  if (!result.success) {
    throw new Error(`Generated ID "${truncatedId}" is not valid: ${result.error.message}`);
  }

  return truncatedId;
}

/**
 * Example valid IDs:
 * - "qa-agent"
 * - "customer_support_123"
 * - "router"
 * - "tool-executor-v2"
 * - "PRODUCTION_CONFIG"
 *
 * Example invalid IDs:
 * - "my.agent" (contains dot)
 * - "agent@123" (contains @)
 * - "agent/router" (contains slash)
 * - "my agent" (contains space)
 * - "agent#1" (contains hash)
 * - "" (empty string)
 */
