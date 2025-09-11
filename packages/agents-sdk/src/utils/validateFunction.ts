/**
 * Validates that a value is a function
 * @param value - The value to check
 * @param name - The name of the parameter (for error messages)
 * @throws {Error} If the value is not a function
 */
export function validateFunction(value: unknown, name: string): void {
  if (typeof value !== 'function') {
    throw new Error(`${name} must be a function`);
  }
}
