/**
 * Generate a unique ID from a name
 * @param name - The name to generate an ID from
 * @returns The generated ID
 */
export const generateId = (name: string) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace whitespace with dashes
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric characters except dashes
    .replace(/-+/g, '-') // Replace multiple consecutive dashes with single dash
    .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
};
