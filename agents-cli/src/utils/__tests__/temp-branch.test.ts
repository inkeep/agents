import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagementApiClient } from '../../api';
import { withLocalStateBranch } from '../temp-branch';

vi.mock('@inkeep/agents-core', () => ({
  getTempBranchSuffix: vi.fn((prefix: string) => `temp-${prefix}_mock`),
}));

function createMockApiClient(overrides?: Partial<ManagementApiClient>) {
  return {
    createBranch: vi.fn().mockResolvedValue(undefined),
    pushFullProject: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ManagementApiClient;
}

describe('withLocalStateBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates branch, pushes definition, runs callback, and cleans up', async () => {
    const apiClient = createMockApiClient();
    const fn = vi.fn().mockResolvedValue('result');

    const result = await withLocalStateBranch({
      apiClient,
      projectId: 'proj-1',
      fromCommit: 'abc123',
      localDefinition: { agents: {} },
      branchPrefix: 'test',
      fn,
    });

    expect(apiClient.createBranch).toHaveBeenCalledWith('proj-1', {
      name: 'temp-test_mock',
      fromCommit: 'abc123',
    });
    expect(apiClient.pushFullProject).toHaveBeenCalledWith('proj-1', 'temp-test_mock', {
      agents: {},
    });
    expect(fn).toHaveBeenCalledWith('temp-test_mock');
    expect(result).toBe('result');
    expect(apiClient.deleteBranch).toHaveBeenCalledWith('proj-1', 'temp-test_mock', true);
  });

  it('cleans up branch when callback throws', async () => {
    const apiClient = createMockApiClient();
    const fn = vi.fn().mockRejectedValue(new Error('callback failed'));

    await expect(
      withLocalStateBranch({
        apiClient,
        projectId: 'proj-1',
        fromCommit: 'abc123',
        localDefinition: {},
        branchPrefix: 'test',
        fn,
      })
    ).rejects.toThrow('callback failed');

    expect(apiClient.deleteBranch).toHaveBeenCalledWith('proj-1', 'temp-test_mock', true);
  });

  it('cleans up branch when createBranch throws', async () => {
    const apiClient = createMockApiClient({
      createBranch: vi.fn().mockRejectedValue(new Error('branch creation failed')),
    } as any);
    const fn = vi.fn();

    await expect(
      withLocalStateBranch({
        apiClient,
        projectId: 'proj-1',
        fromCommit: 'abc123',
        localDefinition: {},
        branchPrefix: 'test',
        fn,
      })
    ).rejects.toThrow('branch creation failed');

    expect(fn).not.toHaveBeenCalled();
    expect(apiClient.deleteBranch).toHaveBeenCalledWith('proj-1', 'temp-test_mock', true);
  });

  it('swallows cleanup errors without masking the original error', async () => {
    const apiClient = createMockApiClient({
      deleteBranch: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    } as any);
    const fn = vi.fn().mockRejectedValue(new Error('callback failed'));

    await expect(
      withLocalStateBranch({
        apiClient,
        projectId: 'proj-1',
        fromCommit: 'abc123',
        localDefinition: {},
        branchPrefix: 'test',
        fn,
      })
    ).rejects.toThrow('callback failed');
  });

  it('swallows cleanup errors on success path', async () => {
    const apiClient = createMockApiClient({
      deleteBranch: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    } as any);
    const fn = vi.fn().mockResolvedValue('result');

    const result = await withLocalStateBranch({
      apiClient,
      projectId: 'proj-1',
      fromCommit: 'abc123',
      localDefinition: {},
      branchPrefix: 'test',
      fn,
    });

    expect(result).toBe('result');
  });
});
