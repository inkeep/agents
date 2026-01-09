import { describe, expect, it } from 'vitest';
import { type ParsedHttpRequest, validateHttpRequestHeaders } from '../../context/validation';

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
        'extra-header': 'should be filtered out',
        'another-header': 'also filtered',
        'content-type': 'application/json',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toBeDefined();

    expect(result.validatedContext).toEqual({
      authorization: 'Bearer token',
      'x-user-id': '123',
    });

    expect((result.validatedContext as any)?.['extra-header']).toBeUndefined();
    expect((result.validatedContext as any)?.['another-header']).toBeUndefined();
    expect((result.validatedContext as any)?.['content-type']).toBeUndefined();
  });

  it('should handle schemas with no defined properties', async () => {
    const headersSchema = {
      type: 'object',
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
          email: 'john@example.com',
        } as any,
        'x-metadata': {
          version: '1.0',
          extra: 'filtered',
        } as any,
        'x-extra': 'should be filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);

    expect(result.validatedContext).toEqual({
      'x-user-info': {
        id: '123',
        name: 'John',
      },
      'x-metadata': {
        version: '1.0',
      },
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
      required: ['authorization'],
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        authorization: 'Bearer token',
        'x-user-id': '123',
        'extra-header': 'filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual({
      authorization: 'Bearer token',
      'x-user-id': '123',
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
            extra: 'filtered',
          },
          {
            name: 'region',
            value: 'us-east',
            metadata: { created: '2023' },
          },
        ] as any,
        'other-header': 'filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);

    expect(result.validatedContext).toEqual({
      'x-tags': [
        {
          name: 'env',
          value: 'prod',
        },
        {
          name: 'region',
          value: 'us-east',
        },
      ],
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
    });
  });
});
