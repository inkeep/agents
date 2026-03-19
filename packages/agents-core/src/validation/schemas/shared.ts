import { z } from '@hono/zod-openapi';

const MIN_ID_LENGTH = 1;
const MAX_ID_LENGTH = 255;
const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

const ResourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  })
  .refine((value) => value !== 'new', 'Must not use a reserved name "new"')
  .openapi('ResourceId', {
    description: 'Resource identifier',
    example: 'resource_789',
  });

const StringRecordSchema = z
  .record(z.string(), z.string('All object values must be strings'), 'Must be valid JSON object')
  .openapi('StringRecord');

const pageNumber = z.coerce.number().min(1).default(1).openapi('PaginationPageQueryParam');

const limitNumber = z.coerce
  .number()
  .min(1)
  .max(100)
  .default(10)
  .openapi('PaginationLimitQueryParam');

const PaginationSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
    total: z.number(),
    pages: z.number(),
  })
  .openapi('Pagination');

const PaginationQueryParamsSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
  })
  .openapi('PaginationQueryParams');

// Helper functions for creating API schemas by omitting internal scope fields.
// Zod's .omit() type signature requires exact key matching which doesn't work with generics.
// We use type assertions with explicit return types to maintain type safety at call sites.
type OmitProjectScope<T> = Omit<T, 'tenantId' | 'projectId'>;
type OmitAgentScope<T> = Omit<T, 'tenantId' | 'projectId' | 'agentId'>;
type OmitTenantScope<T> = Omit<T, 'tenantId'>;
type OmitTimestamps<T> = Omit<T, 'createdAt' | 'updatedAt'>;
type OmitGeneratedFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

// Generic helper for tenant-scoped entities (omits only tenantId, not projectId)
const omitTenantScope = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitTenantScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true }) as z.ZodObject<
    OmitTenantScope<T>
  >;

// Generic helper for omitting timestamp fields
const omitTimestamps = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitTimestamps<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    createdAt: true,
    updatedAt: true,
  }) as z.ZodObject<OmitTimestamps<T>>;

// Generic helper for omitting auto-generated fields (common for API insert schemas)
const omitGeneratedFields = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitGeneratedFields<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  }) as z.ZodObject<OmitGeneratedFields<T>>;

const createApiSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitProjectScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
    OmitProjectScope<T>
  >;

const createApiInsertSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitProjectScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
    OmitProjectScope<T>
  >;

const createApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  (
    (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
      OmitProjectScope<T>
    >
  ).partial();

const createAgentScopedApiSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitAgentScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    tenantId: true,
    projectId: true,
    agentId: true,
  }) as z.ZodObject<OmitAgentScope<T>>;

const createAgentScopedApiInsertSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitAgentScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    tenantId: true,
    projectId: true,
    agentId: true,
  }) as z.ZodObject<OmitAgentScope<T>>;

const createAgentScopedApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  (
    (schema as z.ZodObject<z.ZodRawShape>).omit({
      tenantId: true,
      projectId: true,
      agentId: true,
    }) as z.ZodObject<OmitAgentScope<T>>
  ).partial();

export {
  createApiSchema,
  createApiUpdateSchema,
  createApiInsertSchema,
  createAgentScopedApiUpdateSchema,
  createAgentScopedApiSchema,
  omitGeneratedFields,
  omitTimestamps,
  omitTenantScope,
  PaginationQueryParamsSchema,
  PaginationSchema,
  StringRecordSchema,
  ResourceIdSchema,
  createAgentScopedApiInsertSchema,
  URL_SAFE_ID_PATTERN,
  MIN_ID_LENGTH,
  MAX_ID_LENGTH,
};
