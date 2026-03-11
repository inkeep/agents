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

export const ResolvedRefSchema = z
  .object({
    type: z.enum(['commit', 'tag', 'branch']).describe('The type of ref'),
    name: z.string().describe('The name of the ref (branch name, tag name, or commit hash)'),
    hash: z.string().describe('The commit hash this ref resolves to'),
  })
  .openapi('ResolvedRef');

export const ConflictResolutionSchema = z.object({
  table: z.string(),
  primaryKey: z.record(z.string(), z.string()),
  rowDefaultPick: z.enum(['ours', 'theirs']),
  columns: z.record(z.string(), z.enum(['ours', 'theirs'])).optional(),
});

export const DiffSummaryItemSchema = z
  .object({
    table: z.string(),
    diffType: z.string(),
    dataChange: z.boolean(),
    schemaChange: z.boolean(),
  })
  .openapi('DiffSummaryItem');

export const ConflictItemSchema = z
  .object({
    table: z.string(),
    primaryKey: z.record(z.string(), z.string()),
    ourDiffType: z.string(),
    theirDiffType: z.string(),
    base: z.record(z.string(), z.unknown()).nullable(),
    ours: z.record(z.string(), z.unknown()).nullable(),
    theirs: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('ConflictItem');

export const MergePreviewRequestSchema = z
  .object({
    sourceBranch: z.string(),
    targetBranch: z.string(),
    baseCommit: z.string().optional(),
    localProjectDefinition: z.unknown().optional(),
  })
  .openapi('MergePreviewRequest');

export const MergePreviewResponseSchema = z
  .object({
    data: z.object({
      hasConflicts: z.boolean(),
      sourceHash: z.string(),
      targetHash: z.string(),
      canFastForward: z.boolean(),
      diffSummary: z.array(DiffSummaryItemSchema),
      conflicts: z.array(ConflictItemSchema),
    }),
  })
  .openapi('MergePreviewResponse');

export const MergeExecuteRequestSchema = z
  .object({
    sourceBranch: z.string(),
    targetBranch: z.string(),
    sourceHash: z.string(),
    targetHash: z.string(),
    message: z.string().optional(),
    author: z
      .object({
        name: z.string(),
        email: z.string(),
      })
      .optional(),
    resolutions: z.array(ConflictResolutionSchema).optional(),
    baseCommit: z.string().optional(),
    localProjectDefinition: z.unknown().optional(),
  })
  .openapi('MergeExecuteRequest');

export const MergeExecuteResponseSchema = z
  .object({
    data: z.object({
      status: z.literal('success'),
      mergeCommitHash: z.string(),
      sourceBranch: z.string(),
      targetBranch: z.string(),
    }),
  })
  .openapi('MergeExecuteResponse');

// Export types
export type ResolvedRef = z.infer<typeof ResolvedRefSchema>;
export type CreateBranchRequest = z.infer<typeof CreateBranchRequestSchema>;
export type BranchInfo = z.infer<typeof BranchInfoSchema>;
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
export type BranchListResponse = z.infer<typeof BranchListResponseSchema>;
export type BranchNameParams = z.infer<typeof BranchNameParamsSchema>;
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
export type DiffSummaryItem = z.infer<typeof DiffSummaryItemSchema>;
export type ConflictItem = z.infer<typeof ConflictItemSchema>;
export type MergePreviewRequest = z.infer<typeof MergePreviewRequestSchema>;
export type MergePreviewResponse = z.infer<typeof MergePreviewResponseSchema>;
export type MergeExecuteRequest = z.infer<typeof MergeExecuteRequestSchema>;
export type MergeExecuteResponse = z.infer<typeof MergeExecuteResponseSchema>;
