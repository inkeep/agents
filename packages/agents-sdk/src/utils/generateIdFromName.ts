/**
 * Generates a kebab-case ID from a name string
 * @param name - The name to convert
 * @returns A kebab-case ID
 */

export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
