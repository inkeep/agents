import { describe, expect, it } from 'vitest';
import {
  makeAllPropertiesRequired,
  normalizeDataComponentSchema,
  stripUnsupportedConstraints,
} from '../schema-conversion';

describe('stripUnsupportedConstraints', () => {
  it('strips minimum and maximum from number types', () => {
    const schema = {
      type: 'object',
      properties: {
        score: { type: 'number', minimum: 0, maximum: 1, description: 'A score' },
      },
    };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result.properties.score).not.toHaveProperty('minimum');
    expect(result.properties.score).not.toHaveProperty('maximum');
    expect(result.properties.score.type).toBe('number');
  });

  it('strips exclusiveMinimum, exclusiveMaximum, and multipleOf from number types', () => {
    const schema = {
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
      multipleOf: 5,
    };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result).not.toHaveProperty('exclusiveMinimum');
    expect(result).not.toHaveProperty('exclusiveMaximum');
    expect(result).not.toHaveProperty('multipleOf');
  });

  it('strips constraints from integer types', () => {
    const schema = { type: 'integer', minimum: 1, maximum: 10 };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result).not.toHaveProperty('minimum');
    expect(result).not.toHaveProperty('maximum');
  });

  it('does not strip minimum/maximum from non-number types', () => {
    const schema = { type: 'string', minLength: 1, maxLength: 100 };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result.minLength).toBe(1);
    expect(result.maxLength).toBe(100);
  });

  it('strips recursively in nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            value: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result.properties.nested.properties.value).not.toHaveProperty('minimum');
    expect(result.properties.nested.properties.value).not.toHaveProperty('maximum');
  });

  it('strips recursively in array items', () => {
    const schema = {
      type: 'array',
      items: { type: 'number', minimum: 0, maximum: 100 },
    };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result.items).not.toHaveProperty('minimum');
    expect(result.items).not.toHaveProperty('maximum');
  });

  it('strips recursively in anyOf', () => {
    const schema = {
      anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
    };
    const result = stripUnsupportedConstraints(schema) as any;
    expect(result.anyOf[0]).not.toHaveProperty('minimum');
  });

  it('handles null and undefined gracefully', () => {
    expect(stripUnsupportedConstraints(null)).toBeNull();
    expect(stripUnsupportedConstraints(undefined)).toBeUndefined();
  });
});

describe('makeAllPropertiesRequired', () => {
  it('adds all property keys to required', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['name'],
    };
    const result = makeAllPropertiesRequired(schema) as any;
    expect(result.required).toEqual(['name', 'score']);
  });

  it('wraps originally-optional fields as nullable', () => {
    const schema = {
      type: 'object',
      properties: {
        required_field: { type: 'string' },
        optional_field: { type: 'string' },
      },
      required: ['required_field'],
    };
    const result = makeAllPropertiesRequired(schema) as any;
    expect(result.properties.required_field).toEqual({ type: 'string' });
    expect(result.properties.optional_field).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });
});

describe('normalizeDataComponentSchema', () => {
  it('fixes the exact schema from the bug report', () => {
    const schema = {
      type: 'object',
      required: [
        'question',
        'category',
        'draft_answer',
        'confidence_score',
        'confidence_level',
        'sources_used',
        'needs_sme_review',
      ],
      properties: {
        question: { type: 'string', description: 'The original RFP question' },
        confidence_score: {
          type: 'number',
          maximum: 1,
          minimum: 0,
          description: 'Confidence score from 0.0 to 1.0',
        },
        limitations: {
          type: 'array',
          items: { type: 'string', description: 'A specific limitation' },
          description: 'Any stated limitations',
        },
      },
      additionalProperties: false,
    };

    const result = normalizeDataComponentSchema(schema) as any;

    // Anthropic fix: minimum/maximum stripped from number
    expect(result.properties.confidence_score).not.toHaveProperty('minimum');
    expect(result.properties.confidence_score).not.toHaveProperty('maximum');

    // OpenAI fix: limitations now in required
    expect(result.required).toContain('limitations');
  });

  it('produces a schema where all properties are in required', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number', minimum: 0, maximum: 10 },
      },
      required: ['a'],
    };
    const result = normalizeDataComponentSchema(schema) as any;
    expect(result.required).toEqual(['a', 'b']);
    expect(result.properties.b).not.toHaveProperty('minimum');
    expect(result.properties.b).not.toHaveProperty('maximum');
  });
});
