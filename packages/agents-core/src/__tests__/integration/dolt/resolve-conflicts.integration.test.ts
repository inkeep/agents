import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgent, getAgentById, updateAgent } from '../../../data-access/manage/agents';
import { createProject } from '../../../data-access/manage/projects';
import {
  createSubAgent,
  getSubAgentById,
  updateSubAgent,
} from '../../../data-access/manage/subAgents';
import { cleanupTestData, getIntegrationTestClient } from '../../../db/manage/dolt-cleanup';
import { agents } from '../../../db/manage/manage-schema';
import { doltActiveBranch, doltBranch, doltCheckout } from '../../../dolt/branch';
import { doltAddAndCommit } from '../../../dolt/commit';
import { doltMerge, MergeConflictError } from '../../../dolt/merge';

const dbClient = getIntegrationTestClient();

describe('Resolve Conflicts - Integration Tests', () => {
  const testPrefix = 'test-resolve-conflicts';
  const createdBranches = new Set<string>();

  const getBranchName = (suffix: string) => `${testPrefix}-${suffix}-${Date.now()}`;

  const tenantId = 'test-resolve-tenant';
  const projectId = `test-resolve-project-${Date.now()}`;
  const agentId = `test-resolve-agent-${Date.now()}`;

  let mainBranch: string;
  let originalBranch: string | null = null;

  beforeEach(async () => {
    originalBranch = await doltActiveBranch(dbClient)();
    mainBranch = getBranchName('main');
    createdBranches.add(mainBranch);

    await doltBranch(dbClient)({ name: mainBranch });
    await doltCheckout(dbClient)({ branch: mainBranch });

    await createProject(dbClient)({
      id: projectId,
      tenantId,
      name: 'Resolve Conflicts Test Project',
      description: 'Project for conflict resolution integration tests',
      models: { base: { model: 'gpt-4.1-mini' } },
    });

    await createAgent(dbClient)({
      tenantId,
      projectId,
      id: agentId,
      name: 'Original Agent',
      description: 'Original description',
    });

    await doltAddAndCommit(dbClient)({ message: 'Seed data for conflict tests' });
  });

  afterEach(async () => {
    if (originalBranch) {
      try {
        await doltCheckout(dbClient)({ branch: originalBranch });
      } catch {
        // ignore
      }
    }
    await cleanupTestData(testPrefix, createdBranches);
    createdBranches.clear();
  });

  const scopes = { tenantId, projectId, agentId };

  async function makeDivergingEdits(params: {
    oursName: string;
    theirsName: string;
    oursDescription?: string;
    theirsDescription?: string;
  }): Promise<{ oursBranch: string; theirsBranch: string }> {
    const oursBranch = getBranchName('ours');
    const theirsBranch = getBranchName('theirs');
    createdBranches.add(oursBranch);
    createdBranches.add(theirsBranch);

    await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
    await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

    await doltCheckout(dbClient)({ branch: oursBranch });
    await updateAgent(dbClient)({
      scopes,
      data: {
        name: params.oursName,
        ...(params.oursDescription !== undefined && { description: params.oursDescription }),
      },
    });
    await doltAddAndCommit(dbClient)({ message: 'Ours edit' });

    await doltCheckout(dbClient)({ branch: theirsBranch });
    await updateAgent(dbClient)({
      scopes,
      data: {
        name: params.theirsName,
        ...(params.theirsDescription !== undefined && { description: params.theirsDescription }),
      },
    });
    await doltAddAndCommit(dbClient)({ message: 'Theirs edit' });

    return { oursBranch, theirsBranch };
  }

  describe('theirs pick resolves modified-vs-modified', () => {
    it('should apply theirs values when resolving with rowDefaultPick=theirs', async () => {
      const { oursBranch, theirsBranch } = await makeDivergingEdits({
        oursName: 'Ours Agent',
        theirsName: 'Theirs Agent',
      });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge theirs into ours with theirs resolution',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
            rowDefaultPick: 'theirs',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Theirs Agent');
    });
  });

  describe('ours pick keeps current branch state', () => {
    it('should keep ours values when resolving with rowDefaultPick=ours', async () => {
      const { oursBranch, theirsBranch } = await makeDivergingEdits({
        oursName: 'Ours Agent',
        theirsName: 'Theirs Agent',
      });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge theirs into ours with ours resolution',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
            rowDefaultPick: 'ours',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Ours Agent');
    });
  });

  describe('mixed column resolution', () => {
    it('should pick name from theirs and description from ours', async () => {
      const { oursBranch, theirsBranch } = await makeDivergingEdits({
        oursName: 'Ours Name',
        theirsName: 'Theirs Name',
        oursDescription: 'Ours Description',
        theirsDescription: 'Theirs Description',
      });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Mixed column resolution',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
            rowDefaultPick: 'ours',
            columns: { name: 'theirs' },
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Theirs Name');
      expect(agent?.description).toBe('Ours Description');
    });
  });

  describe('jsonb column resolution', () => {
    const subAgentId = `test-resolve-sub-${Date.now()}`;

    it('should correctly persist jsonb values when resolving with theirs', async () => {
      await createSubAgent(dbClient)({
        tenantId,
        projectId,
        agentId,
        id: subAgentId,
        name: 'Original Sub',
        conversationHistoryConfig: { mode: 'full', limit: 10 },
      });
      await doltAddAndCommit(dbClient)({ message: 'Add sub-agent with jsonb' });

      const oursBranch = getBranchName('jsonb-ours');
      const theirsBranch = getBranchName('jsonb-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      const subScopes = { tenantId, projectId, agentId };

      await doltCheckout(dbClient)({ branch: oursBranch });
      await updateSubAgent(dbClient)({
        scopes: subScopes,
        subAgentId,
        data: { name: 'Ours Sub', conversationHistoryConfig: { mode: 'scoped', limit: 20 } },
      });
      await doltAddAndCommit(dbClient)({ message: 'Ours jsonb edit' });

      const theirsConfig = { mode: 'full' as const, limit: 50, includeInternal: true };
      await doltCheckout(dbClient)({ branch: theirsBranch });
      await updateSubAgent(dbClient)({
        scopes: subScopes,
        subAgentId,
        data: { name: 'Theirs Sub', conversationHistoryConfig: theirsConfig },
      });
      await doltAddAndCommit(dbClient)({ message: 'Theirs jsonb edit' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge with jsonb resolution',
        resolutions: [
          {
            table: 'sub_agents',
            primaryKey: {
              tenant_id: tenantId,
              project_id: projectId,
              agent_id: agentId,
              id: subAgentId,
            },
            rowDefaultPick: 'theirs',
          },
        ],
      });

      expect(result.status).toBe('success');

      await doltCheckout(dbClient)({ branch: oursBranch });
      const sub = await getSubAgentById(dbClient)({ scopes: subScopes, subAgentId });
      expect(sub).toBeDefined();
      expect(sub?.name).toBe('Theirs Sub');
      expect(sub?.conversationHistoryConfig).toEqual(theirsConfig);
    });
  });

  describe('theirs removed (DELETE path)', () => {
    it('should delete the row when theirs side removed the agent', async () => {
      const oursBranch = getBranchName('del-ours');
      const theirsBranch = getBranchName('del-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      await doltCheckout(dbClient)({ branch: oursBranch });
      await updateAgent(dbClient)({ scopes, data: { name: 'Ours Modified' } });
      await doltAddAndCommit(dbClient)({ message: 'Ours modification' });

      await doltCheckout(dbClient)({ branch: theirsBranch });
      await dbClient
        .delete(agents)
        .where(
          and(
            eq(agents.tenantId, tenantId),
            eq(agents.projectId, projectId),
            eq(agents.id, agentId)
          )
        );
      await doltAddAndCommit(dbClient)({ message: 'Theirs deletion' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge deletion from theirs',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
            rowDefaultPick: 'theirs',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeNull();
    });
  });

  describe('ours removed, theirs modified (INSERT path)', () => {
    it('should re-insert the row with theirs values when our side removed it', async () => {
      const oursBranch = getBranchName('ins-ours');
      const theirsBranch = getBranchName('ins-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      await doltCheckout(dbClient)({ branch: oursBranch });
      await dbClient
        .delete(agents)
        .where(
          and(
            eq(agents.tenantId, tenantId),
            eq(agents.projectId, projectId),
            eq(agents.id, agentId)
          )
        );
      await doltAddAndCommit(dbClient)({ message: 'Ours deletion' });

      await doltCheckout(dbClient)({ branch: theirsBranch });
      await updateAgent(dbClient)({ scopes, data: { name: 'Theirs Re-inserted' } });
      await doltAddAndCommit(dbClient)({ message: 'Theirs modification' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge re-insert from theirs',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: agentId },
            rowDefaultPick: 'theirs',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Theirs Re-inserted');
    });
  });

  describe('timestamp-only conflicts auto-resolve', () => {
    it('should auto-resolve without user resolutions when only timestamps differ', async () => {
      const oursBranch = getBranchName('ts-ours');
      const theirsBranch = getBranchName('ts-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      await doltCheckout(dbClient)({ branch: oursBranch });
      await updateAgent(dbClient)({ scopes, data: { description: 'Original description' } });
      await doltAddAndCommit(dbClient)({ message: 'Ours timestamp touch' });

      await doltCheckout(dbClient)({ branch: theirsBranch });
      await updateAgent(dbClient)({ scopes, data: { description: 'Original description' } });
      await doltAddAndCommit(dbClient)({ message: 'Theirs timestamp touch' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge timestamp-only conflict',
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({ scopes });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Original Agent');
    });
  });

  describe('MergeConflictError without resolutions', () => {
    it('should throw MergeConflictError when real conflicts have no resolutions', async () => {
      const { oursBranch, theirsBranch } = await makeDivergingEdits({
        oursName: 'Ours Unresolved',
        theirsName: 'Theirs Unresolved',
      });

      await expect(
        doltMerge(dbClient)({
          fromBranch: theirsBranch,
          toBranch: oursBranch,
          message: 'Should fail — no resolutions',
        })
      ).rejects.toThrow(MergeConflictError);
    });
  });

  describe('add-add conflict (null base PK)', () => {
    const addAddAgentId = `test-add-add-agent-${Date.now()}`;

    it('should resolve theirs when both branches independently add the same agent', async () => {
      const oursBranch = getBranchName('add-ours');
      const theirsBranch = getBranchName('add-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      await doltCheckout(dbClient)({ branch: oursBranch });
      await createAgent(dbClient)({
        tenantId,
        projectId,
        id: addAddAgentId,
        name: 'Ours New Agent',
        description: 'Added on ours branch',
      });
      await doltAddAndCommit(dbClient)({ message: 'Ours add agent' });

      await doltCheckout(dbClient)({ branch: theirsBranch });
      await createAgent(dbClient)({
        tenantId,
        projectId,
        id: addAddAgentId,
        name: 'Theirs New Agent',
        description: 'Added on theirs branch',
      });
      await doltAddAndCommit(dbClient)({ message: 'Theirs add agent' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge add-add conflict with theirs resolution',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: addAddAgentId },
            rowDefaultPick: 'theirs',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({
        scopes: { tenantId, projectId, agentId: addAddAgentId },
      });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Theirs New Agent');
      expect(agent?.description).toBe('Added on theirs branch');
    });

    it('should keep ours when both branches independently add the same agent with ours pick', async () => {
      const oursBranch = getBranchName('add-keep-ours');
      const theirsBranch = getBranchName('add-keep-theirs');
      createdBranches.add(oursBranch);
      createdBranches.add(theirsBranch);

      await doltBranch(dbClient)({ name: oursBranch, startPoint: mainBranch });
      await doltBranch(dbClient)({ name: theirsBranch, startPoint: mainBranch });

      await doltCheckout(dbClient)({ branch: oursBranch });
      await createAgent(dbClient)({
        tenantId,
        projectId,
        id: addAddAgentId,
        name: 'Ours Added Agent',
        description: 'Ours version',
      });
      await doltAddAndCommit(dbClient)({ message: 'Ours add' });

      await doltCheckout(dbClient)({ branch: theirsBranch });
      await createAgent(dbClient)({
        tenantId,
        projectId,
        id: addAddAgentId,
        name: 'Theirs Added Agent',
        description: 'Theirs version',
      });
      await doltAddAndCommit(dbClient)({ message: 'Theirs add' });

      const result = await doltMerge(dbClient)({
        fromBranch: theirsBranch,
        toBranch: oursBranch,
        message: 'Merge add-add conflict with ours resolution',
        resolutions: [
          {
            table: 'agent',
            primaryKey: { tenant_id: tenantId, project_id: projectId, id: addAddAgentId },
            rowDefaultPick: 'ours',
          },
        ],
      });

      expect(result.status).toBe('success');
      expect(result.hasConflicts).toBe(true);

      await doltCheckout(dbClient)({ branch: oursBranch });
      const agent = await getAgentById(dbClient)({
        scopes: { tenantId, projectId, agentId: addAddAgentId },
      });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Ours Added Agent');
      expect(agent?.description).toBe('Ours version');
    });
  });
});
