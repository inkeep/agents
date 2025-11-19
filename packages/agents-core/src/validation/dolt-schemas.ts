import { z } from '@hono/zod-openapi';

// Branch name schema - validates branch names
export const BranchNameSchema = z
  .string()
  .min(1, 'Branch name cannot be empty')
  .max(255, 'Branch name too long')
  .regex(/^[a-zA-Z0-9\-_./]+$/, {
    message:
      'Branch name can only contain letters, numbers, hyphens, underscores, dots, and slashes',
  })
  .openapi({
    example: 'feature-x',
    description: 'Name of the branch',
  });

// Request body for creating a branch
export const CreateBranchRequestSchema = z
  .object({
    name: BranchNameSchema,
    from: z
      .string()
      .optional()
      .describe('Branch or commit to create from. Defaults to tenant main branch.'),
  })
  .openapi('CreateBranchRequest');

// Response for branch operations
export const BranchInfoSchema = z
  .object({
    baseName: z.string().describe('User-provided branch name'),
    fullName: z.string().describe('Full namespaced branch name'),
    hash: z.string().describe('Current commit hash of the branch'),
  })
  .openapi('BranchInfo');

// Response for single branch
export const BranchResponseSchema = z
  .object({
    data: BranchInfoSchema,
  })
  .openapi('BranchResponse');

// Response for list of branches
export const BranchListResponseSchema = z
  .object({
    data: z.array(BranchInfoSchema),
  })
  .openapi('BranchListResponse');

// Path parameters for branch operations
export const BranchNameParamsSchema = z
  .object({
    tenantId: z.string().openapi({ param: { name: 'tenantId', in: 'path' } }),
    projectId: z.string().openapi({ param: { name: 'projectId', in: 'path' } }),
    branchName: z.string().openapi({ param: { name: 'branchName', in: 'path' } }),
  })
  .openapi('BranchNameParams');

// Export types
export type CreateBranchRequest = z.infer<typeof CreateBranchRequestSchema>;
export type BranchInfo = z.infer<typeof BranchInfoSchema>;
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
export type BranchListResponse = z.infer<typeof BranchListResponseSchema>;
export type BranchNameParams = z.infer<typeof BranchNameParamsSchema>;
