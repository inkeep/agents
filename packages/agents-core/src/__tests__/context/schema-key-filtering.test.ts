import { describe, expect, it } from 'vitest';
import {
  type ParsedHttpRequest,
  validateHttpRequestHeaders,
} from '../../middleware/contextValidation';

describe('Schema Key Filtering - Headers Only', () => {
  it('should filter out extra headers not defined in schema', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        authorization: { type: 'string' },
        'x-user-id': { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        authorization: 'Bearer token',
        'x-user-id': '123',
        'extra-header': 'should be filtered out', // Extra key not in schema
        'another-header': 'also filtered',
        'content-type': 'application/json', // Also not in schema
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toBeDefined();

    // Should only have schema-defined keys, not the extra ones
    expect(result.validatedContext).toEqual({
      authorization: 'Bearer token',
      'x-user-id': '123',
    });

    // Extra headers should be filtered out
    expect(result.validatedContext?.['extra-header']).toBeUndefined();
    expect(result.validatedContext?.['another-header']).toBeUndefined();
    expect(result.validatedContext?.['content-type']).toBeUndefined();
  });

  it('should handle schemas with no defined properties', async () => {
    const headersSchema = {
      type: 'object',
      // No properties defined - should allow anything
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'any-header': 'goes',
        'random-header': '42',
        'x-custom': 'value',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    // When no properties are defined, return the headers as-is
    expect(result.validatedContext).toEqual({
      'any-header': 'goes',
      'random-header': '42',
      'x-custom': 'value',
    });
  });

  it('should filter headers with nested object values correctly', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-user-info': {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
        'x-metadata': {
          type: 'object',
          properties: {
            version: { type: 'string' },
          },
        },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'x-user-info': {
          id: '123',
          name: 'John',
          email: 'john@example.com', // Extra key in nested object
        } as any, // Cast since headers are typically strings
        'x-metadata': {
          version: '1.0',
          extra: 'filtered', // Extra key
        } as any,
        'x-extra': 'should be filtered', // Extra header
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);

    // Should recursively filter nested objects
    expect(result.validatedContext).toEqual({
      'x-user-info': {
        id: '123',
        name: 'John',
        // email should be filtered out
      },
      'x-metadata': {
        version: '1.0',
        // extra should be filtered out
      },
      // 'x-extra' should be filtered out
    });
  });

  it('should handle optional schema properties', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        authorization: { type: 'string' },
        'x-user-id': { type: 'string' },
        'x-optional': { type: 'string' },
      },
      required: ['authorization'], // Only authorization is required
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        authorization: 'Bearer token',
        'x-user-id': '123',
        // 'x-optional' is missing but not required
        'extra-header': 'filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual({
      authorization: 'Bearer token',
      'x-user-id': '123',
      // 'x-optional' is undefined (not included)
      // 'extra-header' is filtered out
    });
  });

  it('should handle headers with array values', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-tags': {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'x-tags': [
          {
            name: 'env',
            value: 'prod',
            extra: 'filtered', // Should be filtered
          },
          {
            name: 'region',
            value: 'us-east',
            metadata: { created: '2023' }, // Should be filtered
          },
        ] as any,
        'other-header': 'filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);

    // Should recursively filter array items
    expect(result.validatedContext).toEqual({
      'x-tags': [
        {
          name: 'env',
          value: 'prod',
          // extra filtered out
        },
        {
          name: 'region',
          value: 'us-east',
          // metadata filtered out
        },
      ],
      // 'other-header' filtered out
    });
  });

  it('should return empty object when no headers match schema', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-required': { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'completely-different': 'value',
        'nothing-matches': 'schema',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    // No headers match the schema properties, so return empty object
    expect(result.validatedContext).toEqual({});
  });

  it('should handle null and undefined values gracefully', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-nullable': { type: ['string', 'null'] },
        'x-required': { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'x-nullable': null as any,
        'x-required': 'value',
        'x-undefined': undefined as any,
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual({
      'x-nullable': null,
      'x-required': 'value',
      // 'x-undefined' should be filtered out
    });
  });
});
