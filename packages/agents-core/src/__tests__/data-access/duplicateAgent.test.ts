import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAgent,
  duplicateAgent,
  getAgentById,
  getFullAgentDefinition,
} from '../../data-access/manage/agents';
import { listFunctionTools } from '../../data-access/manage/functionTools';
import { listSubAgents } from '../../data-access/manage/subAgents';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents,
  artifactComponents,
  contextConfigs,
  dataComponents,
  externalAgents,
  functions,
  functionTools,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentExternalAgentRelations,
  subAgentFunctionToolRelations,
  subAgentRelations,
  subAgents,
  subAgentTeamAgentRelations,
  subAgentToolRelations,
  tools,
} from '../../db/manage/manage-schema';
import { generateId } from '../../utils/conversations';
import { testManageDbClient } from '../setup';

describe('duplicateAgent', () => {
  let db: AgentsManageDatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'source-agent';
  const newAgentId = 'duplicate-agent';

  beforeEach(async () => {
    db = testManageDbClient;

    await db.insert(projects).values({
      tenantId: testTenantId,
      id: testProjectId,
      name: 'Test Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.insert(agents).values({
      tenantId: testTenantId,
      projectId: testProjectId,
      id: testAgentId,
      name: 'Original Agent',
      description: 'Original description',
      defaultSubAgentId: 'sub-agent-1',
      prompt: 'Original prompt',
      models: {
        base: { model: 'claude-3-5-sonnet-20241022' },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.insert(subAgents).values([
      {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'First sub agent',
        prompt: 'Sub agent 1 prompt',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'sub-agent-2',
        name: 'Sub Agent 2',
        description: 'Second sub agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  describe('basic agent duplication', () => {
    it('should duplicate agent with new ID and name', async () => {
      const result = await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      expect(result.id).toBe(newAgentId);
      expect(result.name).toBe('Original Agent (Copy)');
      expect(result.description).toBe('Original description');
      expect(result.prompt).toBe('Original prompt');
      expect(result.models).toEqual({
        base: { model: 'claude-3-5-sonnet-20241022' },
      });
    });

    it('should duplicate agent with custom name', async () => {
      const customName = 'Custom Duplicate Name';
      const result = await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: customName,
      });

      expect(result.name).toBe(customName);
    });

    it('should throw error if source agent not found', async () => {
      await expect(
        duplicateAgent(db)({
          scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: 'non-existent' },
          newAgentId,
          newAgentName: 'Does Not Matter',
        })
      ).rejects.toThrow('Source agent non-existent not found');
    });
  });

  describe('sub-agent duplication', () => {
    it('should copy all sub-agents with original IDs', async () => {
      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedSubAgents = await listSubAgents(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });

      expect(duplicatedSubAgents).toHaveLength(2);
      expect(duplicatedSubAgents.map((sa) => sa.id)).toEqual(['sub-agent-1', 'sub-agent-2']);
      expect(duplicatedSubAgents[0]?.name).toBe('Sub Agent 1');
      expect(duplicatedSubAgents[0]?.description).toBe('First sub agent');
      expect(duplicatedSubAgents[0]?.prompt).toBe('Sub agent 1 prompt');
    });
  });

  describe('function tools duplication', () => {
    it('should copy function tools with new IDs and duplicate underlying functions', async () => {
      await db.insert(functions).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'func-1',
        executeCode: 'return { result: "test" };',
        inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
        dependencies: { lodash: '^4.17.21' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(functionTools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-tool-1',
        name: 'Test Function Tool',
        description: 'Test function description',
        functionId: 'func-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedFunctionTools = await listFunctionTools(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });

      expect(duplicatedFunctionTools.data).toHaveLength(1);
      expect(duplicatedFunctionTools.data[0]?.id).not.toBe('func-tool-1');
      expect(duplicatedFunctionTools.data[0]?.name).toBe('Test Function Tool');
      expect(duplicatedFunctionTools.data[0]?.functionId).not.toBe('func-1');

      const allFunctions = await db
        .select()
        .from(functions)
        .where(and(eq(functions.tenantId, testTenantId), eq(functions.projectId, testProjectId)));

      expect(allFunctions).toHaveLength(2);

      const originalFunction = allFunctions.find((f) => f.id === 'func-1');
      const duplicatedFunction = allFunctions.find(
        (f) => f.id === duplicatedFunctionTools.data[0]?.functionId
      );

      expect(originalFunction).toBeDefined();
      expect(duplicatedFunction).toBeDefined();
      expect(duplicatedFunction?.executeCode).toBe(originalFunction?.executeCode);
      expect(duplicatedFunction?.inputSchema).toEqual(originalFunction?.inputSchema);
      expect(duplicatedFunction?.dependencies).toEqual(originalFunction?.dependencies);
    });

    it('should ensure modifying duplicated function does not affect original', async () => {
      await db.insert(functions).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'func-original',
        executeCode: 'return { original: true };',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(functionTools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-tool-original',
        name: 'Original Function Tool',
        description: 'Original description',
        functionId: 'func-original',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedFunctionTools = await listFunctionTools(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });

      const duplicatedFunctionId = duplicatedFunctionTools.data[0]?.functionId;
      expect(duplicatedFunctionId).toBeDefined();
      expect(duplicatedFunctionId).not.toBe('func-original');

      await db
        .update(functions)
        .set({
          executeCode: 'return { modified: true };',
          inputSchema: { type: 'object', properties: { modified: { type: 'boolean' } } },
        })
        .where(
          and(
            eq(functions.tenantId, testTenantId),
            eq(functions.projectId, testProjectId),
            eq(functions.id, duplicatedFunctionId!)
          )
        );

      const originalFunction = await db.query.functions.findFirst({
        where: and(
          eq(functions.tenantId, testTenantId),
          eq(functions.projectId, testProjectId),
          eq(functions.id, 'func-original')
        ),
      });

      expect(originalFunction?.executeCode).toBe('return { original: true };');
      expect(originalFunction?.inputSchema).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
    });
  });

  describe('context config duplication', () => {
    it('should copy context configs', async () => {
      await db.insert(contextConfigs).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'context-1',
        headersSchema: { type: 'object', properties: {} },
        contextVariables: {
          var1: {
            id: 'var1',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://example.com',
              method: 'GET',
            },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedContextConfigs = await db.query.contextConfigs.findMany({
        where: (contextConfigs, { eq, and }) =>
          and(
            eq(contextConfigs.tenantId, testTenantId),
            eq(contextConfigs.projectId, testProjectId),
            eq(contextConfigs.agentId, newAgentId)
          ),
      });

      expect(duplicatedContextConfigs).toHaveLength(1);
      expect(duplicatedContextConfigs[0]?.id).toBe('context-1');
      expect(duplicatedContextConfigs[0]?.contextVariables).toEqual({
        var1: {
          id: 'var1',
          trigger: 'initialization',
          fetchConfig: {
            url: 'https://example.com',
            method: 'GET',
          },
        },
      });
    });
  });

  describe('sub-agent relations duplication', () => {
    it('should copy sub-agent relations', async () => {
      await db.insert(subAgentRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'relation-1',
        sourceSubAgentId: 'sub-agent-1',
        targetSubAgentId: 'sub-agent-2',
        relationType: 'transfer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentRelations.findMany({
        where: (subAgentRelations, { eq, and }) =>
          and(
            eq(subAgentRelations.tenantId, testTenantId),
            eq(subAgentRelations.projectId, testProjectId),
            eq(subAgentRelations.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.id).not.toBe('relation-1');
      expect(duplicatedRelations[0]?.sourceSubAgentId).toBe('sub-agent-1');
      expect(duplicatedRelations[0]?.targetSubAgentId).toBe('sub-agent-2');
      expect(duplicatedRelations[0]?.relationType).toBe('transfer');
    });
  });

  describe('sub-agent tool relations duplication', () => {
    it('should copy sub-agent tool relations', async () => {
      await db.insert(tools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'tool-1',
        name: 'Test Tool',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://example.com' },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentToolRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'tool-rel-1',
        subAgentId: 'sub-agent-1',
        toolId: 'tool-1',
        selectedTools: ['tool-a', 'tool-b'],
        headers: { 'X-Custom': 'value' },
        toolPolicies: { 'tool-a': { needsApproval: true } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentToolRelations.findMany({
        where: (subAgentToolRelations, { eq, and }) =>
          and(
            eq(subAgentToolRelations.tenantId, testTenantId),
            eq(subAgentToolRelations.projectId, testProjectId),
            eq(subAgentToolRelations.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.toolId).toBe('tool-1');
      expect(duplicatedRelations[0]?.selectedTools).toEqual(['tool-a', 'tool-b']);
      expect(duplicatedRelations[0]?.headers).toEqual({ 'X-Custom': 'value' });
    });
  });

  describe('sub-agent function tool relations duplication', () => {
    it('should copy sub-agent function tool relations with remapped IDs', async () => {
      await db.insert(functions).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'func-1',
        executeCode: 'return { result: "test" };',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(functionTools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-tool-1',
        name: 'Test Function Tool',
        functionId: 'func-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentFunctionToolRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-rel-1',
        subAgentId: 'sub-agent-1',
        functionToolId: 'func-tool-1',
        toolPolicies: { 'tool-a': { needsApproval: false } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentFunctionToolRelations.findMany({
        where: (subAgentFunctionToolRelations, { eq, and }) =>
          and(
            eq(subAgentFunctionToolRelations.tenantId, testTenantId),
            eq(subAgentFunctionToolRelations.projectId, testProjectId),
            eq(subAgentFunctionToolRelations.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.functionToolId).not.toBe('func-tool-1');
      expect(duplicatedRelations[0]?.toolPolicies).toEqual({ 'tool-a': { needsApproval: false } });
    });
  });

  describe('sub-agent external agent relations duplication', () => {
    it('should copy sub-agent external agent relations', async () => {
      await db.insert(externalAgents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'external-1',
        name: 'External Agent',
        baseUrl: 'https://example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentExternalAgentRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'ext-rel-1',
        subAgentId: 'sub-agent-1',
        externalAgentId: 'external-1',
        headers: { Authorization: 'Bearer token' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentExternalAgentRelations.findMany({
        where: (subAgentExternalAgentRelations, { eq, and }) =>
          and(
            eq(subAgentExternalAgentRelations.tenantId, testTenantId),
            eq(subAgentExternalAgentRelations.projectId, testProjectId),
            eq(subAgentExternalAgentRelations.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.externalAgentId).toBe('external-1');
      expect(duplicatedRelations[0]?.headers).toEqual({ Authorization: 'Bearer token' });
    });
  });

  describe('sub-agent team agent relations duplication', () => {
    it('should copy sub-agent team agent relations', async () => {
      await db.insert(agents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'team-agent-1',
        name: 'Team Agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentTeamAgentRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'team-rel-1',
        subAgentId: 'sub-agent-1',
        targetAgentId: 'team-agent-1',
        headers: { 'X-Team': 'alpha' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentTeamAgentRelations.findMany({
        where: (subAgentTeamAgentRelations, { eq, and }) =>
          and(
            eq(subAgentTeamAgentRelations.tenantId, testTenantId),
            eq(subAgentTeamAgentRelations.projectId, testProjectId),
            eq(subAgentTeamAgentRelations.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.targetAgentId).toBe('team-agent-1');
      expect(duplicatedRelations[0]?.headers).toEqual({ 'X-Team': 'alpha' });
    });
  });

  describe('data component relations duplication', () => {
    it('should copy sub-agent data component relations', async () => {
      await db.insert(dataComponents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'data-comp-1',
        name: 'Data Component',
        props: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentDataComponents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'data-rel-1',
        subAgentId: 'sub-agent-1',
        dataComponentId: 'data-comp-1',
        createdAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentDataComponents.findMany({
        where: (subAgentDataComponents, { eq, and }) =>
          and(
            eq(subAgentDataComponents.tenantId, testTenantId),
            eq(subAgentDataComponents.projectId, testProjectId),
            eq(subAgentDataComponents.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.dataComponentId).toBe('data-comp-1');
    });
  });

  describe('artifact component relations duplication', () => {
    it('should copy sub-agent artifact component relations', async () => {
      await db.insert(artifactComponents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'artifact-comp-1',
        name: 'Artifact Component',
        props: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentArtifactComponents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'artifact-rel-1',
        subAgentId: 'sub-agent-1',
        artifactComponentId: 'artifact-comp-1',
        createdAt: new Date().toISOString(),
      });

      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      const duplicatedRelations = await db.query.subAgentArtifactComponents.findMany({
        where: (subAgentArtifactComponents, { eq, and }) =>
          and(
            eq(subAgentArtifactComponents.tenantId, testTenantId),
            eq(subAgentArtifactComponents.projectId, testProjectId),
            eq(subAgentArtifactComponents.agentId, newAgentId)
          ),
      });

      expect(duplicatedRelations).toHaveLength(1);
      expect(duplicatedRelations[0]?.artifactComponentId).toBe('artifact-comp-1');
    });
  });

  describe('comprehensive duplication', () => {
    it('should duplicate agent with all relationships', async () => {
      await db.insert(functions).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'func-1',
        executeCode: 'return { result: "test" };',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(functionTools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-tool-1',
        name: 'Function Tool',
        functionId: 'func-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(tools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'tool-1',
        name: 'Test Tool',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://example.com' },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(contextConfigs).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'context-1',
        headersSchema: {},
        contextVariables: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'relation-1',
        sourceSubAgentId: 'sub-agent-1',
        targetSubAgentId: 'sub-agent-2',
        relationType: 'delegate',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentToolRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'tool-rel-1',
        subAgentId: 'sub-agent-1',
        toolId: 'tool-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.insert(subAgentFunctionToolRelations).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: 'func-rel-1',
        subAgentId: 'sub-agent-1',
        functionToolId: 'func-tool-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        newAgentId,
        newAgentName: 'Original Agent (Copy)',
      });

      expect(result.id).toBe(newAgentId);

      const duplicatedAgent = await getAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });
      expect(duplicatedAgent).not.toBeNull();

      const duplicatedSubAgents = await listSubAgents(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });
      expect(duplicatedSubAgents).toHaveLength(2);

      const duplicatedFunctionTools = await listFunctionTools(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });
      expect(duplicatedFunctionTools.data).toHaveLength(1);

      const duplicatedContextConfigs = await db.query.contextConfigs.findMany({
        where: (contextConfigs, { eq, and }) =>
          and(
            eq(contextConfigs.tenantId, testTenantId),
            eq(contextConfigs.projectId, testProjectId),
            eq(contextConfigs.agentId, newAgentId)
          ),
      });
      expect(duplicatedContextConfigs).toHaveLength(1);

      const duplicatedSubAgentRelations = await db.query.subAgentRelations.findMany({
        where: (subAgentRelations, { eq, and }) =>
          and(
            eq(subAgentRelations.tenantId, testTenantId),
            eq(subAgentRelations.projectId, testProjectId),
            eq(subAgentRelations.agentId, newAgentId)
          ),
      });
      expect(duplicatedSubAgentRelations).toHaveLength(1);

      const duplicatedToolRelations = await db.query.subAgentToolRelations.findMany({
        where: (subAgentToolRelations, { eq, and }) =>
          and(
            eq(subAgentToolRelations.tenantId, testTenantId),
            eq(subAgentToolRelations.projectId, testProjectId),
            eq(subAgentToolRelations.agentId, newAgentId)
          ),
      });
      expect(duplicatedToolRelations).toHaveLength(1);

      const duplicatedFunctionToolRelations = await db.query.subAgentFunctionToolRelations.findMany(
        {
          where: (subAgentFunctionToolRelations, { eq, and }) =>
            and(
              eq(subAgentFunctionToolRelations.tenantId, testTenantId),
              eq(subAgentFunctionToolRelations.projectId, testProjectId),
              eq(subAgentFunctionToolRelations.agentId, newAgentId)
            ),
        }
      );
      expect(duplicatedFunctionToolRelations).toHaveLength(1);
    });

    it('should not cause cross-contamination of data/artifact components between original and duplicated agents', async () => {
      // Create data component
      await db.insert(dataComponents).values({
        id: 'test-data-component',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Data Component',
        description: 'Test',
        props: {},
        render: { component: 'test', mockData: {} },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create artifact component
      await db.insert(artifactComponents).values({
        id: 'test-artifact-component',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Artifact Component',
        description: 'Test',
        props: {},
        render: { component: 'test', mockData: {} },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create agent with sub-agent
      const sourceAgentId = 'test-agent-components';
      await createAgent(db)({
        id: sourceAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'Test agent',
        defaultSubAgentId: 'sub-agent-1',
      });

      await db.insert(subAgents).values({
        id: 'sub-agent-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: sourceAgentId,
        name: 'Sub Agent 1',
        description: 'Test sub agent',
        prompt: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Associate data component with sub-agent
      await db.insert(subAgentDataComponents).values({
        id: generateId(),
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: sourceAgentId,
        subAgentId: 'sub-agent-1',
        dataComponentId: 'test-data-component',
        createdAt: new Date().toISOString(),
      });

      // Associate artifact component with sub-agent
      await db.insert(subAgentArtifactComponents).values({
        id: generateId(),
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: sourceAgentId,
        subAgentId: 'sub-agent-1',
        artifactComponentId: 'test-artifact-component',
        createdAt: new Date().toISOString(),
      });

      // Duplicate the agent
      const newAgentId = 'test-agent-components-copy';
      await duplicateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: sourceAgentId },
        newAgentId,
        newAgentName: 'Test Agent (Copy)',
      });

      // Get full definitions for both agents
      const originalAgentFull = await getFullAgentDefinition(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: sourceAgentId },
      });

      const duplicatedAgentFull = await getFullAgentDefinition(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: newAgentId },
      });

      // Verify original agent has exactly 1 of each component (not duplicated)
      expect(originalAgentFull?.subAgents['sub-agent-1'].dataComponents).toHaveLength(1);
      expect(originalAgentFull?.subAgents['sub-agent-1'].artifactComponents).toHaveLength(1);
      expect(originalAgentFull?.subAgents['sub-agent-1'].dataComponents).toEqual([
        'test-data-component',
      ]);
      expect(originalAgentFull?.subAgents['sub-agent-1'].artifactComponents).toEqual([
        'test-artifact-component',
      ]);

      // Verify duplicated agent has exactly 1 of each component (not duplicated)
      expect(duplicatedAgentFull?.subAgents['sub-agent-1'].dataComponents).toHaveLength(1);
      expect(duplicatedAgentFull?.subAgents['sub-agent-1'].artifactComponents).toHaveLength(1);
      expect(duplicatedAgentFull?.subAgents['sub-agent-1'].dataComponents).toEqual([
        'test-data-component',
      ]);
      expect(duplicatedAgentFull?.subAgents['sub-agent-1'].artifactComponents).toEqual([
        'test-artifact-component',
      ]);

      // Verify database has exactly 2 relations total (1 for each agent)
      const allDataComponentRelations = await db.query.subAgentDataComponents.findMany({
        where: (subAgentDataComponents, { eq, and }) =>
          and(
            eq(subAgentDataComponents.tenantId, testTenantId),
            eq(subAgentDataComponents.projectId, testProjectId),
            eq(subAgentDataComponents.subAgentId, 'sub-agent-1')
          ),
      });
      expect(allDataComponentRelations).toHaveLength(2); // One for each agent

      const allArtifactComponentRelations = await db.query.subAgentArtifactComponents.findMany({
        where: (subAgentArtifactComponents, { eq, and }) =>
          and(
            eq(subAgentArtifactComponents.tenantId, testTenantId),
            eq(subAgentArtifactComponents.projectId, testProjectId),
            eq(subAgentArtifactComponents.subAgentId, 'sub-agent-1')
          ),
      });
      expect(allArtifactComponentRelations).toHaveLength(2); // One for each agent
    });
  });
});
