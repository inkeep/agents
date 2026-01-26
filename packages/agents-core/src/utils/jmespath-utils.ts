import * as jmespath from 'jmespath';

/**
 * Extended interface for jmespath to include the compile method
 * which is available at runtime but not in the type definitions.
 */
interface JMESPathExtended {
  search: typeof jmespath.search;
  compile: (expression: string) => unknown;
}

const jmespathExt = jmespath as unknown as JMESPathExtended;

/**
 * Result of validating a JMESPath expression or regex pattern.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Maximum allowed length for JMESPath expressions.
 */
export const MAX_EXPRESSION_LENGTH = 1000;

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
    jmespathExt.compile(expression);
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
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Compiles a JMESPath expression.
 * Wrapper around jmespath.compile() with proper typing.
 *
 * @param expression - The JMESPath expression to compile
 * @returns The compiled expression object
 * @throws Error if the expression is invalid
 */
export function compileJMESPath(expression: string): unknown {
  return jmespathExt.compile(expression);
}

/**
 * Safely searches data using a JMESPath expression.
 * Wrapper around jmespath.search() with proper typing.
 *
 * @param data - The data to search
 * @param expression - The JMESPath expression
 * @returns The search result
 *
 * @example
 * ```typescript
 * const data = { users: [{ name: 'Alice' }] };
 * const name = searchJMESPath<string>(data, 'users[0].name');
 * // name is 'Alice'
 * ```
 */
export function searchJMESPath<T = unknown>(data: unknown, expression: string): T {
  return jmespath.search(data, expression) as T;
}
