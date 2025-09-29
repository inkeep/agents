import jmespath from 'jmespath';
import { getLogger } from '../logger';

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  transformedSchema?: any;
}

export interface JMESPathValidationResult {
  isLiteral: boolean;
  isValidSelector: boolean;
  suggestions?: string[];
}

/**
 * Centralized schema processing and validation utilities
 */
export class SchemaProcessor {
  private static logger = getLogger('SchemaProcessor');

  /**
   * Transform complex schema types to strings for JMESPath compatibility
   */
  static transformSchemaForJMESPath(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const transform = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(transform);
      }

      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'type' && typeof value === 'string') {
            // Transform all non-string types to string for JMESPath extraction
            result[key] = value === 'string' ? 'string' : 'string';
          } else {
            result[key] = transform(value);
          }
        }
        return result;
      }

      return obj;
    };

    return transform(schema);
  }

  /**
   * Validate if a selector looks like a valid JMESPath expression
   */
  static validateJMESPathSelector(selector: string): JMESPathValidationResult {
    // Check for literal value patterns first
    if (this.isLiteralValue(selector)) {
      return {
        isLiteral: true,
        isValidSelector: false,
      };
    }

    // Check for valid JMESPath patterns
    if (this.looksLikeJMESPath(selector)) {
      return {
        isLiteral: false,
        isValidSelector: true,
      };
    }

    return {
      isLiteral: false,
      isValidSelector: false,
    };
  }

  /**
   * Check if a selector looks like a JMESPath expression
   */
  private static looksLikeJMESPath(selector: string): boolean {
    // Simple dot notation (most common case)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(selector)) {
      return true;
    }

    // Multiple levels of nesting
    if (/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(selector)) {
      return true;
    }

    // Array access patterns
    if (/\[\d+\]/.test(selector) || /\[\*\]/.test(selector)) {
      return true;
    }

    // Filter expressions
    if (/\[.*?\]/.test(selector) && /[=<>!]/.test(selector)) {
      return true;
    }

    // Pipe expressions
    if (selector.includes('|')) {
      return true;
    }

    return false;
  }

  /**
   * Check if a selector appears to be a literal value rather than a JMESPath expression
   */
  private static isLiteralValue(selector: string): boolean {
    // If it looks like a valid JMESPath, it's not a literal
    if (this.looksLikeJMESPath(selector)) {
      return false;
    }

    // URL patterns
    if (/^https?:\/\//.test(selector)) {
      return true;
    }

    // Common literal patterns
    if (/^[0-9]+$/.test(selector)) { // Pure numbers
      return true;
    }

    if (selector.includes(' ') && !selector.includes('[')) { // Sentences without array syntax
      return true;
    }

    if (/^[a-zA-Z0-9\s\-_,;:!?.'"+()]+$/.test(selector) && selector.length > 20) {
      // Long text that looks like content
      return true;
    }

    return false;
  }

  /**
   * Safely extract data using JMESPath with validation
   */
  static safeJMESPathSearch(data: any, selector: string, fallback: any = null): any {
    try {
      const validation = this.validateJMESPathSelector(selector);
      
      if (validation.isLiteral) {
        this.logger.debug({ selector }, 'Selector appears to be literal value, returning as-is');
        return selector;
      }

      if (!validation.isValidSelector) {
        this.logger.warn({ selector }, 'Selector does not appear to be valid JMESPath');
        return fallback;
      }

      return jmespath.search(data, selector) || fallback;
    } catch (error) {
      this.logger.warn(
        { selector, error: error instanceof Error ? error.message : String(error) },
        'JMESPath search failed'
      );
      return fallback;
    }
  }

  /**
   * Validate schema structure for artifact components
   */
  static validateArtifactSchema(schema: any): SchemaValidationResult {
    const errors: string[] = [];

    if (!schema || typeof schema !== 'object') {
      errors.push('Schema must be an object');
      return { isValid: false, errors };
    }

    if (!schema.type || schema.type !== 'object') {
      errors.push('Schema must have type "object"');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      errors.push('Schema must have properties object');
    }

    const transformedSchema = this.transformSchemaForJMESPath(schema);

    return {
      isValid: errors.length === 0,
      errors,
      transformedSchema,
    };
  }

  /**
   * Extract property value with proper type conversion and validation
   */
  static extractPropertyValue(
    data: any,
    propName: string,
    selector: string,
    expectedType?: string
  ): any {
    const value = this.safeJMESPathSearch(data, selector);
    
    if (value === null || value === undefined) {
      return null;
    }

    // Type conversion based on expected type
    if (expectedType) {
      switch (expectedType) {
        case 'string':
          return String(value);
        case 'number':
          const num = Number(value);
          return isNaN(num) ? null : num;
        case 'boolean':
          return Boolean(value);
        case 'array':
          return Array.isArray(value) ? value : [value];
        default:
          return value;
      }
    }

    return value;
  }

  /**
   * Enhance schema with JMESPath guidance for artifact component schemas
   * Transforms all schema types to string selectors with helpful descriptions
   */
  static enhanceSchemaWithJMESPathGuidance(schema: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
      return schema || {};
    }

    // Transform schema to flatten all complex types to string selectors
    const transformToSelectorSchema = (obj: any, path: string = ''): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      // Handle array types - convert to string selector
      if (obj.type === 'array') {
        const itemDescription = obj.items?.description || 'array items';
        const arrayDescription = obj.description || 'array data';
        const isContentField = path.includes('content');
        
        return {
          type: 'string',
          description: `🎯 ARRAY SELECTOR: Provide JMESPath selector for ${arrayDescription}. RELATIVE to base selector - this will be applied to the item selected by base_selector. Example: "content.blocks" or "items" (NOT absolute paths like "result.content.blocks")`
        };
      }
      
      // Handle object types - convert to string selector unless it has properties
      if (obj.type === 'object' && !obj.properties) {
        const objectDescription = obj.description || 'object data';
        
        return {
          type: 'string', 
          description: `🎯 OBJECT SELECTOR: Provide JMESPath selector for ${objectDescription}. RELATIVE to base selector - this will be applied to the item selected by base_selector. Example: "metadata" or "spec.details" (NOT absolute paths)`
        };
      }
      
      // Handle object types with properties - transform each property
      if (obj.type === 'object' && obj.properties) {
        const transformedProperties: any = {};
        
        Object.entries(obj.properties).forEach(([propertyName, property]: [string, any]) => {
          const fullPath = path ? `${path}.${propertyName}` : propertyName;
          transformedProperties[propertyName] = transformToSelectorSchema(property, fullPath);
        });
        
        return {
          type: 'object',
          properties: transformedProperties,
          required: obj.required || [],
          description: `${obj.description || 'Object containing JMESPath selectors'} - Each property should be a selector RELATIVE to the base_selector`
        };
      }
      
      // Handle primitive types - convert to string selectors (all props are selectors)
      if (['string', 'number', 'boolean'].includes(obj.type)) {
        const originalDescription = obj.description || `${obj.type} value`;
        
        return {
          type: 'string',
          description: `🎯 FIELD SELECTOR: Provide JMESPath selector for ${originalDescription}. RELATIVE to base selector (e.g., "title", "metadata.category", "properties.value"). For nested data: use field paths like "content.details", "attributes.data", "specifications.info". NOT absolute paths and NOT literal values like "${originalDescription}". The base_selector finds the item, this selector extracts the field FROM that item.`
        };
      }
      
      // Fallback for unknown types
      return {
        type: 'string',
        description: `🎯 SELECTOR: Provide JMESPath selector RELATIVE to base selector. Example: "fieldName" or "nested.path" (NOT absolute paths)`
      };
    };

    return transformToSelectorSchema(schema);
  }
}