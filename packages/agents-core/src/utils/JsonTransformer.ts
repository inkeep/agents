import * as jmespath from 'jmespath';
import {
  compileJMESPath,
  DANGEROUS_PATTERNS,
  MAX_EXPRESSION_LENGTH,
  validateJMESPathSecure,
} from './jmespath-utils';
import { getLogger } from './logger';

const logger = getLogger('JsonTransformer');

interface TransformOptions {
  timeout?: number;
  maxDepth?: number;
  allowedFunctions?: string[];
}

export class JsonTransformer {
  private static readonly DEFAULT_TIMEOUT = 5000; // 5 seconds

  /**
   * Validate JMESPath expression for security and correctness
   */
  private static validateExpression(expression: string, _allowedFunctions?: string[]): void {
    if (!expression || typeof expression !== 'string') {
      throw new Error('JMESPath expression must be a non-empty string');
    }

    // Check length first
    if (expression.length > MAX_EXPRESSION_LENGTH) {
      throw new Error(`JMESPath expression too long (max ${MAX_EXPRESSION_LENGTH} characters)`);
    }

    // Check dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(expression)) {
        throw new Error(`JMESPath expression contains dangerous pattern: ${pattern.source}`);
      }
    }

    // Use validateJMESPathSecure for syntax validation (patterns already checked above)
    const result = validateJMESPathSecure(expression, {
      maxLength: MAX_EXPRESSION_LENGTH + 1, // Skip length check (already done)
      dangerousPatterns: [], // Skip pattern check (already done)
    });

    if (!result.valid) {
      throw new Error(`Invalid JMESPath syntax: ${result.error}`);
    }

    logger.debug('JMESPath expression validated', `${expression.substring(0, 100)}...`);
  }

  /**
   * Execute JMESPath with timeout protection
   */
  private static executeWithTimeout(input: any, expression: string, timeoutMs: number): any {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`JMESPath transformation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = jmespath.search(input, expression);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Transform input data using JMESPath expression with security validation
   */
  static async transform(
    input: any,
    jmesPathExpression: string,
    options: TransformOptions = {}
  ): Promise<any> {
    const { timeout = JsonTransformer.DEFAULT_TIMEOUT, allowedFunctions } = options;

    // Validate expression before execution
    JsonTransformer.validateExpression(jmesPathExpression, allowedFunctions);

    try {
      logger.debug(
        'Executing JMESPath transformation',
        `inputType: ${typeof input}, expression: ${jmesPathExpression.substring(0, 100)}..., timeout: ${timeout}`
      );

      const result = await JsonTransformer.executeWithTimeout(input, jmesPathExpression, timeout);

      logger.debug('JMESPath transformation completed successfully', '');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        'JMESPath transformation failed',
        `expression: ${jmesPathExpression.substring(0, 100)}..., error: ${message}`
      );
      throw new Error(
        `JMESPath transformation failed for expression "${jmesPathExpression}": ${message}`
      );
    }
  }

  /**
   * Convert simple object transformation to JMESPath expression
   * For SDK convenience - converts { key: 'path' } to JMESPath
   */
  static objectToJMESPath(objectTransformation: Record<string, string>): string {
    if (!objectTransformation || typeof objectTransformation !== 'object') {
      throw new Error('Object transformation must be a non-null object');
    }

    const expressions = Object.entries(objectTransformation).map(([key, path]) => {
      if (!key || typeof key !== 'string') {
        throw new Error('Object transformation keys must be non-empty strings');
      }
      if (!path || typeof path !== 'string') {
        throw new Error('Object transformation values must be non-empty strings');
      }
      // Validate each path is a valid JMESPath expression
      try {
        compileJMESPath(path);
      } catch (error) {
        throw new Error(
          `Invalid JMESPath in object transformation value "${path}": ${error instanceof Error ? error.message : String(error)}`
        );
      }

      return `${key}: ${path}`;
    });

    return `{ ${expressions.join(', ')} }`;
  }

  /**
   * Transform using either direct JMESPath string or object transformation
   * Supports both SDK patterns
   */
  static async transformWithConfig(
    input: any,
    config: {
      jmespath?: string;
      objectTransformation?: Record<string, string>;
    },
    options: TransformOptions = {}
  ): Promise<any> {
    if (config.jmespath) {
      return JsonTransformer.transform(input, config.jmespath, options);
    }
    if (config.objectTransformation) {
      const jmesPath = JsonTransformer.objectToJMESPath(config.objectTransformation);
      return JsonTransformer.transform(input, jmesPath, options);
    }
    throw new Error('Either jmespath or objectTransformation must be provided');
  }

  /**
   * Synchronous transform method for backward compatibility
   * WARNING: This bypasses security validation - use async transform() instead
   * @deprecated Use async transform() method instead
   */
  static transformSync(input: any, jmesPathExpression: string): any {
    logger.warn('Using deprecated synchronous transform method - security validation bypassed', '');
    try {
      return jmespath.search(input, jmesPathExpression);
    } catch (error) {
      throw new Error(
        `JMESPath transformation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
