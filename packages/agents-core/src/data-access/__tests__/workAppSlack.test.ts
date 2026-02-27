import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import * as runtimeSchema from '../../db/runtime/runtime-schema';
import {
  clearWorkspaceDefaultsByAgent,
  clearWorkspaceDefaultsByProject,
  createWorkAppSlackChannelAgentConfig,
  createWorkAppSlackUserMapping,
  createWorkAppSlackWorkspace,
  deleteAllWorkAppSlackChannelAgentConfigsByTeam,
  deleteAllWorkAppSlackUserMappingsByTeam,
  deleteWorkAppSlackChannelAgentConfig,
  deleteWorkAppSlackChannelAgentConfigsByAgent,
  deleteWorkAppSlackChannelAgentConfigsByProject,
  deleteWorkAppSlackUserMapping,
  deleteWorkAppSlackWorkspace,
  deleteWorkAppSlackWorkspaceByNangoConnectionId,
  findWorkAppSlackChannelAgentConfig,
  findWorkAppSlackUserMapping,
  findWorkAppSlackUserMappingByInkeepUserId,
  findWorkAppSlackUserMappingBySlackUser,
  findWorkAppSlackWorkspaceByNangoConnectionId,
  findWorkAppSlackWorkspaceByTeamId,
  listWorkAppSlackChannelAgentConfigsByTeam,
  listWorkAppSlackUserMappingsByTeam,
  listWorkAppSlackWorkspacesByTenant,
  updateWorkAppSlackWorkspace,
  upsertWorkAppSlackChannelAgentConfig,
} from '../runtime/workAppSlack';

vi.mock('../../logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

describe('workAppSlack data access', () => {
  let db: AgentsRunDatabaseClient;
  let pglite: PGlite;

  const TEST_TENANT_ID = 'org_test123';
  const TEST_TENANT_ID_2 = 'org_test456';
  const TEST_TEAM_ID = 'T0AA0UWRXJS';
  const TEST_TEAM_ID_2 = 'T0BB0VWSYKT';
  const TEST_USER_ID = 'U0A9WJVPN1H';
  const TEST_USER_ID_2 = 'U0B8XKVQM2I';
  const TEST_CHANNEL_ID = 'C0AA0UWRXJS';
  const TEST_CHANNEL_ID_2 = 'C0BB0VWSYKT';
  const TEST_INKEEP_USER_ID = 'user_abc123';

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema: runtimeSchema }) as unknown as AgentsRunDatabaseClient;

    const isInPackageDir = process.cwd().includes('agents-core');
    const migrationsPath = isInPackageDir
      ? './drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(drizzle(pglite), {
      migrationsFolder: migrationsPath,
    });

    await db.insert(runtimeSchema.organization).values({
      id: TEST_TENANT_ID,
      name: 'Test Org',
      slug: 'test-org',
      createdAt: new Date(),
    });

    await db.insert(runtimeSchema.organization).values({
      id: TEST_TENANT_ID_2,
      name: 'Test Org 2',
      slug: 'test-org-2',
      createdAt: new Date(),
    });

    await db.insert(runtimeSchema.user).values({
      id: TEST_INKEEP_USER_ID,
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  beforeEach(async () => {
    await db.delete(runtimeSchema.workAppSlackChannelAgentConfigs);
    await db.delete(runtimeSchema.workAppSlackUserMappings);
    await db.delete(runtimeSchema.workAppSlackWorkspaces);
  });

  describe('Workspace CRUD', () => {
    it('should create a workspace', async () => {
      const workspace = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackTeamName: 'Test Team',
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
        status: 'active',
      });

      expect(workspace.id).toMatch(/^wsw_/);
      expect(workspace.tenantId).toBe(TEST_TENANT_ID);
      expect(workspace.slackTeamId).toBe(TEST_TEAM_ID);
      expect(workspace.slackTeamName).toBe('Test Team');
      expect(workspace.status).toBe('active');
    });

    it('should find workspace by team ID', async () => {
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
      });

      const found = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID);
      expect(found).not.toBeNull();
      expect(found?.slackTeamId).toBe(TEST_TEAM_ID);
    });

    it('should return null for non-existent workspace', async () => {
      const found = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, 'T_NONEXISTENT');
      expect(found).toBeNull();
    });

    it('should find workspace by Nango connection ID', async () => {
      const connectionId = `T:${TEST_TEAM_ID}`;
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: connectionId,
      });

      const found = await findWorkAppSlackWorkspaceByNangoConnectionId(db)(connectionId);
      expect(found).not.toBeNull();
      expect(found?.nangoConnectionId).toBe(connectionId);
    });

    it('should list workspaces by tenant', async () => {
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
      });
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID_2,
        nangoConnectionId: `T:${TEST_TEAM_ID_2}`,
      });
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID_2,
        slackTeamId: 'T_OTHER',
        nangoConnectionId: 'T:T_OTHER',
      });

      const workspaces = await listWorkAppSlackWorkspacesByTenant(db)(TEST_TENANT_ID);
      expect(workspaces).toHaveLength(2);
    });

    it('should update workspace', async () => {
      const workspace = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
        status: 'active',
      });

      const updated = await updateWorkAppSlackWorkspace(db)(workspace.id, {
        status: 'inactive',
        slackTeamName: 'Updated Name',
      });

      expect(updated?.status).toBe('inactive');
      expect(updated?.slackTeamName).toBe('Updated Name');
    });

    it('should delete workspace by ID', async () => {
      const workspace = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
      });

      const deleted = await deleteWorkAppSlackWorkspace(db)(workspace.id);
      expect(deleted).toBe(true);

      const found = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID);
      expect(found).toBeNull();
    });

    it('should delete workspace by Nango connection ID', async () => {
      const connectionId = `T:${TEST_TEAM_ID}`;
      await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: connectionId,
      });

      const deleted = await deleteWorkAppSlackWorkspaceByNangoConnectionId(db)(connectionId);
      expect(deleted).toBe(true);
    });
  });

  describe('User Mapping CRUD', () => {
    it('should create a user mapping', async () => {
      const mapping = await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
        slackUsername: 'testuser',
        slackEmail: 'test@example.com',
      });

      expect(mapping.id).toMatch(/^wsum_/);
      expect(mapping.slackUserId).toBe(TEST_USER_ID);
      expect(mapping.inkeepUserId).toBe(TEST_INKEEP_USER_ID);
      expect(mapping.clientId).toBe('work-apps-slack');
    });

    it('should find user mapping by tenant and Slack user', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const found = await findWorkAppSlackUserMapping(db)(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_TEAM_ID
      );
      expect(found).not.toBeNull();
      expect(found?.slackUserId).toBe(TEST_USER_ID);
    });

    it('should find user mapping by Slack user only (tenant-agnostic)', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const found = await findWorkAppSlackUserMappingBySlackUser(db)(TEST_USER_ID, TEST_TEAM_ID);
      expect(found).not.toBeNull();
      expect(found?.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should find user mappings by Inkeep user ID', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID_2,
        slackTeamId: TEST_TEAM_ID_2,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const mappings = await findWorkAppSlackUserMappingByInkeepUserId(db)(TEST_INKEEP_USER_ID);
      expect(mappings).toHaveLength(2);
    });

    it('should list user mappings by team', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const mappings = await listWorkAppSlackUserMappingsByTeam(db)(TEST_TENANT_ID, TEST_TEAM_ID);
      expect(mappings).toHaveLength(1);
    });

    it('should delete user mapping', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const deleted = await deleteWorkAppSlackUserMapping(db)(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_TEAM_ID
      );
      expect(deleted).toBe(true);

      const found = await findWorkAppSlackUserMapping(db)(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_TEAM_ID
      );
      expect(found).toBeNull();
    });

    it('should delete all user mappings by team', async () => {
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });
      await createWorkAppSlackUserMapping(db)({
        tenantId: TEST_TENANT_ID,
        slackUserId: TEST_USER_ID_2,
        slackTeamId: TEST_TEAM_ID,
        inkeepUserId: TEST_INKEEP_USER_ID,
      });

      const deleted = await deleteAllWorkAppSlackUserMappingsByTeam(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID
      );
      expect(deleted).toBe(2);
    });
  });

  describe('Channel Agent Config CRUD', () => {
    it('should create a channel agent config', async () => {
      const config = await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        slackChannelName: '#general',
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });

      expect(config.id).toMatch(/^wscac_/);
      expect(config.slackChannelId).toBe(TEST_CHANNEL_ID);
      expect(config.enabled).toBe(true);
    });

    it('should find channel agent config', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });

      const found = await findWorkAppSlackChannelAgentConfig(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID,
        TEST_CHANNEL_ID
      );
      expect(found).not.toBeNull();
      expect(found?.agentId).toBe('agent_456');
    });

    it('should list channel configs by team', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID_2,
        projectId: 'proj_123',
        agentId: 'agent_789',
        enabled: true,
      });

      const configs = await listWorkAppSlackChannelAgentConfigsByTeam(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID
      );
      expect(configs).toHaveLength(2);
    });

    it('should upsert channel config (insert)', async () => {
      const config = await upsertWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });

      expect(config.agentId).toBe('agent_456');
    });

    it('should upsert channel config (update)', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });

      const updated = await upsertWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_789',
        enabled: false,
      });

      expect(updated.agentId).toBe('agent_789');
      expect(updated.enabled).toBe(false);
    });

    it('should delete channel config', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });

      const deleted = await deleteWorkAppSlackChannelAgentConfig(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID,
        TEST_CHANNEL_ID
      );
      expect(deleted).toBe(true);
    });

    it('should delete all channel configs by team', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID_2,
        projectId: 'proj_123',
        agentId: 'agent_789',
        enabled: true,
      });

      const deleted = await deleteAllWorkAppSlackChannelAgentConfigsByTeam(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID
      );
      expect(deleted).toBe(2);
    });

    it('should delete channel configs by agent', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID_2,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID_2,
        slackChannelId: 'C0CC0XWTZLU',
        projectId: 'proj_123',
        agentId: 'agent_789',
        enabled: true,
      });

      const deleted = await deleteWorkAppSlackChannelAgentConfigsByAgent(db)(
        TEST_TENANT_ID,
        'proj_123',
        'agent_456'
      );
      expect(deleted).toBe(2);

      const remaining = await listWorkAppSlackChannelAgentConfigsByTeam(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID_2
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].agentId).toBe('agent_789');
    });

    it('should delete channel configs by project', async () => {
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID,
        projectId: 'proj_123',
        agentId: 'agent_456',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        slackChannelId: TEST_CHANNEL_ID_2,
        projectId: 'proj_123',
        agentId: 'agent_789',
        enabled: true,
      });
      await createWorkAppSlackChannelAgentConfig(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID_2,
        slackChannelId: 'C0CC0XWTZLU',
        projectId: 'proj_456',
        agentId: 'agent_456',
        enabled: true,
      });

      const deleted = await deleteWorkAppSlackChannelAgentConfigsByProject(db)(
        TEST_TENANT_ID,
        'proj_123'
      );
      expect(deleted).toBe(2);

      const remaining = await listWorkAppSlackChannelAgentConfigsByTeam(db)(
        TEST_TENANT_ID,
        TEST_TEAM_ID_2
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].projectId).toBe('proj_456');
    });

    it('should return 0 when no configs match agent', async () => {
      const deleted = await deleteWorkAppSlackChannelAgentConfigsByAgent(db)(
        TEST_TENANT_ID,
        'proj_123',
        'nonexistent_agent'
      );
      expect(deleted).toBe(0);
    });

    it('should return 0 when no configs match project', async () => {
      const deleted = await deleteWorkAppSlackChannelAgentConfigsByProject(db)(
        TEST_TENANT_ID,
        'nonexistent_project'
      );
      expect(deleted).toBe(0);
    });
  });

  describe('Workspace Default Agent', () => {
    it('should update workspace with default agent columns', async () => {
      const workspace = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
        status: 'active',
      });

      const updated = await updateWorkAppSlackWorkspace(db)(workspace.id, {
        defaultAgentId: 'agent_123',
        defaultProjectId: 'proj_456',
        defaultGrantAccessToMembers: false,
      });

      expect(updated?.defaultAgentId).toBe('agent_123');
      expect(updated?.defaultProjectId).toBe('proj_456');
      expect(updated?.defaultGrantAccessToMembers).toBe(false);
    });

    it('should clear default agent columns by setting to null', async () => {
      const workspace = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
        status: 'active',
      });

      await updateWorkAppSlackWorkspace(db)(workspace.id, {
        defaultAgentId: 'agent_123',
        defaultProjectId: 'proj_456',
      });

      const updated = await updateWorkAppSlackWorkspace(db)(workspace.id, {
        defaultAgentId: null,
        defaultProjectId: null,
        defaultGrantAccessToMembers: null,
      });

      expect(updated?.defaultAgentId).toBeNull();
      expect(updated?.defaultProjectId).toBeNull();
      expect(updated?.defaultGrantAccessToMembers).toBeNull();
    });

    it('should clear workspace defaults by agent', async () => {
      const ws1 = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
      });
      const ws2 = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID_2,
        nangoConnectionId: `T:${TEST_TEAM_ID_2}`,
      });

      await updateWorkAppSlackWorkspace(db)(ws1.id, {
        defaultAgentId: 'agent_123',
        defaultProjectId: 'proj_456',
      });
      await updateWorkAppSlackWorkspace(db)(ws2.id, {
        defaultAgentId: 'agent_789',
        defaultProjectId: 'proj_456',
      });

      const cleared = await clearWorkspaceDefaultsByAgent(db)(
        TEST_TENANT_ID,
        'proj_456',
        'agent_123'
      );
      expect(cleared).toBe(1);

      const found1 = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID);
      expect(found1?.defaultAgentId).toBeNull();
      expect(found1?.defaultProjectId).toBeNull();

      const found2 = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID_2);
      expect(found2?.defaultAgentId).toBe('agent_789');
      expect(found2?.defaultProjectId).toBe('proj_456');
    });

    it('should clear workspace defaults by project', async () => {
      const ws1 = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID,
        nangoConnectionId: `T:${TEST_TEAM_ID}`,
      });
      const ws2 = await createWorkAppSlackWorkspace(db)({
        tenantId: TEST_TENANT_ID,
        slackTeamId: TEST_TEAM_ID_2,
        nangoConnectionId: `T:${TEST_TEAM_ID_2}`,
      });

      await updateWorkAppSlackWorkspace(db)(ws1.id, {
        defaultAgentId: 'agent_123',
        defaultProjectId: 'proj_456',
      });
      await updateWorkAppSlackWorkspace(db)(ws2.id, {
        defaultAgentId: 'agent_789',
        defaultProjectId: 'proj_456',
      });

      const cleared = await clearWorkspaceDefaultsByProject(db)(TEST_TENANT_ID, 'proj_456');
      expect(cleared).toBe(2);

      const found1 = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID);
      expect(found1?.defaultAgentId).toBeNull();

      const found2 = await findWorkAppSlackWorkspaceByTeamId(db)(TEST_TENANT_ID, TEST_TEAM_ID_2);
      expect(found2?.defaultAgentId).toBeNull();
    });

    it('should return 0 when no workspaces match agent', async () => {
      const cleared = await clearWorkspaceDefaultsByAgent(db)(
        TEST_TENANT_ID,
        'proj_456',
        'nonexistent_agent'
      );
      expect(cleared).toBe(0);
    });

    it('should return 0 when no workspaces match project', async () => {
      const cleared = await clearWorkspaceDefaultsByProject(db)(
        TEST_TENANT_ID,
        'nonexistent_project'
      );
      expect(cleared).toBe(0);
    });
  });
});
