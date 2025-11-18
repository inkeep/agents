import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeDiff,
  extractFieldsToUpdate,
  fetchCurrentEntityState,
} from '../../actions/tool-approval';
import * as apiConfig from '../../api/api-config';

vi.mock('../../api/api-config', () => ({
  makeManagementApiRequest: vi.fn(),
}));

describe('tool-approval-mapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractFieldsToUpdate', () => {
    it('should extract body from input.request', () => {
      const input = {
        request: {
          body: {
            name: 'New Name',
            description: 'New Description',
          },
        },
      };

      const result = extractFieldsToUpdate(input);

      expect(result).toEqual({
        name: 'New Name',
        description: 'New Description',
      });
    });

    it('should handle direct body in input', () => {
      const input = {
        body: {
          name: 'Direct Body',
        },
      };

      const result = extractFieldsToUpdate(input);

      expect(result).toEqual({
        name: 'Direct Body',
      });
    });

    it('should return empty object if no body found', () => {
      const input = {
        request: {},
      };

      const result = extractFieldsToUpdate(input);

      expect(result).toEqual({});
    });
  });

  describe('computeDiff', () => {
    it('should compute diffs for changed fields', () => {
      const currentState = {
        name: 'Old Name',
        description: 'Old Description',
        prompt: 'Unchanged',
      };

      const newValues = {
        name: 'New Name',
        description: 'New Description',
        prompt: 'Unchanged',
      };

      const diffs = computeDiff(currentState, newValues);

      expect(diffs).toHaveLength(2);
      expect(diffs).toContainEqual({
        field: 'name',
        oldValue: 'Old Name',
        newValue: 'New Name',
      });
      expect(diffs).toContainEqual({
        field: 'description',
        oldValue: 'Old Description',
        newValue: 'New Description',
      });
    });

    it('should handle null current state', () => {
      const newValues = {
        name: 'New Name',
        description: 'New Description',
      };

      const diffs = computeDiff(null, newValues);

      expect(diffs).toHaveLength(2);
      expect(diffs).toContainEqual({
        field: 'name',
        oldValue: '',
        newValue: 'New Name',
      });
    });

    it('should handle object values', () => {
      const currentState = {
        config: { enabled: false },
      };

      const newValues = {
        config: { enabled: true },
      };

      const diffs = computeDiff(currentState, newValues);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('config');
      expect(diffs[0].oldValue).toEqual({ enabled: false });
      expect(diffs[0].newValue).toEqual({ enabled: true });
    });

    it('should return empty array when no changes', () => {
      const currentState = {
        name: 'Same Name',
      };

      const newValues = {
        name: 'Same Name',
      };

      const diffs = computeDiff(currentState, newValues);

      expect(diffs).toHaveLength(0);
    });
  });

  describe('fetchCurrentEntityState', () => {
    const mockMakeManagementApiRequest = vi.mocked(apiConfig.makeManagementApiRequest);

    it('should fetch current state for sub-agent update', async () => {
      const mockResponse = {
        data: {
          id: 'test-sub-agent',
          name: 'Old Name',
          description: 'Old Description',
        },
      };

      mockMakeManagementApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-update-subagent',
        input: {
          request: {
            id: 'test-sub-agent',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual(mockResponse.data);
      expect(mockMakeManagementApiRequest).toHaveBeenCalledWith(
        'tenants/default/projects/test-project/sub-agents/test-sub-agent',
        { method: 'GET' }
      );
    });

    it('should fetch current state for agent update', async () => {
      const mockResponse = {
        data: {
          id: 'test-agent',
          name: 'Old Agent Name',
        },
      };

      mockMakeManagementApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchCurrentEntityState({
        toolName: 'agents-update-agent',
        input: {
          request: {
            agentId: 'test-agent',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual(mockResponse.data);
      expect(mockMakeManagementApiRequest).toHaveBeenCalledWith(
        'tenants/default/projects/test-project/agents/test-agent',
        { method: 'GET' }
      );
    });

    it('should return empty object for create operations', async () => {
      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-create-subagent',
        input: {
          request: {
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual({});
      expect(mockMakeManagementApiRequest).not.toHaveBeenCalled();
    });

    it('should return null for non-update/create operations', async () => {
      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-delete-subagent',
        input: {
          request: {
            id: 'test-sub-agent',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toBeNull();
      expect(mockMakeManagementApiRequest).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockMakeManagementApiRequest.mockRejectedValue(new Error('API Error'));

      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-update-subagent',
        input: {
          request: {
            id: 'test-sub-agent',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toBeNull();
    });

    it('should return null when entity ID cannot be extracted', async () => {
      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-update-subagent',
        input: {
          request: {
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toBeNull();
      expect(mockMakeManagementApiRequest).not.toHaveBeenCalled();
    });

    it('should handle project updates correctly', async () => {
      const mockResponse = {
        data: {
          id: 'test-project',
          name: 'Old Project',
        },
      };

      mockMakeManagementApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchCurrentEntityState({
        toolName: 'projects-update-project',
        input: {
          request: {
            id: 'test-project',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual(mockResponse.data);
      expect(mockMakeManagementApiRequest).toHaveBeenCalledWith(
        'tenants/default/projects/test-project',
        { method: 'GET' }
      );
    });

    it('should handle tool updates correctly', async () => {
      const mockResponse = {
        data: {
          id: 'test-tool',
          name: 'Old Tool',
        },
      };

      mockMakeManagementApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchCurrentEntityState({
        toolName: 'tools-update-tool',
        input: {
          request: {
            toolId: 'test-tool',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual(mockResponse.data);
      expect(mockMakeManagementApiRequest).toHaveBeenCalledWith(
        'tenants/default/projects/test-project/tools/test-tool',
        { method: 'GET' }
      );
    });

    it('should handle relation updates correctly', async () => {
      const mockResponse = {
        data: {
          id: 'test-relation',
        },
      };

      mockMakeManagementApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchCurrentEntityState({
        toolName: 'sub-agent-relations-update-sub-agent-relation',
        input: {
          request: {
            id: 'test-relation',
            tenantId: 'default',
            projectId: 'test-project',
          },
        },
        tenantId: 'default',
        projectId: 'test-project',
      });

      expect(result).toEqual(mockResponse.data);
      expect(mockMakeManagementApiRequest).toHaveBeenCalledWith(
        'tenants/default/projects/test-project/sub-agent-relations/test-relation',
        { method: 'GET' }
      );
    });
  });
});
