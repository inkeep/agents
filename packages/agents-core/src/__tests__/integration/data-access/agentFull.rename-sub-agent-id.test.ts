import { and, eq } from 'drizzle-orm';
import { updateFullAgentServerSide } from '../../../data-access/manage/agentFull';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import * as schema from '../../../db/manage/manage-schema';
import { testManageDbClient } from '../../setup';

describe('AgentFull Data Access - rename sub-agent id', () => {
  let db: AgentsManageDatabaseClient;
  const tenantId = 'tenant-rename';
  const projectId = 'project-rename';
  const agentId = 'agent-rename';
  const oldSubAgentId = 'sub-old';
  const newSubAgentId = 'sub-new';
  const toolId = 'tool-mcp';
  const toolRelationId = 'rel-mcp';
  const functionId = 'fn-1';
  const functionToolId = 'fn-tool-1';
  const functionRelationId = 'rel-fn';

  beforeEach(async () => {
    db = testManageDbClient;

    await db
      .insert(schema.projects)
      .values({
        tenantId,
        id: projectId,
        name: 'Project',
        description: 'Project for rename tests',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.agents)
      .values({
        tenantId,
        projectId,
        id: agentId,
        name: 'Agent',
        description: 'Agent for rename tests',
        defaultSubAgentId: oldSubAgentId,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.subAgents)
      .values({
        tenantId,
        projectId,
        agentId,
        id: oldSubAgentId,
        name: 'Old SubAgent',
        description: 'Old sub-agent',
        prompt: 'Old prompt',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.tools)
      .values({
        tenantId,
        projectId,
        id: toolId,
        name: 'MCP Tool',
        description: 'Tool for rename tests',
        config: {
          type: 'mcp',
          mcp: {
            server: {
              url: 'https://example.com',
            },
          },
        },
      })
      .onConflictDoNothing();

    await db
      .insert(schema.functions)
      .values({
        tenantId,
        projectId,
        id: functionId,
        executeCode: 'function test() { return true; }',
        inputSchema: {},
        dependencies: {},
      })
      .onConflictDoNothing();

    await db
      .insert(schema.functionTools)
      .values({
        tenantId,
        projectId,
        agentId,
        id: functionToolId,
        name: 'Function Tool',
        description: 'Function tool for rename tests',
        functionId,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.subAgentToolRelations)
      .values({
        tenantId,
        projectId,
        agentId,
        id: toolRelationId,
        subAgentId: oldSubAgentId,
        toolId,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.subAgentFunctionToolRelations)
      .values({
        tenantId,
        projectId,
        agentId,
        id: functionRelationId,
        subAgentId: oldSubAgentId,
        functionToolId,
      })
      .onConflictDoNothing();
  });

  it('keeps tool relations when sub-agent id changes', async () => {
    const agentData = {
      id: agentId,
      name: 'Agent',
      description: 'Agent for rename tests',
      defaultSubAgentId: newSubAgentId,
      subAgents: {
        [newSubAgentId]: {
          id: newSubAgentId,
          name: 'Renamed SubAgent',
          description: 'Renamed sub-agent',
          prompt: 'New prompt',
          type: 'internal' as const,
          canUse: [
            {
              toolId,
              agentToolRelationId: toolRelationId,
            },
            {
              toolId: functionToolId,
              agentToolRelationId: functionRelationId,
            },
          ],
        },
      },
      functionTools: {
        [functionToolId]: {
          id: functionToolId,
          name: 'Function Tool',
          description: 'Function tool for rename tests',
          functionId,
        },
      },
      functions: {
        [functionId]: {
          id: functionId,
          executeCode: 'function test() { return true; }',
          inputSchema: {},
          dependencies: {},
        },
      },
    };

    await updateFullAgentServerSide(db)({ tenantId, projectId }, agentData);

    const updatedToolRelation = await db.query.subAgentToolRelations.findFirst({
      where: and(
        eq(schema.subAgentToolRelations.tenantId, tenantId),
        eq(schema.subAgentToolRelations.projectId, projectId),
        eq(schema.subAgentToolRelations.agentId, agentId),
        eq(schema.subAgentToolRelations.id, toolRelationId)
      ),
    });

    const updatedFunctionRelation = await db.query.subAgentFunctionToolRelations.findFirst({
      where: and(
        eq(schema.subAgentFunctionToolRelations.tenantId, tenantId),
        eq(schema.subAgentFunctionToolRelations.projectId, projectId),
        eq(schema.subAgentFunctionToolRelations.agentId, agentId),
        eq(schema.subAgentFunctionToolRelations.id, functionRelationId)
      ),
    });

    expect(updatedToolRelation?.subAgentId).toBe(newSubAgentId);
    expect(updatedFunctionRelation?.subAgentId).toBe(newSubAgentId);

    const oldSubAgent = await db.query.subAgents.findFirst({
      where: and(
        eq(schema.subAgents.tenantId, tenantId),
        eq(schema.subAgents.projectId, projectId),
        eq(schema.subAgents.agentId, agentId),
        eq(schema.subAgents.id, oldSubAgentId)
      ),
    });

    const newSubAgent = await db.query.subAgents.findFirst({
      where: and(
        eq(schema.subAgents.tenantId, tenantId),
        eq(schema.subAgents.projectId, projectId),
        eq(schema.subAgents.agentId, agentId),
        eq(schema.subAgents.id, newSubAgentId)
      ),
    });

    expect(oldSubAgent).toBeNull();
    expect(newSubAgent).not.toBeNull();
  });
});
