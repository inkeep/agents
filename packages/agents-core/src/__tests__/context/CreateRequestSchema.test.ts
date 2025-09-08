import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ContextConfigBuilder, createRequestSchema } from '../../context/ContextConfig';

describe('createRequestSchema', () => {
  it('should create a request schema with all HTTP parts', () => {
    const requestSchema = createRequestSchema({
      body: z
        .object({
          org_alias: z.string(),
          project_id: z.string(),
          auth_token: z.string(),
        })
        .strip(),
      headers: z
        .object({
          authorization: z.string().startsWith('Bearer '),
          'x-user-id': z.string().uuid().optional(),
        })
        .passthrough(),
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
        })
        .strip(),
      params: z
        .object({
          id: z.coerce.number(),
        })
        .strip(),
    });

    const zodSchemas = requestSchema.getZodSchemas();
    expect(zodSchemas.body).toBeDefined();
    expect(zodSchemas.headers).toBeDefined();
    expect(zodSchemas.query).toBeDefined();
    expect(zodSchemas.params).toBeDefined();
  });

  it('should convert to JSON schema correctly', () => {
    const requestSchema = createRequestSchema({
      body: z.object({
        name: z.string(),
        age: z.number(),
      }),
      query: z.object({
        limit: z.number().optional(),
      }),
    });

    const jsonSchema = requestSchema.toJsonSchema();

    expect(jsonSchema.schemas).toBeDefined();
    expect(jsonSchema.schemas.body).toBeDefined();
    expect(jsonSchema.schemas.query).toBeDefined();
    expect(jsonSchema.schemas.body.type).toBe('object');
    expect(jsonSchema.schemas.body.properties).toBeDefined();
  });

  it('should work with ContextConfigBuilder', () => {
    const requestSchema = createRequestSchema({
      body: z.object({
        org_alias: z.string(),
        project_id: z.string(),
      }),
      headers: z.object({
        authorization: z.string(),
      }),
    });

    const config = new ContextConfigBuilder({
      id: 'test-request-schema',
      name: 'Test Request Schema',
      requestContextSchema: requestSchema,
      tenantId: 'test-tenant',
    });

    const validation = config.validate();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const requestContextSchema = config.getRequestContextSchema();
    expect(requestContextSchema).toBeDefined();
    expect(requestContextSchema.schemas).toBeDefined();
    expect(requestContextSchema.schemas.body).toBeDefined();
    expect(requestContextSchema.schemas.headers).toBeDefined();
  });

  it('should maintain backward compatibility with simple Zod schemas', () => {
    const simpleSchema = z.object({
      userId: z.string(),
      permissions: z.array(z.string()),
    });

    const config = new ContextConfigBuilder({
      id: 'test-simple-schema',
      name: 'Test Simple Schema',
      requestContextSchema: simpleSchema,
      tenantId: 'test-tenant',
    });

    const validation = config.validate();
    expect(validation.valid).toBe(true);

    const requestContextSchema = config.getRequestContextSchema();
    expect(requestContextSchema).toBeDefined();
    // Should be a converted JSON schema, not the new format
    expect(requestContextSchema.type).toBe('object');
  });

  it('should handle partial schemas (only some HTTP parts defined)', () => {
    const requestSchema = createRequestSchema({
      body: z.object({
        data: z.string(),
      }),
      // Only body defined, others optional
    });

    const jsonSchema = requestSchema.toJsonSchema();
    expect(jsonSchema.schemas.body).toBeDefined();
    expect(jsonSchema.schemas.headers).toBeUndefined();
    expect(jsonSchema.schemas.query).toBeUndefined();
    expect(jsonSchema.schemas.params).toBeUndefined();
  });
});
