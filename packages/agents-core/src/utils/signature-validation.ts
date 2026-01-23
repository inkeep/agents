import * as jmespath from 'jmespath';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a JMESPath expression by attempting to compile it.
 * Uses the jmespath package which is already available in the codebase.
 *
 * @param expression - The JMESPath expression to validate
 * @returns ValidationResult with valid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateJMESPath('body.user.id');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateJMESPath(expression: string): ValidationResult {
  if (!expression || typeof expression !== 'string') {
    return {
      valid: false,
      error: 'JMESPath expression must be a non-empty string',
    };
  }

  try {
    // Use jmespath.compile() to validate syntax without needing sample data
    // The compile method will throw if the expression is invalid
    (jmespath as any).compile(expression);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JMESPath expression: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validates a regex pattern by attempting to construct a RegExp object.
 * Returns clear error messages for common regex issues.
 *
 * @param pattern - The regex pattern to validate (without delimiters)
 * @returns ValidationResult with valid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateRegex('v\\d+,(.+)');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateRegex(pattern: string): ValidationResult {
  if (pattern === null || pattern === undefined) {
    return {
      valid: false,
      error: 'Regex pattern must be provided',
    };
  }

  if (typeof pattern !== 'string') {
    return {
      valid: false,
      error: 'Regex pattern must be a string',
    };
  }

  // Empty string is technically valid regex (matches empty string)
  if (pattern === '') {
    return { valid: true };
  }

  try {
    // Attempt to create RegExp - will throw on invalid patterns
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
