import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  canUseProjectStrict: vi.fn(),
  getDatasetRunConfigAgentRelations: vi.fn(),
  getDatasetRunConfigById: vi.fn(),
  getDatasetRunConfigEvaluatorRelations: vi.fn(),
  getProjectScopedRef: vi.fn(),
  resolveRef: vi.fn(),
  withRef: vi.fn(),
}));

vi.mock('../../../../data/db', () => ({
  manageDbClient: 'mock-manage-client',
}));

vi.mock('../../../../data/db/manageDbPool', () => ({
  default: 'mock-manage-pool',
}));

vi.mock('../../../../logger', () => createMockLoggerModule().module);

vi.mock('../../services/datasetRun', () => ({
  executeDatasetRun: vi.fn(),
}));

import {
  canUseProjectStrict,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getDatasetRunConfigEvaluatorRelations,
  getProjectScopedRef,
  resolveRef,
  withRef,
} from '@inkeep/agents-core';
import { executeDatasetRun } from '../../services/datasetRun';
import { executeDatasetRunStep } from '../steps/scheduledDatasetRunSteps';

const mockCanUse = canUseProjectStrict as ReturnType<typeof vi.fn>;
const mockGetAgentRelations = getDatasetRunConfigAgentRelations as ReturnType<typeof vi.fn>;
const mockGetConfigById = getDatasetRunConfigById as ReturnType<typeof vi.fn>;
const mockGetEvaluatorRelations = getDatasetRunConfigEvaluatorRelations as ReturnType<typeof vi.fn>;
const mockGetProjectScopedRef = getProjectScopedRef as ReturnType<typeof vi.fn>;
const mockResolveRef = resolveRef as ReturnType<typeof vi.fn>;
const mockWithRef = withRef as ReturnType<typeof vi.fn>;
const mockExecuteDatasetRun = executeDatasetRun as ReturnType<typeof vi.fn>;

const baseParams = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  scheduledTriggerId: 'trigger-1',
  datasetRunConfigId: 'config-1',
  scheduledFor: '2026-06-17T10:00:00.000Z',
  ref: 'main',
};

describe('executeDatasetRunStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanUse.mockResolvedValue(true);
    mockGetProjectScopedRef.mockReturnValue('scoped-ref');
    mockResolveRef.mockReturnValue(() => Promise.resolve({ branchName: 'main' }));
    mockGetConfigById.mockReturnValue(() => Promise.resolve({ dispatchDelayMs: 0 }));
    mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));
    mockGetEvaluatorRelations.mockReturnValue(() => Promise.resolve([]));
    mockExecuteDatasetRun.mockResolvedValue({
      datasetRunId: 'run-1',
      totalItems: 5,
      failedInvocations: 0,
      failedQueueing: 0,
    });
    mockWithRef.mockImplementation(
      async (_pool: unknown, _ref: unknown, fn: (db: unknown) => Promise<unknown>) =>
        fn('mock-branch-db')
    );
  });

  describe('permission checks', () => {
    it('returns structured error when user lacks project access', async () => {
      mockCanUse.mockResolvedValue(false);

      const result = await executeDatasetRunStep({
        ...baseParams,
        runAsUserId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("no longer has 'use' permission");
      expect(mockWithRef).not.toHaveBeenCalled();
    });

    it('returns structured error when permission check throws', async () => {
      mockCanUse.mockRejectedValue(new Error('SpiceDB down'));

      const result = await executeDatasetRunStep({
        ...baseParams,
        runAsUserId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission check failed');
      expect(result.error).toContain('SpiceDB down');
    });

    it('skips permission check when no runAsUserId', async () => {
      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(true);
      expect(mockCanUse).not.toHaveBeenCalled();
    });
  });

  describe('ref resolution', () => {
    it('returns structured error when ref cannot be resolved', async () => {
      mockResolveRef.mockReturnValue(() => Promise.resolve(null));

      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to resolve ref');
    });
  });

  describe('error-to-structured-result conversion', () => {
    it('catches withRef throws and returns structured error', async () => {
      mockWithRef.mockRejectedValue(new Error('DB connection lost'));

      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB connection lost');
    });

    it('catches non-Error throws and stringifies them', async () => {
      mockWithRef.mockRejectedValue('string error');

      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('returns configMisconfigured when no agents configured', async () => {
      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([]));

      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.configMisconfigured).toBe(true);
      expect(result.error).toContain('No agents configured');
    });

    it('returns configDeleted when dataset run config no longer exists', async () => {
      mockGetConfigById.mockReturnValue(() => Promise.resolve(null));

      const result = await executeDatasetRunStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.configDeleted).toBe(true);
      expect(result.error).toContain('no longer exists');
    });
  });

  it('returns success with datasetRunId on happy path', async () => {
    const result = await executeDatasetRunStep(baseParams);

    expect(result.success).toBe(true);
    expect(result.datasetRunId).toBe('run-1');
  });

  it('generates deterministic dataset run ID with runAsUserId', async () => {
    await executeDatasetRunStep({ ...baseParams, runAsUserId: 'user-1' });

    const callArgs = mockExecuteDatasetRun.mock.calls[0][0];
    expect(callArgs.datasetRunId).toBe('dsr_trigger-1_user-1_2026-06-17T10:00:00.000Z');
  });

  it('generates deterministic dataset run ID without runAsUserId', async () => {
    await executeDatasetRunStep(baseParams);

    const callArgs = mockExecuteDatasetRun.mock.calls[0][0];
    expect(callArgs.datasetRunId).toBe('dsr_trigger-1_2026-06-17T10:00:00.000Z');
  });
});
