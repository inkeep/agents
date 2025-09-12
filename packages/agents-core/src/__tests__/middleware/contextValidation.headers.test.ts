import { describe, expect, it } from 'vitest';
import {
  validateHttpRequestHeaders,
  type ParsedHttpRequest,
} from '../../middleware/contextValidation';

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
