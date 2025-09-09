import type { ContextFetchDefinition } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextFetcher } from '../../context/ContextFetcher';
import { dbClient } from '../setup';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Date.now for consistent timing tests
const mockDateNow = vi.fn();
const originalDateNow = Date.now;
Date.now = mockDateNow;

describe('ContextFetcher', () => {
  let fetcher: ContextFetcher;
  const tenantId = 'test-tenant';

  beforeEach(() => {
    fetcher = new ContextFetcher(tenantId, 'test-project', dbClient);
    mockFetch.mockClear();
    mockDateNow.mockClear();

    // Set up a simple timing mock - start at 1000, increment by 10 each call
    let currentTime = 1000;
    mockDateNow.mockImplementation(() => {
      const result = currentTime;
      currentTime += 10;
      return result;
    });
  });

  describe('template interpolation', () => {
    it('should interpolate simple template variables', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/users/{{context.userId}}',
          method: 'GET',
        },
      };

      const context = {
        context: {
          userId: '12345',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ id: '12345', name: 'John Doe' }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/12345',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should interpolate nested context variables using JMESPath', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/users/{{user.profile.id}}/posts',
          method: 'GET',
        },
      };

      const context = {
        user: {
          profile: {
            id: 'user-456',
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ posts: [] }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/user-456/posts',
        expect.any(Object)
      );
    });

    it('should interpolate template variables in headers', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{auth.token}}',
            'X-User-ID': '{{user.id}}',
          },
        },
      };

      const context = {
        auth: { token: 'abc123' },
        user: { id: 'user-789' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: 'test' }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer abc123',
            'X-User-ID': 'user-789',
          },
        })
      );
    });

    it('should interpolate template variables in request body', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'POST',
          body: {
            userId: '{{user.id}}',
            query: 'Find data for {{user.name}}',
            nested: {
              value: '{{config.setting}}',
            },
          },
        },
      };

      const context = {
        user: { id: 'user-123', name: 'Alice' },
        config: { setting: 'production' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ results: [] }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            userId: 'user-123',
            query: 'Find data for Alice',
            nested: {
              value: 'production',
            },
          }),
        })
      );
    });

    it('should leave unresolved template variables as-is', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/{{missing.variable}}/data',
          method: 'GET',
        },
      };

      const context = {
        existing: { value: 'test' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: 'test' }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/{{missing.variable}}/data',
        expect.any(Object)
      );
    });
  });

  describe('HTTP request handling', () => {
    it('should handle successful JSON responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      const expectedData = { id: 1, name: 'Test Data' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => expectedData,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual(expectedData);
    });

    it('should handle successful text responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      const expectedText = 'Hello, World!';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => expectedText,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toBe(expectedText);
    });

    it('should handle HTTP error responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found',
        headers: {
          get: (key: string) => (key === 'content-type' ? 'text/plain' : null),
        },
      });

      await expect(fetcher.fetch(definition, {})).rejects.toThrow(
        'HTTP 404: Not Found - Resource not found'
      );
    });

    it('should handle network errors', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetcher.fetch(definition, {})).rejects.toThrow('Network error');
    });

    it('should respect custom timeout', async () => {
      const customTimeout = 5000;
      const customFetcher = new ContextFetcher(
        tenantId,
        'test-project',
        dbClient,
        undefined,
        customTimeout
      );

      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
          timeout: 2000, // Override default
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({}),
      });

      await customFetcher.fetch(definition, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('response transformation', () => {
    it('should transform response using JMESPath', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
          transform: 'users[0].name',
        },
      };

      const responseData = {
        users: [
          { id: 1, name: 'John Doe' },
          { id: 2, name: 'Jane Smith' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => responseData,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toBe('John Doe');
    });

    it('should transform response using JMESPath expressions', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
          transform: 'length(items)',
        },
      };

      const responseData = {
        items: ['a', 'b', 'c'],
        metadata: { total: 3 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => responseData,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toBe(3);
    });

    it('should return original data if transformation fails', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
          transform: 'invalid.jmespath[syntax',
        },
      };

      const responseData = { data: 'original' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => responseData,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual(responseData);
    });
  });

  describe('response validation', () => {
    it('should validate response against JSON schema (object)', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/user',
          method: 'GET',
        },
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      };

      const validResponse = { id: '123', name: 'John Doe' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => validResponse,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual(validResponse);
    });

    it('should reject response that fails JSON schema validation', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/user',
          method: 'GET',
        },
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      };

      const invalidResponse = { id: '123' }; // Missing required 'name' field

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => invalidResponse,
      });

      await expect(fetcher.fetch(definition, {})).rejects.toThrow('Response validation failed');
    });

    it('should validate array responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/users',
          method: 'GET',
        },
        responseSchema: {
          type: 'array',
        },
      };

      const validResponse = [{ id: '1' }, { id: '2' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => validResponse,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual(validResponse);
    });

    it('should validate primitive type responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/count',
          method: 'GET',
        },
        responseSchema: {
          type: 'number',
        },
      };

      const validResponse = 42;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => validResponse,
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toBe(validResponse);
    });
  });

  describe('test method', () => {
    it('should return success result for valid fetch', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      const responseData = { success: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => responseData,
      });

      const result = await fetcher.test(definition, {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should return error result for failed fetch', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
        credentialReferenceId: 'apiData',
      };

      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await fetcher.test(definition, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty context gracefully', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/static',
          method: 'GET',
        },
        credentialReferenceId: 'staticData',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: 'static' }),
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual({ data: 'static' });
    });

    it('should handle malformed JSON responses', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
        credentialReferenceId: 'apiData',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(fetcher.fetch(definition, {})).rejects.toThrow('Invalid JSON');
    });

    it('should handle missing content-type header', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
        credentialReferenceId: 'apiData',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'plain text response',
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toBe('plain text response');
    });

    it('should handle complex nested template interpolation', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/{{org.settings.api.endpoint}}/{{user.profile.id}}',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{auth.tokens[0].value}}',
          },
          body: {
            query: {
              userId: '{{user.profile.id}}',
              filters: {
                status: '{{request.filters.status}}',
                dateRange: {
                  start: '{{request.dateRange.start}}',
                  end: '{{request.dateRange.end}}',
                },
              },
            },
          },
        },
        credentialReferenceId: 'complexQuery',
      };

      const context = {
        org: {
          settings: {
            api: { endpoint: 'users' },
          },
        },
        user: {
          profile: { id: 'user-123' },
        },
        auth: {
          tokens: [{ value: 'token-abc' }],
        },
        request: {
          filters: { status: 'active' },
          dateRange: { start: '2023-01-01', end: '2023-12-31' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ results: [] }),
      });

      await fetcher.fetch(definition, context);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/user-123',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer token-abc',
          },
          body: JSON.stringify({
            query: {
              userId: 'user-123',
              filters: {
                status: 'active',
                dateRange: {
                  start: '2023-01-01',
                  end: '2023-12-31',
                },
              },
            },
          }),
        })
      );
    });

    it('should handle invalid JMESPath expressions gracefully', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/{{invalid[.path}}',
          method: 'GET',
        },
        credentialReferenceId: 'apiData',
      };

      const context = { data: 'test' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ result: 'ok' }),
      });

      await fetcher.fetch(definition, context);

      // Should use the original template string if JMESPath fails
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/{{invalid[.path}}',
        expect.any(Object)
      );
    });
  });

  describe('GraphQL error handling', () => {
    it('should detect and throw on GraphQL errors in response', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-graphql-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/graphql',
          method: 'POST',
          body: { query: '{ user { id name } }' },
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };

      // Mock a GraphQL response with errors
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          data: null,
          errors: [
            {
              message: 'Cannot query field "name" on type "User".',
              locations: [{ line: 1, column: 15 }],
              extensions: {
                code: 'GRAPHQL_VALIDATION_FAILED',
              },
            },
            {
              message: 'User not found',
              path: ['user'],
              extensions: {
                code: 'NOT_FOUND',
              },
            },
          ],
        }),
      });

      await expect(fetcher.fetch(definition, {})).rejects.toThrow(
        'GraphQL request failed with 2 errors: Cannot query field "name" on type "User"., User not found'
      );
    });

    it('should not throw on successful GraphQL response without errors', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-graphql-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/graphql',
          method: 'POST',
          body: { query: '{ user { id name } }' },
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };

      // Mock a successful GraphQL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          data: {
            user: {
              id: '123',
              name: 'John Doe',
            },
          },
        }),
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual({
        data: {
          user: {
            id: '123',
            name: 'John Doe',
          },
        },
      });
    });

    it('should handle GraphQL response with empty errors array', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-graphql-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/graphql',
          method: 'POST',
          body: { query: '{ user { id } }' },
        },
      };

      // Mock a GraphQL response with empty errors array (should not throw)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          data: { user: { id: '123' } },
          errors: [], // Empty errors array
        }),
      });

      const result = await fetcher.fetch(definition, {});

      expect(result).toEqual({
        data: { user: { id: '123' } },
        errors: [],
      });
    });

    it('should handle GraphQL errors without message field', async () => {
      const definition: ContextFetchDefinition = {
        id: 'test-graphql-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/graphql',
          method: 'POST',
          body: { query: '{ user { id } }' },
        },
      };

      // Mock a GraphQL response with errors lacking message field
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          errors: [
            { code: 'INTERNAL_ERROR' }, // No message field
            { message: 'Valid error' },
          ],
        }),
      });

      await expect(fetcher.fetch(definition, {})).rejects.toThrow(
        'GraphQL request failed with 2 errors: Unknown error, Valid error'
      );
    });
  });
});
