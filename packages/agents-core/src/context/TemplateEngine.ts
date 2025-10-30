import jmespath from 'jmespath';
import { getLogger } from '../utils/logger';

const logger = getLogger('template-engine');

export interface TemplateContext {
  [key: string]: unknown;
}

export interface TemplateRenderOptions {
  strict?: boolean; // If true, throw errors for missing variables
  preserveUnresolved?: boolean; // If true, keep unresolved templates as-is
}

export class TemplateEngine {
  private static readonly DEFAULT_OPTIONS: Required<TemplateRenderOptions> = {
    strict: false,
    preserveUnresolved: false,
  };

  /**
   * Render a template string with context data using JMESPath
   */
  static render(
    template: string,
    context: TemplateContext,
    options: TemplateRenderOptions = {}
  ): string {
    const opts = { ...TemplateEngine.DEFAULT_OPTIONS, ...options };

    try {
      // Process template variables using JMESPath
      const rendered = TemplateEngine.processVariables(template, context, opts);

      // Check for unresolved variables if strict mode
      if (opts.strict && TemplateEngine.hasTemplateVariables(rendered)) {
        const unresolvedVars = TemplateEngine.extractTemplateVariables(rendered);
        throw new Error(`Unresolved template variables: ${unresolvedVars.join(', ')}`);
      }

      return rendered;
    } catch (error) {
      logger.error(
        {
          template: template.substring(0, 100) + (template.length > 100 ? '...' : ''),
          contextKeys: Object.keys(context),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Template rendering failed'
      );
      throw error;
    }
  }

  /**
   * Process variable substitutions {{variable.path}} using JMESPath
   */
  private static processVariables(
    template: string,
    context: TemplateContext,
    options: Required<TemplateRenderOptions>
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();

      try {
        // Handle special built-in variables
        if (trimmedPath.startsWith('$')) {
          return TemplateEngine.processBuiltinVariable(trimmedPath);
        }

        // Use JMESPath to extract value from context
        const result = jmespath.search(context, trimmedPath);

        if (result === undefined || result === null) {
          if (options.strict) {
            throw new Error(`Template variable '${trimmedPath}' not found in context`);
          }

          if (options.preserveUnresolved) {
            return match; // Keep original template
          }

          // Enhanced debugging for headers issues
          if (trimmedPath.startsWith('headers.')) {
            logger.warn(
              {
                variable: trimmedPath,
                availableKeys: Object.keys(context),
                contextStructure: JSON.stringify(context, null, 2),
                headersContent: context.headers
                  ? JSON.stringify(context.headers, null, 2)
                  : 'undefined',
              },
              'Headers template variable debugging'
            );
          } else {
            logger.warn(
              {
                variable: trimmedPath,
                availableKeys: Object.keys(context),
              },
              'Template variable not found in context'
            );
          }
          return ''; // Replace with empty string
        }

        // Handle different types of values
        if (typeof result === 'object') {
          return JSON.stringify(result);
        }

        return String(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (options.strict) {
          throw new Error(`Failed to resolve template variable '${trimmedPath}': ${errorMessage}`);
        }

        logger.error(
          {
            variable: trimmedPath,
            error: errorMessage,
          },
          'Failed to resolve template variable'
        );

        return options.preserveUnresolved ? match : '';
      }
    });
  }

  /**
   * Process built-in variables like $env, etc.
   */
  private static processBuiltinVariable(variable: string): string {
    // Check for environment variables like $env.NODE_ENV
    if (variable.startsWith('$env.')) {
      const envVar = variable.substring(5);
      return process.env[envVar] || '';
    }

    logger.warn(
      {
        variable,
      },
      'Unknown built-in variable'
    );
    return '';
  }

  /**
   * Check if template contains template variables
   */
  private static hasTemplateVariables(template: string): boolean {
    return /\{\{[^}]+\}\}/.test(template);
  }

  /**
   * Extract all template variables from a template
   */
  private static extractTemplateVariables(template: string): string[] {
    const variables: string[] = [];
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(regex);
    for (const match of matches) {
      if (!match[1]) {
        continue;
      }
      variables.push(match[1].trim());
    }
    return [...new Set(variables)]; // Remove duplicates
  }

  /**
   * Validate template syntax
   */
  static validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check for balanced braces
      const openBraces = (template.match(/\{\{/g) || []).length;
      const closeBraces = (template.match(/\}\}/g) || []).length;

      if (openBraces !== closeBraces) {
        errors.push(`Unbalanced template braces: ${openBraces} opening, ${closeBraces} closing`);
      }

      // Extract and validate variable paths
      const variables = TemplateEngine.extractTemplateVariables(template);
      for (const variable of variables) {
        if (variable.includes('{{') || variable.includes('}}')) {
          errors.push(`Nested template syntax in variable: ${variable}`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Template validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Preview template rendering with sample context
   */
  static preview(
    template: string,
    sampleContext: TemplateContext,
    options: TemplateRenderOptions = {}
  ): {
    rendered: string;
    variables: string[];
    errors: string[];
  } {
    const variables = TemplateEngine.extractTemplateVariables(template);
    const errors: string[] = [];

    let rendered = '';
    try {
      rendered = TemplateEngine.render(template, sampleContext, options);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown rendering error');
      rendered = template; // Return original template on error
    }

    return {
      rendered,
      variables,
      errors,
    };
  }
}
