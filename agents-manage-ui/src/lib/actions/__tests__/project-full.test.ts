/**
 * Tests for Project Full Server Actions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as projectFullClient from '../../api/project-full';
import type { FullProjectDefinition } from '../../types/project-full';
import { getFullProjectAction } from '../project-full';

vi.mock('../../api/project-full', async (importOriginal) => {
  const actual = await importOriginal<typeof projectFullClient>();
  return {
    ...actual,
    getFullProject: vi.fn(),
  };
});

describe('Project Full Actions', () => {
  const mockTenantId = 'test-tenant';
  const mockProjectId = 'test-project';

  const mockFullProject: FullProjectDefinition = {
    id: mockProjectId,
    name: 'Test Project',
    description: 'A test project',
    models: {
      base: 'claude-3-5-sonnet-20241022',
    },
    agents: {
      'agent-1': {
        id: 'agent-1',
        name: 'Test Agent',
        subAgents: {},
      } as any,
    },
    tools: {},
    dataComponents: {},
    artifactComponents: {},
    externalAgents: {},
    credentialReferences: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFullProjectAction', () => {
    it('should successfully fetch a full project', async () => {
      vi.mocked(projectFullClient.getFullProject).mockResolvedValue({
        data: mockFullProject,
      });

      const result = await getFullProjectAction(mockTenantId, mockProjectId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockFullProject);
      }
      expect(projectFullClient.getFullProject).toHaveBeenCalledWith(mockTenantId, mockProjectId);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new projectFullClient.ApiError(
        {
          code: 'not_found',
          message: 'Project not found',
        },
        404
      );

      vi.mocked(projectFullClient.getFullProject).mockRejectedValue(apiError);

      const result = await getFullProjectAction(mockTenantId, mockProjectId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Project not found');
        expect(result.code).toBe('not_found');
      }
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Network error');

      vi.mocked(projectFullClient.getFullProject).mockRejectedValue(genericError);

      const result = await getFullProjectAction(mockTenantId, mockProjectId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Network error');
        expect(result.code).toBe('unknown_error');
      }
    });

    it('should return all project resources when available', async () => {
      const fullProjectWithResources: FullProjectDefinition = {
        ...mockFullProject,
        tools: {
          'tool-1': {
            id: 'tool-1',
            name: 'Test Tool',
            config: {},
          } as any,
        },
        dataComponents: {
          'dc-1': {
            id: 'dc-1',
            name: 'Test Data Component',
            type: 'webhook',
          } as any,
        },
        artifactComponents: {
          'ac-1': {
            id: 'ac-1',
            name: 'Test Artifact Component',
            type: 'file',
          } as any,
        },
        externalAgents: {
          'ea-1': {
            id: 'ea-1',
            name: 'Test External Agent',
            agentBaseUrl: 'https://example.com',
          } as any,
        },
        credentialReferences: {
          'cred-1': {
            id: 'cred-1',
            name: 'Test Credential',
            credentialStoreType: 'env',
          } as any,
        },
      };

      vi.mocked(projectFullClient.getFullProject).mockResolvedValue({
        data: fullProjectWithResources,
      });

      const result = await getFullProjectAction(mockTenantId, mockProjectId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools).toBeDefined();
        expect(result.data.dataComponents).toBeDefined();
        expect(result.data.artifactComponents).toBeDefined();
        expect(result.data.externalAgents).toBeDefined();
        expect(result.data.credentialReferences).toBeDefined();
        expect(Object.keys(result.data.tools)).toHaveLength(1);
        expect(Object.keys(result.data.dataComponents || {})).toHaveLength(1);
        expect(Object.keys(result.data.artifactComponents || {})).toHaveLength(1);
        expect(Object.keys(result.data.externalAgents || {})).toHaveLength(1);
        expect(Object.keys(result.data.credentialReferences || {})).toHaveLength(1);
      }
    });
  });
});
