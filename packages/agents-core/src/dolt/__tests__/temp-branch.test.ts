import { describe, expect, it, vi } from 'vitest';

vi.mock('../branch', () => ({
  doltBranch: vi.fn(),
}));

import { doltBranch } from '../branch';
import { createTempBranchFromCommit } from '../temp-branch';

describe('createTempBranchFromCommit', () => {
  it('calls doltBranch with commit hash as startPoint', async () => {
    const mockBranchFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(doltBranch).mockReturnValue(mockBranchFn);

    const db = {} as any;
    await createTempBranchFromCommit(db)({
      name: '_merge_preview_123',
      commitHash: 'abc123def456',
    });

    expect(doltBranch).toHaveBeenCalledWith(db);
    expect(mockBranchFn).toHaveBeenCalledWith({
      name: '_merge_preview_123',
      startPoint: 'abc123def456',
    });
  });
});
