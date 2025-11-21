import { describe, expect, it } from 'vitest';
import { validatePropsAsJsonSchema } from '../props-validation';

describe('validatePropsAsJsonSchema', () => {
  describe('Valid schemas', () => {
    it('should validate a valid schema with descriptions', () => {
      const validProps = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the user',
          },
          age: {
            type: 'number',
            description: 'The age of the user',
          },
        },
      };

      const result = validatePropsAsJsonSchema(validProps);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow empty props (null)', () => {
      const result = validatePropsAsJsonSchema(null);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow empty props (undefined)', () => {
      const result = validatePropsAsJsonSchema(undefined);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow empty props (empty object)', () => {
      const result = validatePropsAsJsonSchema({});
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate schema with required array', () => {
      const validProps = {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'User email address',
          },
          username: {
            type: 'string',
            description: 'Unique username',
          },
        },
        required: ['email'],
      };

      const result = validatePropsAsJsonSchema(validProps);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid schemas - missing descriptions', () => {
    it('should reject schema with property missing description', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('props.properties.name');
      expect(result.errors[0]?.message).toContain(
        'must have a non-empty "description" field for LLM compatibility'
      );
    });

    it('should reject schema with empty description', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          age: {
            type: 'number',
            description: '',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('props.properties.age');
    });

    it('should reject schema with whitespace-only description', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: '   ',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('props.properties.status');
    });

    it('should reject schema with non-string description', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 123,
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('props.properties.count');
    });

    it('should reject schema with multiple properties missing descriptions', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          age: {
            type: 'number',
          },
          email: {
            type: 'string',
            description: 'User email',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map((e) => e.field)).toContain('props.properties.name');
      expect(result.errors.map((e) => e.field)).toContain('props.properties.age');
    });
  });

  describe('Invalid schemas - structure issues', () => {
    it('should reject non-object props', () => {
      const result = validatePropsAsJsonSchema('invalid');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.message).toContain('must be a valid JSON Schema object');
    });

    it('should reject array props', () => {
      const result = validatePropsAsJsonSchema([]);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.message).toContain('must be a valid JSON Schema object');
    });

    it('should reject schema without type field', () => {
      const invalidProps = {
        properties: {
          name: {
            type: 'string',
            description: 'Name',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('props.type');
      expect(result.errors[0]?.message).toContain('must have a "type" field');
    });

    it('should reject schema with non-object type', () => {
      const invalidProps = {
        type: 'string',
        properties: {
          name: {
            type: 'string',
            description: 'Name',
          },
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.message).toContain('type must be "object"');
    });

    it('should reject schema without properties', () => {
      const invalidProps = {
        type: 'object',
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('props.properties');
      expect(result.errors[0]?.message).toContain('must have a "properties" object');
    });

    it('should reject schema with invalid required field', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'User name',
          },
        },
        required: 'name',
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('props.required');
      expect(result.errors[0]?.message).toContain('"required" must be an array');
    });
  });

  describe('Edge cases', () => {
    it('should handle property with null value', () => {
      const invalidProps = {
        type: 'object',
        properties: {
          data: null,
        },
      };

      const result = validatePropsAsJsonSchema(invalidProps);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('props.properties.data');
    });

    it('should validate complex nested schema with descriptions', () => {
      const validProps = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            description: 'User information',
            properties: {
              name: {
                type: 'string',
                description: 'User full name',
              },
            },
          },
        },
      };

      const result = validatePropsAsJsonSchema(validProps);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

