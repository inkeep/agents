import { z } from '@hono/zod-openapi';

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const ResourceIdSchema = z
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

export const StringRecordSchema = z
  .record(z.string(), z.string('All object values must be strings'), 'Must be valid JSON object')
  .openapi('StringRecord');

const pageNumber = z.coerce.number().min(1).default(1).openapi('PaginationPageQueryParam');
const limitNumber = z.coerce
  .number()
  .min(1)
  .max(100)
  .default(10)
  .openapi('PaginationLimitQueryParam');

export const PaginationSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
    total: z.number(),
    pages: z.number(),
  })
  .openapi('Pagination');

export const PaginationQueryParamsSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
  })
  .openapi('PaginationQueryParams');
