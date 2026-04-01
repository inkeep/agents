import { describe, expect, it } from 'vitest';
import {
  type ParsedHttpRequest,
  validateHttpRequestHeaders,
} from '../../../domains/run/context/validation';

describe('validateHttpRequestHeaders', () => {
  it('should validate headers successfully with valid data', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-user-id': {
          type: 'string',
        },
        'content-type': {
          type: 'string',
        },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'x-user-id': 'user123',
        'content-type': 'application/json',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validatedContext).toEqual({
      'x-user-id': 'user123',
      'content-type': 'application/json',
    });
  });

  it('should handle validation errors for headers', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-user-id': {
          type: 'string',
        },
      },
      required: ['x-user-id'],
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        // Missing required x-user-id header
        'content-type': 'application/json',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
    expect(result.validatedContext).toBeUndefined();
  });

  it('should reject invalid HTTP requests without headers', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-user-id': { type: 'string' },
      },
    };

    const invalidRequest = { invalid: true };

    const result = await validateHttpRequestHeaders(headersSchema, invalidRequest as any);

    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('httpRequest');
    expect(result.errors[0].message).toContain(
      'Invalid HTTP request format - must contain headers'
    );
  });

  it('should validate camelCase schema properties against lowercased headers', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        mcpToken: { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        mcptoken: 'my-secret-token',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validatedContext).toEqual({
      mcptoken: 'my-secret-token',
    });
  });

  it('should enforce camelCase required entries against lowercased headers', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        mcpToken: { type: 'string' },
      },
      required: ['mcpToken'],
    };

    const httpRequestPresent: ParsedHttpRequest = {
      headers: {
        mcptoken: 'my-secret-token',
      },
    };

    const resultPresent = await validateHttpRequestHeaders(headersSchema, httpRequestPresent);
    expect(resultPresent.valid).toBe(true);
    expect(resultPresent.validatedContext).toEqual({ mcptoken: 'my-secret-token' });

    const httpRequestMissing: ParsedHttpRequest = {
      headers: {},
    };

    const resultMissing = await validateHttpRequestHeaders(headersSchema, httpRequestMissing);
    expect(resultMissing.valid).toBe(false);
    expect(resultMissing.errors.length).toBeGreaterThan(0);
  });

  it('should handle mixed case properties', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        McpToken: { type: 'string' },
        'x-api-key': { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        mcptoken: 'token-value',
        'x-api-key': 'key-value',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual({
      mcptoken: 'token-value',
      'x-api-key': 'key-value',
    });
  });

  it('should filter camelCase schema properties to only declared keys', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        authToken: { type: 'string' },
      },
    };

    const httpRequest: ParsedHttpRequest = {
      headers: {
        authtoken: 'bearer-xyz',
        'extra-header': 'should-be-filtered',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual({
      authtoken: 'bearer-xyz',
    });
    expect((result.validatedContext as any)?.['extra-header']).toBeUndefined();
  });

  it('should handle empty headers schema gracefully', async () => {
    const headersSchema = null;

    const httpRequest: ParsedHttpRequest = {
      headers: {
        'x-user-id': 'user123',
      },
    };

    const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
