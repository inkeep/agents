import { describe, expect, it } from 'vitest';
import { SchemaProcessor } from '../SchemaProcessor';

describe('SchemaProcessor.makeAllPropertiesRequired', () => {
  describe('basic object normalization', () => {
    it('should make all properties required in a flat schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual(['name', 'age']);
      expect(result.properties.name).toEqual({ type: 'string' });
      expect(result.properties.age).toEqual({ type: 'number' });
    });

    it('should preserve existing required array while making all properties required', () => {
      const schema = {
        type: 'object',
        properties: {
          required: { type: 'string' },
          optional: { type: 'string' },
        },
        required: ['required'],
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual(['required', 'optional']);
    });
  });

  describe('nested object properties', () => {
    it('should recursively normalize nested object properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual(['user']);
      expect(result.properties.user.required).toEqual(['email', 'name']);
    });

    it('should handle deeply nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual(['level1']);
      expect(result.properties.level1.required).toEqual(['level2']);
      expect(result.properties.level1.properties.level2.required).toEqual(['level3']);
    });
  });

  describe('array items', () => {
    it('should normalize object schemas in array items', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                value: { type: 'number' },
              },
            },
          },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.properties.items.items.required).toEqual(['id', 'value']);
    });

    it('should handle nested arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          matrix: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  cell: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.properties.matrix.items.items.required).toEqual(['cell']);
    });
  });

  describe('union types', () => {
    it('should normalize all schemas in anyOf', () => {
      const schema = {
        anyOf: [
          {
            type: 'object',
            properties: { a: { type: 'string' } },
          },
          {
            type: 'object',
            properties: { b: { type: 'number' } },
          },
        ],
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.anyOf[0].required).toEqual(['a']);
      expect(result.anyOf[1].required).toEqual(['b']);
    });

    it('should normalize all schemas in oneOf', () => {
      const schema = {
        oneOf: [
          {
            type: 'object',
            properties: { type: { type: 'string' } },
          },
          {
            type: 'object',
            properties: { kind: { type: 'string' } },
          },
        ],
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.oneOf[0].required).toEqual(['type']);
      expect(result.oneOf[1].required).toEqual(['kind']);
    });

    it('should normalize all schemas in allOf', () => {
      const schema = {
        allOf: [
          {
            type: 'object',
            properties: { base: { type: 'string' } },
          },
          {
            type: 'object',
            properties: { extended: { type: 'string' } },
          },
        ],
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.allOf[0].required).toEqual(['base']);
      expect(result.allOf[1].required).toEqual(['extended']);
    });
  });

  describe('edge cases', () => {
    it('should handle null input', () => {
      const result = SchemaProcessor.makeAllPropertiesRequired(null);
      expect(result).toBeNull();
    });

    it('should handle undefined input', () => {
      const result = SchemaProcessor.makeAllPropertiesRequired(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle schemas without properties', () => {
      const schema = { type: 'object' };
      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;
      expect(result).toEqual({ type: 'object' });
    });

    it('should handle primitive type schemas', () => {
      const schema = { type: 'string' };
      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;
      expect(result).toEqual({ type: 'string' });
    });

    it('should handle empty properties object', () => {
      const schema = {
        type: 'object',
        properties: {},
      };
      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;
      expect(result.required).toEqual([]);
    });

    it('should not mutate original schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const original = JSON.parse(JSON.stringify(schema));

      SchemaProcessor.makeAllPropertiesRequired(schema);

      expect(schema).toEqual(original);
    });
  });

  describe('real-world schemas', () => {
    it('should normalize fact data component schema', () => {
      const schema = {
        type: 'object',
        properties: {
          fact: {
            type: 'string',
            nullable: true,
            description: 'a true fact that is supported by citations',
          },
        },
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual(['fact']);
      expect(result.properties.fact.nullable).toBe(true);
      expect(result.properties.fact.description).toBe('a true fact that is supported by citations');
    });

    it('should normalize artifact component schema with nested selectors', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tool_call_id: { type: 'string' },
          type: { type: 'string', enum: ['Article'] },
          base_selector: { type: 'string' },
          details_selector: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              metadata: {
                type: 'object',
                properties: {
                  author: { type: 'string' },
                  date: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['id', 'tool_call_id', 'type', 'base_selector'],
      };

      const result = SchemaProcessor.makeAllPropertiesRequired(schema) as any;

      expect(result.required).toEqual([
        'id',
        'tool_call_id',
        'type',
        'base_selector',
        'details_selector',
      ]);
      expect(result.properties.details_selector.required).toEqual(['title', 'content', 'metadata']);
      expect(result.properties.details_selector.properties.metadata.required).toEqual([
        'author',
        'date',
      ]);
    });
  });
});
