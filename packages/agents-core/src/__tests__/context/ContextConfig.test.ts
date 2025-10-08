import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ContextConfigBuilder,
  contextConfig,
  fetchDefinition,
  RequestContextSchemaBuilder,
  requestContextSchema,
} from '../../context/ContextConfig';
import { convertZodToJsonSchema } from '../../utils/schema-conversion';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ContextConfig', () => {
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const graphId = 'test-graph';
  const baseURL = 'http://localhost:3002';

  beforeEach(() => {
    mockFetch.mockClear();
    // Set default environment
    process.env.INKEEP_AGENTS_MANAGE_API_URL = baseURL;
  });

  describe('ContextConfigBuilder - Basic Construction', () => {
    it('should create a basic context config with minimal options', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      expect(config.getId()).toBe('test-config');
      expect(config.getName()).toBe('Test Config');
      expect(config.getDescription()).toBe('');
      expect(config.getRequestContextSchema()).toBeNull();
      expect(config.getContextVariables()).toEqual({});
    });

    it('should use default values for tenantId, projectId, graphId if not provided', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
      });

      const obj = config.toObject();
      expect(obj.tenantId).toBe('default');
      expect(obj.projectId).toBe('default');
      expect(obj.graphId).toBe('default');
    });

    it('should throw error when getting ID if not set', () => {
      const config = new ContextConfigBuilder({
        id: '',
        name: 'Test',
      } as any);

      // Override the id to empty
      (config as any).config.id = undefined;

      expect(() => config.getId()).toThrow('Context config ID is not set');
    });

    it('should throw error when getting name if not set', () => {
      const config = new ContextConfigBuilder({
        id: 'test',
        name: '',
      } as any);

      // Override the name to empty
      (config as any).config.name = undefined;

      expect(() => config.getName()).toThrow('Context config name is not set');
    });
  });

  describe('ContextConfigBuilder - Request Context Schema', () => {
    it('should accept a Zod schema for request context', () => {
      const schema = z.object({
        userId: z.string(),
        sessionId: z.string(),
      });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        requestContextSchema: schema,
        tenantId,
        projectId,
        graphId,
      });

      const requestSchema = config.getRequestContextSchema();
      expect(requestSchema).toBeDefined();
      expect(requestSchema).toHaveProperty('type');
    });

    it('should accept a RequestContextSchemaBuilder for request context', () => {
      const schema = z.object({
        userId: z.string(),
        email: z.string().email(),
      });

      const schemaBuilder = new RequestContextSchemaBuilder({ schema });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        requestContextSchema: schemaBuilder,
        tenantId,
        projectId,
        graphId,
      });

      const requestSchema = config.getRequestContextSchema();
      expect(requestSchema).toBeDefined();
    });

    it('should convert Zod schema to JSON schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const jsonSchema = convertZodToJsonSchema(schema);

      expect(jsonSchema).toHaveProperty('type', 'object');
      expect(jsonSchema).toHaveProperty('properties');
    });
  });

  describe('ContextConfigBuilder - Context Variables', () => {
    it('should accept context variables with fetch definitions', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        contextVariables: {
          user: {
            id: 'fetch-user',
            trigger: 'initialization' as const,
            fetchConfig: {
              url: 'https://api.example.com/user',
              method: 'GET',
            },
            responseSchema: userSchema,
          },
        },
        tenantId,
        projectId,
        graphId,
      });

      const variables = config.getContextVariables();
      expect(variables).toHaveProperty('user');
      expect(variables.user).toHaveProperty('id', 'fetch-user');
      expect(variables.user).toHaveProperty('trigger', 'initialization');
    });

    it('should convert context variable response schemas to JSON schemas', () => {
      const dataSchema = z.object({
        value: z.number(),
      });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        contextVariables: {
          data: {
            id: 'fetch-data',
            trigger: 'invocation' as const,
            fetchConfig: {
              url: 'https://api.example.com/data',
              method: 'GET',
            },
            responseSchema: dataSchema,
          },
        },
        tenantId,
        projectId,
        graphId,
      });

      const variables = config.getContextVariables();
      expect(variables.data.responseSchema).toHaveProperty('type');
      expect(variables.data.responseSchema).toHaveProperty('properties');
    });

    it('should handle credential references in context variables', () => {
      const schema = z.object({ token: z.string() });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        contextVariables: {
          auth: {
            id: 'fetch-auth',
            trigger: 'initialization' as const,
            fetchConfig: {
              url: 'https://api.example.com/auth',
              method: 'GET',
            },
            responseSchema: schema,
            credentialReference: { id: 'cred-123' } as any,
          },
        },
        tenantId,
        projectId,
        graphId,
      });

      const variables = config.getContextVariables();
      expect(variables.auth).toHaveProperty('credentialReferenceId', 'cred-123');
    });
  });

  describe('ContextConfigBuilder - setContext', () => {
    it('should update context (tenantId, projectId, graphId)', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId: 'old-tenant',
        projectId: 'old-project',
        graphId: 'old-graph',
      });

      config.setContext('new-tenant', 'new-project', 'new-graph', 'https://new-url.com');

      const obj = config.toObject();
      expect(obj.tenantId).toBe('new-tenant');
      expect(obj.projectId).toBe('new-project');
      expect(obj.graphId).toBe('new-graph');
    });
  });

  describe('ContextConfigBuilder - toObject', () => {
    it('should convert builder to plain object', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        description: 'Test description',
        tenantId,
        projectId,
        graphId,
      });

      const obj = config.toObject();

      expect(obj).toHaveProperty('id', 'test-config');
      expect(obj).toHaveProperty('name', 'Test Config');
      expect(obj).toHaveProperty('description', 'Test description');
      expect(obj).toHaveProperty('tenantId', tenantId);
      expect(obj).toHaveProperty('projectId', projectId);
      expect(obj).toHaveProperty('graphId', graphId);
      expect(obj).toHaveProperty('createdAt');
      expect(obj).toHaveProperty('updatedAt');
    });
  });

  describe('ContextConfigBuilder - toTemplate', () => {
    it('should generate template strings for valid paths', () => {
      const requestSchema = z.object({
        userId: z.string(),
      });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        requestContextSchema: requestSchema,
        tenantId,
        projectId,
        graphId,
      });

      // This tests the toTemplate method
      const template = config.toTemplate('requestContext.userId' as any);
      expect(template).toBe('{{requestContext.userId}}');
    });
  });

  describe('ContextConfigBuilder - Validation', () => {
    it('should pass validation for valid config', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        description: 'Valid config',
        tenantId,
        projectId,
        graphId,
      });

      const result = config.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation if requestContext key is used in contextVariables', () => {
      const schema = z.object({ data: z.string() });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        contextVariables: {
          requestContext: {
            id: 'bad-fetch',
            trigger: 'initialization' as const,
            fetchConfig: {
              url: 'https://api.example.com',
              method: 'GET',
            },
            responseSchema: schema,
          },
        } as any,
        tenantId,
        projectId,
        graphId,
      });

      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "The key 'requestContext' is reserved for the request context and cannot be used in contextVariables"
      );
    });
  });

  it('should throw error if validation fails', async () => {
    const config = new ContextConfigBuilder({
      id: 'test-config',
      name: 'Test Config',
      contextVariables: {
        requestContext: {
          id: 'bad',
          trigger: 'initialization' as const,
          fetchConfig: { url: 'test', method: 'GET' },
          responseSchema: z.object({}),
        },
      } as any,
      tenantId,
      projectId,
      graphId,
    });

    await expect(config.init()).rejects.toThrow('Context config validation failed');
  });

  describe('RequestContextSchemaBuilder', () => {
    it('should create schema builder with Zod schema', () => {
      const schema = z.object({
        userId: z.string(),
        email: z.string().email(),
      });

      const builder = new RequestContextSchemaBuilder({ schema });

      expect(builder.getSchema()).toBe(schema);
    });

    it('should generate templates with requestContext prefix', () => {
      const schema = z.object({
        userId: z.string(),
        preferences: z.object({
          theme: z.string(),
        }),
      });

      const builder = new RequestContextSchemaBuilder({ schema });

      const template = builder.toTemplate('userId' as any);
      expect(template).toBe('{{requestContext.userId}}');
    });

    it('should convert schema to JSON schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const builder = new RequestContextSchemaBuilder({ schema });
      const jsonSchema = builder.getJsonSchema();

      expect(jsonSchema).toHaveProperty('type', 'object');
      expect(jsonSchema).toHaveProperty('properties');
    });
  });

  describe('Factory Functions', () => {
    it('should create ContextConfigBuilder via contextConfig factory', () => {
      const config = contextConfig({
        id: 'factory-config',
        name: 'Factory Config',
        tenantId,
        projectId,
        graphId,
      });

      expect(config).toBeInstanceOf(ContextConfigBuilder);
      expect(config.getId()).toBe('factory-config');
    });

    it('should create RequestContextSchemaBuilder via requestContextSchema factory', () => {
      const schema = z.object({ id: z.string() });
      const builder = requestContextSchema({ schema });

      expect(builder).toBeInstanceOf(RequestContextSchemaBuilder);
      expect(builder.getSchema()).toBe(schema);
    });

    it('should create fetch definition via fetchDefinition helper', () => {
      const schema = z.object({ result: z.string() });

      const def = fetchDefinition({
        id: 'test-fetch',
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { Authorization: 'Bearer token' },
          body: { query: 'test' },
          timeout: 5000,
        },
        responseSchema: schema,
        defaultValue: { result: 'default' },
        credentialReference: { id: 'cred-456' } as any,
      });

      expect(def.id).toBe('test-fetch');
      expect(def.trigger).toBe('initialization');
      expect(def.fetchConfig.url).toBe('https://api.example.com/data');
      expect(def.fetchConfig.method).toBe('POST');
      expect(def.credentialReferenceId).toBe('cred-456');
      expect(def.defaultValue).toEqual({ result: 'default' });
    });

    it('should handle fetchDefinition without credential reference', () => {
      const schema = z.object({ data: z.number() });

      const def = fetchDefinition({
        id: 'simple-fetch',
        trigger: 'invocation',
        fetchConfig: {
          url: 'https://api.example.com/simple',
          method: 'GET',
        },
        responseSchema: schema,
      });

      expect(def.credentialReferenceId).toBeUndefined();
    });
  });

  describe('Error Response Parsing', () => {
    it('should parse JSON error responses', async () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({ message: 'Validation error', details: { field: 'name' } }),
      });

      await expect(config.init()).rejects.toThrow('Validation error');
    });

    it('should parse text error responses', async () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: (key: string) => (key === 'content-type' ? 'text/plain' : null),
        },
        text: async () => 'Server error occurred',
      });

      await expect(config.init()).rejects.toThrow('Server error occurred');
    });

    it('should handle empty error responses', async () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
          get: () => null,
        },
        text: async () => '',
      });

      await expect(config.init()).rejects.toThrow('HTTP 503 Service Unavailable');
    });
  });

  describe('Builder Methods', () => {
    it('should support fluent API with withRequestContextSchema', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      const newSchema = { type: 'object', properties: { id: { type: 'string' } } };
      const result = config.withRequestContextSchema(newSchema);

      expect(result).toBe(config); // Should return this for chaining
      expect(config.getRequestContextSchema()).toEqual(newSchema);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context variables', () => {
      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        contextVariables: {},
        tenantId,
        projectId,
        graphId,
      });

      expect(config.getContextVariables()).toEqual({});
    });

    it('should use environment variable for baseURL', () => {
      process.env.INKEEP_AGENTS_MANAGE_API_URL = 'https://custom-url.com';

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        tenantId,
        projectId,
        graphId,
      });

      // Verify by triggering a fetch call
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      config.init();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom-url.com'),
        expect.any(Object)
      );
    });

    it('should handle complex nested schemas', () => {
      const complexSchema = z.object({
        user: z.object({
          profile: z.object({
            settings: z.object({
              theme: z.string(),
              notifications: z.boolean(),
            }),
          }),
        }),
      });

      const config = new ContextConfigBuilder({
        id: 'test-config',
        name: 'Test Config',
        requestContextSchema: complexSchema,
        tenantId,
        projectId,
        graphId,
      });

      const jsonSchema = config.getRequestContextSchema();
      expect(jsonSchema).toBeDefined();
      expect(jsonSchema).toHaveProperty('type', 'object');
    });
  });
});
