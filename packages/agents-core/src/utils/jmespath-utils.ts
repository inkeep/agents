import { z } from '@hono/zod-openapi';
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
 * @param data - The object to search (e.g., template context, webhook body, tool result)
 * @param expression - The JMESPath expression
 * @returns The search result
 *
 * @example
 * ```typescript
 * const data = { users: [{ name: 'Alice' }] };
 * const name = searchJMESPath<string>(data, 'users[0].name');
 * // name is 'Alice'
 *
 * // Common use cases:
 * // - Template contexts: { headers: {...}, body: {...} }
 * // - Webhook payloads: { event: "...", data: {...} }
 * // - Tool results: { status: "success", result: {...} }
 * ```
 */
export function searchJMESPath<T = unknown>(data: Record<string, unknown>, expression: string): T {
  return jmespath.search(data, expression) as T;
}

/**
 * Normalize a JMESPath expression by wrapping property names with dashes in quotes.
 * JMESPath requires identifiers with special characters (like dashes) to be quoted.
 *
 * @param path - The JMESPath expression to normalize
 * @returns The normalized JMESPath expression
 *
 * @example
 * ```typescript
 * normalizeJMESPath('headers.x-tenant-id');
 * // Returns: 'headers."x-tenant-id"'
 *
 * normalizeJMESPath('api-responses[0].response-code');
 * // Returns: '"api-responses"[0]."response-code"'
 *
 * normalizeJMESPath('simple.path');
 * // Returns: 'simple.path' (unchanged)
 * ```
 */
export function normalizeJMESPath(path: string): string {
  const segments = path.split('.');
  return segments
    .map((segment) => {
      if (!segment.includes('-')) {
        return segment;
      }

      if (segment.startsWith('"') && segment.includes('"')) {
        return segment;
      }

      const bracketIndex = segment.indexOf('[');
      if (bracketIndex !== -1) {
        const propertyName = segment.substring(0, bracketIndex);
        const arrayAccess = segment.substring(bracketIndex);
        return `"${propertyName}"${arrayAccess}`;
      }

      return `"${segment}"`;
    })
    .join('.');
}

/**
 * Dangerous patterns that should not appear in JMESPath expressions.
 * These patterns are checked during secure validation to prevent injection attacks.
 */
export const DANGEROUS_PATTERNS: RegExp[] = [
  /\$\{.*\}/, // Template injection
  /eval\s*\(/, // Eval calls
  /function\s*\(/, // Function definitions
  /constructor/, // Constructor access
  /prototype/, // Prototype access
  /__proto__/, // Proto access
];

/**
 * Options for secure JMESPath validation.
 */
export interface SecurityOptions {
  maxLength?: number;
  dangerousPatterns?: RegExp[];
}

/**
 * Validates a JMESPath expression with security checks.
 * Performs checks in order of cost: length (O(1)), patterns (O(n)), compile (expensive).
 *
 * @param expression - The JMESPath expression to validate
 * @param options - Optional security options
 * @returns ValidationResult with valid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateJMESPathSecure('body.user.id');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * // With custom options
 * const result2 = validateJMESPathSecure('expression', { maxLength: 500 });
 * ```
 */
export function validateJMESPathSecure(
  expression: string,
  options?: SecurityOptions
): ValidationResult {
  if (!expression || typeof expression !== 'string') {
    return {
      valid: false,
      error: 'JMESPath expression must be a non-empty string',
    };
  }

  const maxLength = options?.maxLength ?? MAX_EXPRESSION_LENGTH;
  const patterns = options?.dangerousPatterns ?? DANGEROUS_PATTERNS;

  // Check length first (O(1))
  if (expression.length > maxLength) {
    return {
      valid: false,
      error: `JMESPath expression exceeds maximum length of ${maxLength} characters`,
    };
  }

  // Check dangerous patterns second (O(n))
  for (const pattern of patterns) {
    if (pattern.test(expression)) {
      return {
        valid: false,
        error: `JMESPath expression contains dangerous pattern: ${pattern.source}`,
      };
    }
  }

  // Compile last (expensive)
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
 * Options for jmespathString Zod schema factory.
 */
export interface JMESPathStringOptions {
  maxLength?: number;
}

/**
 * Creates a Zod string schema for JMESPath expressions with OpenAPI-visible constraints.
 * Includes maxLength constraint and a description with valid/invalid examples.
 *
 * @param options - Optional configuration for the schema
 * @returns A Zod string schema with maxLength and description
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   transform: jmespathString().optional(),
 * });
 * ```
 */
export function jmespathString(options?: JMESPathStringOptions) {
  const maxLen = options?.maxLength ?? MAX_EXPRESSION_LENGTH;

  return z
    .string()
    .max(maxLen)
    .describe(
      `JMESPath expression (max ${maxLen} chars). Valid: "data.items[0].name", "results[?status=='active']", "keys(@)". Invalid: "\${...}" (template injection), "eval" calls, "constructor", "__proto__".`
    );
}
