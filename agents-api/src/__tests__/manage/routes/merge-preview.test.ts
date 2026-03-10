import { describe, expect, it } from 'vitest';
import {
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
