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

describe('Improvements Merge API - Integration Tests', () => {
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
              type: 'internal' as const,
              canUse: [],
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
    return { projectId, agentId, subAgentId, projectData };
  };

  const createBranch = async (tenantId: string, projectId: string, name: string) => {
    const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/branches`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).data;
  };

  const updateProjectFull = async (
    tenantId: string,
    projectId: string,
    data: Record<string, unknown>,
    ref?: string
  ) => {
    const url = ref
      ? `/manage/tenants/${tenantId}/project-full/${projectId}?ref=${ref}`
      : `/manage/tenants/${tenantId}/project-full/${projectId}`;
    const res = await makeRequest(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    expect(res.status).toBe(200);
    return res;
  };

  const getProjectFull = async (tenantId: string, projectId: string, ref?: string) => {
    const url = ref
      ? `/manage/tenants/${tenantId}/project-full/${projectId}?ref=${ref}`
      : `/manage/tenants/${tenantId}/project-full/${projectId}`;
    const res = await makeRequest(url);
    expect(res.status).toBe(200);
    return (await res.json()).data;
  };

  const mergeImprovement = async (
    tenantId: string,
    projectId: string,
    branchName: string,
    body: Record<string, unknown> = {}
  ) => {
    const encoded = encodeURIComponent(branchName);
    return makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/merge`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  };

  const withAgentFields = (
    base: Record<string, any>,
    agentId: string,
    overrides: Record<string, unknown>
  ) => {
    const copy = structuredClone(base);
    Object.assign(copy.agents[agentId], overrides);
    return copy;
  };

  it('rejects merging a non-improvement branch', async () => {
    const tenantId = await createTrackedTenant('improvement-prefix');
    const { projectId } = await createProjectWithAgent(tenantId);

    await createBranch(tenantId, projectId, 'feature-x');

    const res = await mergeImprovement(tenantId, projectId, 'feature-x');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.message ?? body.detail).toMatch(/Not an improvement branch/);
  });

  it('merges an improvement branch into main (default target) and deletes source', async () => {
    const tenantId = await createTrackedTenant('improvement-merge-main');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'From Improvement' }),
      improvementBranch
    );

    const res = await mergeImprovement(tenantId, projectId, improvementBranch);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sourceBranch).toBe(improvementBranch);
    expect(body.targetBranch).toBe('main');
    expect(body.mergeCommitHash).toBeDefined();

    const mainProject = await getProjectFull(tenantId, projectId, 'main');
    expect(mainProject.agents[agentId].name).toBe('From Improvement');

    const branchesRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/branches`
    );
    const branches = await branchesRes.json();
    const names = (branches.data ?? []).map((b: { name: string }) => b.name);
    expect(names).not.toContain(improvementBranch);
  });

  it('merges an improvement branch into a non-main target branch', async () => {
    const tenantId = await createTrackedTenant('improvement-merge-custom');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    const customTarget = `staging-${generateId(6)}`;

    await createBranch(tenantId, projectId, customTarget);
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Onto Staging' }),
      improvementBranch
    );

    const res = await mergeImprovement(tenantId, projectId, improvementBranch, {
      targetBranch: customTarget,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetBranch).toBe(customTarget);
    expect(body.sourceBranch).toBe(improvementBranch);

    const targetProject = await getProjectFull(tenantId, projectId, customTarget);
    expect(targetProject.agents[agentId].name).toBe('Onto Staging');

    const mainProject = await getProjectFull(tenantId, projectId, 'main');
    expect(mainProject.agents[agentId].name).toBe('Original Agent');
  });

  it('returns 409 with conflict details when branches have conflicting changes', async () => {
    const tenantId = await createTrackedTenant('improvement-merge-conflict');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Main Edit' }),
      'main'
    );
    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Improvement Edit' }),
      improvementBranch
    );

    const res = await mergeImprovement(tenantId, projectId, improvementBranch);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflicts).toBeDefined();
    expect(Array.isArray(body.conflicts)).toBe(true);
    expect(body.conflicts.length).toBeGreaterThan(0);

    const agentConflict = body.conflicts.find(
      (c: { table: string; primaryKey: Record<string, string> }) =>
        c.table === 'agent' && c.primaryKey.id === agentId
    );
    expect(agentConflict).toBeDefined();
  });

  const improvementDiff = async (
    tenantId: string,
    projectId: string,
    branchName: string,
    query?: Record<string, string>
  ) => {
    const encoded = encodeURIComponent(branchName);
    const qs = query
      ? `?${Object.entries(query)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join('&')}`
      : '';
    return makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/diff${qs}`
    );
  };

  it('diff returns hashes and conflicts from preview delegation', async () => {
    const tenantId = await createTrackedTenant('improvement-diff-preview');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Main Side' }),
      'main'
    );
    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Improvement Side' }),
      improvementBranch
    );

    const res = await improvementDiff(tenantId, projectId, improvementBranch);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.targetBranch).toBe('main');
    expect(body.sourceHash).toBeDefined();
    expect(body.targetHash).toBeDefined();
    expect(body.hasConflicts).toBe(true);
    expect(Array.isArray(body.conflicts)).toBe(true);
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(Array.isArray(body.summary)).toBe(true);
  });

  it('diff supports custom targetBranch via query param', async () => {
    const tenantId = await createTrackedTenant('improvement-diff-custom');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    const customTarget = `staging-${generateId(6)}`;
    await createBranch(tenantId, projectId, customTarget);
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'On Improvement' }),
      improvementBranch
    );

    const res = await improvementDiff(tenantId, projectId, improvementBranch, {
      targetBranch: customTarget,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetBranch).toBe(customTarget);
    expect(body.hasConflicts).toBe(false);
  });

  const revertImprovementRows = async (
    tenantId: string,
    projectId: string,
    branchName: string,
    body: Record<string, unknown>
  ) => {
    const encoded = encodeURIComponent(branchName);
    return makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/revert`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  };

  it('revert uses targetBranch as baseline (not main) when provided', async () => {
    const tenantId = await createTrackedTenant('improvement-revert-custom');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    const customTarget = `staging-${generateId(6)}`;

    await createBranch(tenantId, projectId, customTarget);
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Target Version' }),
      customTarget
    );
    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Improvement Version' }),
      improvementBranch
    );

    const revertRes = await revertImprovementRows(tenantId, projectId, improvementBranch, {
      targetBranch: customTarget,
      rows: [
        {
          table: 'agent',
          primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
          diffType: 'modified',
        },
      ],
    });
    expect(revertRes.status).toBe(200);

    const improvementProject = await getProjectFull(tenantId, projectId, improvementBranch);
    expect(improvementProject.agents[agentId].name).toBe('Target Version');

    const mainProject = await getProjectFull(tenantId, projectId, 'main');
    expect(mainProject.agents[agentId].name).toBe('Original Agent');
  });

  it('revert rejects when targetBranch equals source branch', async () => {
    const tenantId = await createTrackedTenant('improvement-revert-same-branch');
    const { projectId } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    await createBranch(tenantId, projectId, improvementBranch);

    const res = await revertImprovementRows(tenantId, projectId, improvementBranch, {
      targetBranch: improvementBranch,
      rows: [
        {
          table: 'agent',
          primaryKey: { id: 'x' },
          diffType: 'added',
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('merges with conflict resolutions applied', async () => {
    const tenantId = await createTrackedTenant('improvement-merge-resolve');
    const { projectId, agentId, projectData } = await createProjectWithAgent(tenantId);

    const improvementBranch = `improvement-${generateId(6)}`;
    await createBranch(tenantId, projectId, improvementBranch);

    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Main Edit' }),
      'main'
    );
    await updateProjectFull(
      tenantId,
      projectId,
      withAgentFields(projectData, agentId, { name: 'Improvement Edit' }),
      improvementBranch
    );

    const conflictRes = await mergeImprovement(tenantId, projectId, improvementBranch);
    expect(conflictRes.status).toBe(409);
    const conflictBody = await conflictRes.json();

    const resolutions = (conflictBody.conflicts as any[]).map((c) => ({
      table: c.table,
      primaryKey: c.primaryKey,
      rowDefaultPick: 'theirs' as const,
    }));

    const res = await mergeImprovement(tenantId, projectId, improvementBranch, { resolutions });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const mainProject = await getProjectFull(tenantId, projectId, 'main');
    expect(mainProject.agents[agentId].name).toBe('Improvement Edit');
  });
});
