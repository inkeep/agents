import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRequestSchema } from '../../context/ContextConfig.js';
import {
  type ParsedHttpRequest,
  validateHttpRequestParts,
} from '../../middleware/contextValidation.js';

describe('Schema Key Filtering', () => {
  it('should filter out extra keys from passthrough schemas when storing in cache', async () => {
    const requestSchema = createRequestSchema({
      body: z
        .object({
          name: z.string(),
          age: z.number(),
        })
        .strict(), // strict schema
      headers: z
        .object({
          authorization: z.string(),
          'x-user-id': z.string().optional(),
        })
        .passthrough(), // passthrough allows extra keys
      query: z
        .object({
          page: z.number(),
        })
        .strip(),
    });

    const httpRequest: ParsedHttpRequest = {
      body: {
        name: 'John',
        age: 30,
        // extra_field: 'should be rejected by strict'  // This would cause validation error
      },
      headers: {
        authorization: 'Bearer token',
        'x-user-id': '123',
        'extra-header': 'should be filtered out', // Extra key from passthrough
        'another-header': 'also filtered',
      },
      query: {
        page: 1,
      },
    };

    const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toBeDefined();

    // Body should have all defined keys (strict)
    expect(result.validatedContext?.body).toEqual({
      name: 'John',
      age: 30,
    });

    // Headers should only have schema-defined keys, not the extra ones
    expect(result.validatedContext?.headers).toEqual({
      authorization: 'Bearer token',
      'x-user-id': '123',
    });
    expect(result.validatedContext?.headers['extra-header']).toBeUndefined();
    expect(result.validatedContext?.headers['another-header']).toBeUndefined();

    // Query should have defined keys
    expect(result.validatedContext?.query).toEqual({
      page: 1,
    });
  });

  it('should handle schemas with no defined properties', async () => {
    const requestSchema = createRequestSchema({
      body: z.any(), // No specific properties
    });

    const httpRequest: ParsedHttpRequest = {
      body: {
        anything: 'goes',
        random: 42,
      },
    };

    const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext?.body).toEqual({
      anything: 'goes',
      random: 42,
    });
  });

  it('should filter nested objects correctly', async () => {
    const requestSchema = createRequestSchema({
      body: z
        .object({
          user: z
            .object({
              id: z.string(),
              name: z.string(),
            })
            .passthrough(), // Allows extra keys in nested object
          metadata: z.object({
            version: z.string(),
          }),
        })
        .strip(), // Strip extra keys at top level
    });

    const httpRequest: ParsedHttpRequest = {
      body: {
        user: {
          id: '123',
          name: 'John',
          email: 'john@example.com', // Extra key in nested object - allowed by passthrough
        },
        metadata: {
          version: '1.0',
        },
        // Don't include extra_top_level as it would be rejected by .strip()
      },
    };

    const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

    expect(result.valid).toBe(true);

    // Should only include schema-defined keys at ALL levels (recursive filtering)
    expect(result.validatedContext?.body).toEqual({
      user: {
        id: '123',
        name: 'John',
        // email should be filtered out even though passthrough allowed it during validation
      },
      metadata: {
        version: '1.0',
      },
    });
  });

  it('should work with optional schema parts', async () => {
    const requestSchema = createRequestSchema(
      {
        body: z.object({
          required_field: z.string(),
        }),
        query: z
          .object({
            optional_field: z.string(),
          })
          .passthrough(),
      },
      {
        optional: ['query'], // query is optional
      }
    );

    const httpRequest: ParsedHttpRequest = {
      body: {
        required_field: 'test',
      },
      // query is missing (but optional)
    };

    const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

    expect(result.valid).toBe(true);
    expect(result.validatedContext?.body).toEqual({
      required_field: 'test',
    });
    expect(result.validatedContext?.query).toBeUndefined();
  });

  it('should handle deep nested filtering with arrays', async () => {
    const requestSchema = createRequestSchema({
      body: z
        .object({
          users: z.array(
            z
              .object({
                id: z.string(),
                profile: z
                  .object({
                    name: z.string(),
                    email: z.string(),
                  })
                  .passthrough(), // Allows extra keys in nested profile
              })
              .passthrough()
          ), // Allows extra keys in user objects
          metadata: z.object({
            count: z.number(),
          }),
        })
        .strip(),
    });

    const httpRequest: ParsedHttpRequest = {
      body: {
        users: [
          {
            id: '1',
            profile: {
              name: 'John',
              email: 'john@example.com',
              avatar: 'avatar1.jpg', // Should be filtered
              preferences: { theme: 'dark' }, // Should be filtered
            },
            role: 'admin', // Should be filtered
            lastLogin: '2023-01-01', // Should be filtered
          },
          {
            id: '2',
            profile: {
              name: 'Jane',
              email: 'jane@example.com',
              bio: 'Software engineer', // Should be filtered
            },
            department: 'Engineering', // Should be filtered
          },
        ],
        metadata: {
          count: 2,
        },
      },
    };

    const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

    expect(result.valid).toBe(true);

    // Should recursively filter ALL levels
    expect(result.validatedContext?.body).toEqual({
      users: [
        {
          id: '1',
          profile: {
            name: 'John',
            email: 'john@example.com',
            // avatar and preferences filtered out
          },
          // role and lastLogin filtered out
        },
        {
          id: '2',
          profile: {
            name: 'Jane',
            email: 'jane@example.com',
            // bio filtered out
          },
          // department filtered out
        },
      ],
      metadata: {
        count: 2,
      },
    });
  });
});
