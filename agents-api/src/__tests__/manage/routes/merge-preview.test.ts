import { describe, expect, it } from 'vitest';
import {
  ConflictResolutionSchema,
  MergeExecuteRequestSchema,
  MergeExecuteResponseSchema,
  MergePreviewRequestSchema,
  MergePreviewResponseSchema,
} from '../../../domains/manage/routes/merge';

describe('MergePreviewRequestSchema', () => {
  it('validates a minimal merge preview request', () => {
    const result = MergePreviewRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('validates a request with baseCommit and localProjectDefinition', () => {
    const result = MergePreviewRequestSchema.safeParse({
      sourceBranch: 'main',
      targetBranch: 'main',
      baseCommit: 'abc123def456',
      localProjectDefinition: { id: 'project-1', agents: {} },
    });
    expect(result.success).toBe(true);
  });

  it('rejects request missing sourceBranch', () => {
    const result = MergePreviewRequestSchema.safeParse({
      targetBranch: 'main',
    });
    expect(result.success).toBe(false);
  });

  it('rejects request missing targetBranch', () => {
    const result = MergePreviewRequestSchema.safeParse({
      sourceBranch: 'feature-x',
    });
    expect(result.success).toBe(false);
  });
});

describe('MergePreviewResponseSchema', () => {
  it('validates a clean merge response', () => {
    const result = MergePreviewResponseSchema.safeParse({
      data: {
        hasConflicts: false,
        sourceHash: 'abc123',
        targetHash: 'def456',
        canFastForward: true,
        diffSummary: [
          {
            table: 'agent',
            diffType: 'modified',
            dataChange: true,
            schemaChange: false,
          },
        ],
        conflicts: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates a conflicted merge response', () => {
    const result = MergePreviewResponseSchema.safeParse({
      data: {
        hasConflicts: true,
        sourceHash: 'abc123',
        targetHash: 'def456',
        canFastForward: false,
        diffSummary: [
          {
            table: 'agent',
            diffType: 'modified',
            dataChange: true,
            schemaChange: false,
          },
        ],
        conflicts: [
          {
            table: 'agent',
            primaryKey: { id: 'agent-1' },
            ourDiffType: 'modified',
            theirDiffType: 'modified',
            base: { name: 'Original Agent' },
            ours: { name: 'Our Agent' },
            theirs: { name: 'Their Agent' },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates response with null base/ours/theirs for add/delete conflicts', () => {
    const result = MergePreviewResponseSchema.safeParse({
      data: {
        hasConflicts: true,
        sourceHash: 'abc123',
        targetHash: 'def456',
        canFastForward: false,
        diffSummary: [],
        conflicts: [
          {
            table: 'agent',
            primaryKey: { id: 'agent-1' },
            ourDiffType: 'removed',
            theirDiffType: 'modified',
            base: { name: 'Original' },
            ours: null,
            theirs: { name: 'Updated' },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('MergeExecuteRequestSchema', () => {
  it('validates a minimal merge execute request', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      sourceHash: 'abc123',
      targetHash: 'def456',
    });
    expect(result.success).toBe(true);
  });

  it('validates request with message and author', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      sourceHash: 'abc123',
      targetHash: 'def456',
      message: 'Merge feature-x into main',
      author: { name: 'Test User', email: 'test@example.com' },
    });
    expect(result.success).toBe(true);
  });

  it('validates request with resolutions', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      sourceHash: 'abc123',
      targetHash: 'def456',
      resolutions: [
        {
          table: 'agent',
          primaryKey: { id: 'agent-1' },
          rowDefaultPick: 'ours',
        },
        {
          table: 'agent',
          primaryKey: { id: 'agent-2' },
          rowDefaultPick: 'theirs',
          columns: { name: 'ours', description: 'theirs' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates request with baseCommit and localProjectDefinition', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'main',
      targetBranch: 'main',
      sourceHash: 'abc123',
      targetHash: 'def456',
      baseCommit: 'commit-hash',
      localProjectDefinition: { id: 'project-1', agents: {} },
      resolutions: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects request missing sourceHash', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      targetHash: 'def456',
    });
    expect(result.success).toBe(false);
  });

  it('rejects request missing targetHash', () => {
    const result = MergeExecuteRequestSchema.safeParse({
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      sourceHash: 'abc123',
    });
    expect(result.success).toBe(false);
  });
});

describe('MergeExecuteResponseSchema', () => {
  it('validates a successful merge response', () => {
    const result = MergeExecuteResponseSchema.safeParse({
      data: {
        status: 'success',
        mergeCommitHash: 'newcommithash123',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects response with wrong status', () => {
    const result = MergeExecuteResponseSchema.safeParse({
      data: {
        status: 'failed',
        mergeCommitHash: 'hash',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ConflictResolutionSchema', () => {
  it('validates ours resolution', () => {
    const result = ConflictResolutionSchema.safeParse({
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      rowDefaultPick: 'ours',
    });
    expect(result.success).toBe(true);
  });

  it('validates theirs resolution with column overrides', () => {
    const result = ConflictResolutionSchema.safeParse({
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      rowDefaultPick: 'theirs',
      columns: { name: 'ours', description: 'theirs' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid rowDefaultPick', () => {
    const result = ConflictResolutionSchema.safeParse({
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      rowDefaultPick: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});
