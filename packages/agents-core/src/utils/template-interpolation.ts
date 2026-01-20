/**
 * Resolves a nested path from an object using dot notation.
 * Example: getValue({ user: { profile: { name: 'John' } } }, 'user.profile.name') => 'John'
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path (e.g., 'user.profile.name')
 * @returns The value at the path, or undefined if not found
 */
function getValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Converts a value to string for template interpolation.
 * Handles primitives, null, undefined gracefully.
 *
 * @param value - The value to convert
 * @returns String representation or empty string if undefined/null
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // For objects/arrays, convert to JSON string
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Interpolates a message template with placeholders from a payload object.
 * Supports {{path.to.value}} placeholder syntax with dot notation for nested paths.
 * Missing values are replaced with empty strings.
 *
 * @param template - Message template with {{placeholder}} syntax
 * @param payload - Object containing values to interpolate
 * @returns Interpolated message with all placeholders resolved
 *
 * @example
 * const template = "User {{user.name}} from {{user.profile.location}} submitted: {{message}}";
 * const payload = {
 *   user: { name: "Alice", profile: { location: "NYC" } },
 *   message: "Hello World"
 * };
 * interpolateTemplate(template, payload);
 * // => "User Alice from NYC submitted: Hello World"
 */
export function interpolateTemplate(template: string, payload: Record<string, unknown>): string {
  // Match {{...}} placeholders (non-greedy)
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    // Trim whitespace from path
    const trimmedPath = path.trim();

    // Resolve the value from payload using dot notation
    const value = getValue(payload, trimmedPath);

    // Convert to string (empty string if missing)
    return valueToString(value);
  });
}
