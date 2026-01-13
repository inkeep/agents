import * as jmespath from 'jmespath';

export class JsonTransformer {
  /**
   * Transform input data using JMESPath expression
   */
  static transform(input: any, jmesPathExpression: string): any {
    try {
      return jmespath.search(input, jmesPathExpression);
    } catch (error) {
      throw new Error(`JMESPath transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert simple object transformation to JMESPath expression
   * For SDK convenience - converts { key: 'path' } to JMESPath
   */
  static objectToJMESPath(objectTransformation: Record<string, string>): string {
    const expressions = Object.entries(objectTransformation).map(([key, path]) => {
      return `${key}: ${path}`;
    });
    
    return `{ ${expressions.join(', ')} }`;
  }

  /**
   * Transform using either direct JMESPath string or object transformation
   * Supports both SDK patterns
   */
  static transformWithConfig(input: any, config: {
    jmespath?: string;
    objectTransformation?: Record<string, string>;
  }): any {
    if (config.jmespath) {
      return this.transform(input, config.jmespath);
    } else if (config.objectTransformation) {
      const jmesPath = this.objectToJMESPath(config.objectTransformation);
      return this.transform(input, jmesPath);
    } else {
      throw new Error('Either jmespath or objectTransformation must be provided');
    }
  }
}