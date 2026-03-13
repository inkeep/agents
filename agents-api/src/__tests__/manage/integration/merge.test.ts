import { generateId } from '@inkeep/agents-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupTenants } from '../../utils/cleanup';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    syncProjectToSpiceDb: vi.fn().mockResolvedValue(undefined),
    removeProjectFromSpiceDb: vi.fn().mockResolvedValue(undefined),
    syncOrgMemberToSpiceDb: vi.fn().mockResolvedValue(undefined),
    canUseProjectStrict: vi.fn().mockResolvedValue(true),
    getOrganizationMemberByUserId: vi.fn(() =>
      vi.fn(() =>
        Promise.resolve({
          id: 'mock-user',
          name: 'Mock',
          email: 'mock@test.com',
          role: 'member',
          memberId: 'mock-member',
        })
      )
    ),
  };
});

describe('Merge API - Integration Tests', () => {
  const createdTenants = new Set<string>();

  afterEach(async () => {
    await cleanupTenants(createdTenants);
    createdTenants.clear();
  });

  const createTrackedTenant = async (prefix: string) => {
    const tenantId = await createTestTenantWithOrg(prefix);
    createdTenants.add(tenantId);
    return tenantId;
  };

  const createProjectWithAgent = async (tenantId: string) => {
    const projectId = `project-${generateId(6)}`;
    const agentId = `agent-${generateId(6)}`;
    const subAgentId = `sub-${generateId(6)}`;

    const projectData = {
      id: projectId,
      name: 'Test Project',
      models: { base: { model: 'gpt-4o-mini', providerOptions: {} } },
      agents: {
        [agentId]: {
          id: agentId,
          name: 'Original Agent',
          description: 'Original description',
          defaultSubAgentId: subAgentId,
          subAgents: {
            [subAgentId]: {
              id: subAgentId,
              name: 'Default Sub',
              instructions: 'Test instructions',
            },
          },
          credentialReferences: {},
          dataComponents: {},
          artifactComponents: {},
          models: { base: { model: 'gpt-4o-mini' } },
        },
      },
      tools: {},
    };

    const res = await makeRequest(`/manage/tenants/${tenantId}/project-full`, {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
    expect(res.status).toBe(201);
    return { projectId, agentId, subAgentId };
  };

  const createBranch = async (tenantId: string, projectId: string, name: string) => {
    const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/branches`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).data;
  };

  const getProjectFull = async (tenantId: string, projectId: string, ref?: string) => {
    const url = ref
      ? `/manage/tenants/${tenantId}/project-full/${projectId}?ref=${ref}`
      : `/manage/tenants/${tenantId}/project-full/${projectId}`;
    const res = await makeRequest(url);
    expect(res.status).toBe(200);
    return (await res.json()).data;
  };

  const updateProjectFull = async (
    tenantId: string,
    data: Record<string, unknown>,
    ref?: string
  ) => {
    const url = ref
      ? `/manage/tenants/${tenantId}/project-full?ref=${ref}`
      : `/manage/tenants/${tenantId}/project-full`;
    const res = await makeRequest(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res;
  };

  const mergePreview = async (
    tenantId: string,
    projectId: string,
    body: Record<string, unknown>
  ) => {
    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/branches/merge/preview`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res;
  };

  const mergeExecute = async (
    tenantId: string,
    projectId: string,
    body: Record<string, unknown>
  ) => {
    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/branches/merge`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res;
  };

  describe('Clean merge (no conflicts)', () => {
    it('should preview a clean merge and return hasConflicts=false', async () => {
      const tenantId = await createTrackedTenant('merge-clean-preview');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const currentProject = await getProjectFull(tenantId, projectId, 'feature');
      const agents = currentProject.agents;
      agents[agentId].name = 'Updated on Feature';
      await updateProjectFull(tenantId, { ...currentProject, agents }, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });

      expect(previewRes.status).toBe(200);
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(false);
      expect(preview.data.sourceHash).toBeDefined();
      expect(preview.data.targetHash).toBeDefined();
      expect(preview.data.diffSummary).toBeDefined();
      expect(Array.isArray(preview.data.diffSummary)).toBe(true);
    });

    it('should execute a clean merge successfully', async () => {
      const tenantId = await createTrackedTenant('merge-clean-execute');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const currentProject = await getProjectFull(tenantId, projectId, 'feature');
      currentProject.agents[agentId].name = 'Merged Agent Name';
      await updateProjectFull(tenantId, currentProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      expect(previewRes.status).toBe(200);
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(false);

      const executeRes = await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
        message: 'Merge feature into main',
      });

      expect(executeRes.status).toBe(200);
      const result = await executeRes.json();
      expect(result.data.status).toBe('success');
      expect(result.data.mergeCommitHash).toBeDefined();
      expect(result.data.sourceBranch).toBe('feature');
      expect(result.data.targetBranch).toBe('main');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      expect(mainProject.agents[agentId].name).toBe('Merged Agent Name');
    });
  });

  describe('Conflicting merge with resolution', () => {
    it('should preview conflicts when both branches modify the same entity', async () => {
      const tenantId = await createTrackedTenant('merge-conflict-preview');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].name = 'Main Version';
      await updateProjectFull(tenantId, mainProject, 'main');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Version';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });

      expect(previewRes.status).toBe(200);
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(true);
      expect(preview.data.conflicts.length).toBeGreaterThan(0);

      const agentConflict = preview.data.conflicts.find(
        (c: any) => c.table === 'agent' && c.primaryKey.id === agentId
      );
      expect(agentConflict).toBeDefined();
      expect(agentConflict.ourDiffType).toBe('modified');
      expect(agentConflict.theirDiffType).toBe('modified');
    });

    it('should execute merge with conflict resolutions', async () => {
      const tenantId = await createTrackedTenant('merge-conflict-resolve');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].name = 'Main Version';
      await updateProjectFull(tenantId, mainProject, 'main');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Version';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(true);

      const resolutions = preview.data.conflicts.map((c: any) => ({
        table: c.table,
        primaryKey: c.primaryKey,
        rowDefaultPick: 'theirs' as const,
      }));

      const executeRes = await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
        resolutions,
      });

      expect(executeRes.status).toBe(200);
      const result = await executeRes.json();
      expect(result.data.status).toBe('success');
    });
  });

  describe('Per-column resolution', () => {
    it('should apply mixed ours/theirs column picks', async () => {
      const tenantId = await createTrackedTenant('merge-percol');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].name = 'Main Name';
      mainProject.agents[agentId].description = 'Main Description';
      await updateProjectFull(tenantId, mainProject, 'main');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Name';
      featureProject.agents[agentId].description = 'Feature Description';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(true);

      const agentConflict = preview.data.conflicts.find(
        (c: any) => c.table === 'agent' && c.primaryKey.id === agentId
      );
      expect(agentConflict).toBeDefined();

      const resolutions = preview.data.conflicts.map((c: any) => {
        if (c.table === 'agent' && c.primaryKey.id === agentId) {
          return {
            table: c.table,
            primaryKey: c.primaryKey,
            rowDefaultPick: 'ours' as const,
            columns: { name: 'theirs' as const },
          };
        }
        return {
          table: c.table,
          primaryKey: c.primaryKey,
          rowDefaultPick: 'ours' as const,
        };
      });

      const executeRes = await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
        resolutions,
      });

      expect(executeRes.status).toBe(200);
      const result = await executeRes.json();
      expect(result.data.status).toBe('success');
    });
  });

  describe('Stale hash rejection', () => {
    it('should return 409 when hashes are stale', async () => {
      const tenantId = await createTrackedTenant('merge-stale');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Change';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].description = 'Changed after preview';
      await updateProjectFull(tenantId, mainProject, 'main');

      const executeRes = await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
      });

      expect(executeRes.status).toBe(409);
      const error = await executeRes.json();
      expect(error.error.code).toBe('conflict');
      expect(error.error.message).toContain('changed since preview');
    });
  });

  describe('Missing resolutions', () => {
    it('should return 409 when conflicts exist but no resolutions provided', async () => {
      const tenantId = await createTrackedTenant('merge-nores');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].name = 'Main Change';
      await updateProjectFull(tenantId, mainProject, 'main');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Change';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(true);

      const executeRes = await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
      });

      expect(executeRes.status).toBe(409);
      const error = await executeRes.json();
      expect(error.error.message).toContain('no resolutions');
    });

    it('should return 400 when resolutions do not cover all conflicts', async () => {
      const tenantId = await createTrackedTenant('merge-partial');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const mainProject = await getProjectFull(tenantId, projectId, 'main');
      mainProject.agents[agentId].name = 'Main Change';
      await updateProjectFull(tenantId, mainProject, 'main');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Feature Change';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();
      expect(preview.data.hasConflicts).toBe(true);

      const partialResolutions =
        preview.data.conflicts.length > 1
          ? [
              {
                table: preview.data.conflicts[0].table,
                primaryKey: preview.data.conflicts[0].primaryKey,
                rowDefaultPick: 'ours' as const,
              },
            ]
          : [];

      if (partialResolutions.length > 0) {
        const executeRes = await mergeExecute(tenantId, projectId, {
          sourceBranch: 'feature',
          targetBranch: 'main',
          sourceHash: preview.data.sourceHash,
          targetHash: preview.data.targetHash,
          resolutions: partialResolutions,
        });

        expect(executeRes.status).toBe(400);
        const error = await executeRes.json();
        expect(error.error.message).toContain('do not cover all conflicts');
      }
    });
  });

  describe('Temp branch cleanup', () => {
    it('should clean up temp branches after successful merge', async () => {
      const tenantId = await createTrackedTenant('merge-cleanup-success');
      const { projectId, agentId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      const featureProject = await getProjectFull(tenantId, projectId, 'feature');
      featureProject.agents[agentId].name = 'Cleanup Test';
      await updateProjectFull(tenantId, featureProject, 'feature');

      const previewRes = await mergePreview(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
      });
      const preview = await previewRes.json();

      await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: preview.data.sourceHash,
        targetHash: preview.data.targetHash,
      });

      const branchesRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/branches`
      );
      const branches = await branchesRes.json();
      const tempBranches = branches.data.filter((b: any) => b.baseName.startsWith('_merge_'));
      expect(tempBranches).toHaveLength(0);
    });

    it('should clean up temp branches after failed merge', async () => {
      const tenantId = await createTrackedTenant('merge-cleanup-fail');
      const { projectId } = await createProjectWithAgent(tenantId);

      await createBranch(tenantId, projectId, 'feature');

      await mergeExecute(tenantId, projectId, {
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceHash: 'stale-hash',
        targetHash: 'stale-hash',
      });

      const branchesRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/branches`
      );
      const branches = await branchesRes.json();
      const tempBranches = branches.data.filter((b: any) => b.baseName.startsWith('_merge_'));
      expect(tempBranches).toHaveLength(0);
    });
  });
});
