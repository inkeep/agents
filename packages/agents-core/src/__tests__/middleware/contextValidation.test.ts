import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { convertZodToJsonSchema } from '../../context/ContextConfig';
import { validationHelper } from '../../middleware/contextValidation';

describe('Context Validation with Zod to JSON Schema conversion and AJV', () => {
  describe('Basic Zod to JSON Schema conversion', () => {
    it('should convert simple string schema and validate successfully', () => {
      // Define Zod schema
      const zodSchema = z.string();

      // Convert to JSON Schema using z.toJSONSchema (as in ContextConfig.ts)
      const jsonSchema = convertZodToJsonSchema(zodSchema);
      console.log(jsonSchema);
      // Compile with AJV
      const validate = validationHelper(jsonSchema);

      // Test valid data
      expect(validate('hello world')).toBe(true);
      expect(validate.errors).toBeNull();

      // Test invalid data
      expect(validate(123)).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors?.[0].message).toContain('string');
    });

    it('should convert simple string schema and validate successfully', () => {
      // Define Zod schema
      const zodSchema = z.string();
      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);
      expect(validate('hello world')).toBe(true);
    });

    it('should convert object schema and validate complex objects', () => {
      // Define complex Zod schema similar to inkeep-qa-example
      const zodSchema = z
        .object({
          org_alias: z.string().describe('Organization alias for fetching org settings'),
          project_id: z.string().describe('Project ID for fetching project settings'),
          auth_token: z.string().describe('Authentication token for fetching project settings'),
        })
        .strict();

      // Convert to JSON Schema
      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);
      // Test valid data
      const validData = {
        org_alias: 'inkeep',
        project_id: 'cm8q9j9l0005gs601sm5eg58l',
        auth_token: 'sk-test-token',
      };

      expect(validate(validData)).toBe(true);
      expect(validate.errors).toBeNull();

      // Test invalid data - missing required field
      const invalidData = {
        org_alias: 'inkeep',
        project_id: 'cm8q9j9l0005gs601sm5eg58l',
        // Missing auth_token
      };

      expect(validate(invalidData)).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(
        validate.errors?.some(
          (error) =>
            error.message?.includes('auth_token') ||
            error.instancePath?.includes('auth_token') ||
            error.message?.includes('required')
        )
      ).toBe(true);
    });

    it('should handle nested object schemas', () => {
      const zodSchema = z.object({
        user: z.object({
          id: z.string(),
          profile: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
        }),
        organization: z.object({
          id: z.string(),
          settings: z.object({
            theme: z.enum(['light', 'dark']),
            notifications: z.boolean(),
          }),
        }),
      });

      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      // Valid nested data
      const validData = {
        user: {
          id: 'user123',
          profile: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
        organization: {
          id: 'org456',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
      };

      expect(validate(validData)).toBe(true);

      // Invalid nested data - invalid email
      const invalidData = {
        ...validData,
        user: {
          ...validData.user,
          profile: {
            ...validData.user.profile,
            email: 'invalid-email',
          },
        },
      };

      expect(validate(invalidData)).toBe(false);
      expect(validate.errors).toBeDefined();
    });
  });

  describe('Advanced schema features', () => {
    it('should handle optional fields correctly', () => {
      const zodSchema = z.object({
        required_field: z.string(),
        optional_field: z.string().optional(),
        default_field: z.string().default('default_value').optional(), // default values have to be explicitly optional
      });

      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      // Valid with only required field
      expect(
        validate({
          required_field: 'test',
        })
      ).toBe(true);

      // Valid with all fields
      expect(
        validate({
          required_field: 'test',
          optional_field: 'optional',
          default_field: 'custom',
        })
      ).toBe(true);

      // Invalid without required field
      expect(validate({ optional_field: 'optional' })).toBe(false);
    });

    it('should handle array schemas', () => {
      const zodSchema = z.object({
        tags: z.array(z.string()),
        permissions: z.array(z.enum(['read', 'write', 'admin'])),
      });

      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      // Valid array data
      const validData = {
        tags: ['tag1', 'tag2'],
        permissions: ['read', 'write'],
      };

      expect(validate(validData)).toBe(true);

      // Invalid array data - wrong enum value
      const invalidData = {
        tags: ['tag1', 'tag2'],
        permissions: ['read', 'invalid_permission'],
      };

      expect(validate(invalidData)).toBe(false);
    });

    it('should handle union types', () => {
      const zodSchema = z.object({
        value: z.union([z.string(), z.number()]),
        status: z.enum(['active', 'inactive', 'pending']),
      });

      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      // Valid with string
      expect(validate({ value: 'test', status: 'active' })).toBe(true);

      // Valid with number
      expect(validate({ value: 42, status: 'pending' })).toBe(true);

      // Invalid with boolean
      expect(validate({ value: true, status: 'active' })).toBe(false);

      // Invalid with wrong enum
      expect(validate({ value: 'test', status: 'unknown' })).toBe(false);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty schemas gracefully', () => {
      const zodSchema = z.object({});
      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      expect(validate({})).toBe(true);
    });

    it('should handle null and undefined values', () => {
      const zodSchema = z.object({
        required: z.string(),
        nullable: z.string().nullable(),
        optional: z.string().optional(),
      });

      const jsonSchema = convertZodToJsonSchema(zodSchema);
      const validate = validationHelper(jsonSchema);

      // Valid with null for nullable field
      expect(
        validate({
          required: 'test',
          nullable: null,
        })
      ).toBe(true);

      // Valid without optional field
      expect(
        validate({
          required: 'test',
          nullable: 'value',
        })
      ).toBe(true);
    });
  });
});
