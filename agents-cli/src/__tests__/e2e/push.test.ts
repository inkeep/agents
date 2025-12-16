import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createTestOrganization } from '@inkeep/agents-core/db/test-client';
import type { DatabaseClient } from '@inkeep/agents-core/db/client';
import { createDatabaseClient } from '@inkeep/agents-core/db/client';
import { projects, agents, subAgents, tools, subAgentToolRelations } from '@inkeep/agents-core/db/schema';
import { pushCommand } from '../../commands/push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * This test is a E2E test for the push command.
 * Important: have your management API running locally for this test to pass.
 * It tests the push command by pushing a project (in the src/projects/slack-digest directory) to the database and verifying the data is saved correctly.
 * 
 * At the end of the test, it deletes the project and all related records from the database.
 */
describe('Push Command - E2E Test', () => {
  let db: DatabaseClient;
  const tenantId = 'default';
  const projectDir = join(__dirname, 'src', 'projects', 'slack-digest');
  let mockExit: any;

  beforeAll(async () => {
    // Create connection to real database using DATABASE_URL env var
    db = createDatabaseClient();
    
    // Create organization (still useful for test data)
    await createTestOrganization(db, tenantId);
  
    // Mock process.exit
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);
  });

  afterAll(async () => {
    // Cleanup slack-digest project and all related records
    try {
      // Delete in order respecting foreign key constraints (children first)
      
      // 1. Delete sub-agent tool relations
      await db.delete(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, tenantId),
            eq(subAgentToolRelations.projectId, 'slack-digest')
          )
        );
      
      // 2. Delete sub-agents
      await db.delete(subAgents)
        .where(
          and(
            eq(subAgents.tenantId, tenantId),
            eq(subAgents.projectId, 'slack-digest')
          )
        );
      
      // 3. Delete agents
      await db.delete(agents)
        .where(
          and(
            eq(agents.tenantId, tenantId),
            eq(agents.projectId, 'slack-digest')
          )
        );
      
      // 4. Delete tools
      await db.delete(tools)
        .where(
          and(
            eq(tools.tenantId, tenantId),
            eq(tools.projectId, 'slack-digest')
          )
        );
      
      // 5. Delete project
      await db.delete(projects)
        .where(
          and(
            eq(projects.tenantId, tenantId),
            eq(projects.id, 'slack-digest')
          )
        );
    } catch (error) {
      console.error('Error cleaning up slack-digest project:', error);
    }
        
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
    
    // Restore mocks
    vi.restoreAllMocks();
  });

  it('should push project and save all data correctly to database', async () => {
    // Execute push command
    await pushCommand({
      project: projectDir,
      config: join(__dirname, 'src', 'projects', 'inkeep.config.ts'),
    });

    expect(mockExit).toHaveBeenCalledWith(0); 

    // Verify project was created
    const projectRecords = await db
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.id, 'slack-digest')));

    expect(projectRecords).toHaveLength(1);
    const project = projectRecords[0];
    expect(project.name).toBe('Slack Digest');
    expect(project.description).toBe('Slack Digest project template');
    expect(project.models).toEqual({
      base: { model: 'anthropic/claude-sonnet-4-5' },
      structuredOutput: { model: 'anthropic/claude-sonnet-4-5' },
      summarizer: { model: 'anthropic/claude-sonnet-4-5' },
    });

    // Verify agent was created
    const agentRecords = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, tenantId),
          eq(agents.projectId, 'slack-digest'),
          eq(agents.id, 'slack-digest')
        )
      );

    expect(agentRecords).toHaveLength(1);
    const agent = agentRecords[0];
    expect(agent.name).toBe('Slack Digest');
    expect(agent.description).toBe('Takes a Notion page, summarizes it, and sends the summary via Slack');
    expect(agent.defaultSubAgentId).toBe('slack-digest');

    // Verify sub-agent was created
    const subAgentRecords = await db
      .select()
      .from(subAgents)
      .where(
        and(
          eq(subAgents.tenantId, tenantId),
          eq(subAgents.projectId, 'slack-digest'),
          eq(subAgents.agentId, 'slack-digest'),
          eq(subAgents.id, 'slack-digest')
        )
      );

    expect(subAgentRecords).toHaveLength(1);
    const subAgent = subAgentRecords[0];
    expect(subAgent.name).toBe('Slack Digest');
    expect(subAgent.description).toBe('Takes a Notion page, summarizes it, and sends the summary via Slack!');
    expect(subAgent.prompt).toContain('You are a helpful assistant');
    expect(subAgent.prompt).toContain('processes Notion pages and shares summaries via Slack');

    // Verify tool was created
    const toolRecords = await db
      .select()
      .from(tools)
      .where(
        and(
          eq(tools.tenantId, tenantId),
          eq(tools.projectId, 'slack-digest'),
          eq(tools.id, 'slack-mcp')
        )
      );

    expect(toolRecords).toHaveLength(1);
    const tool = toolRecords[0];
    expect(tool.name).toBe('Slack');
    expect(tool.config).toHaveProperty('type', 'mcp');
    expect(tool.config.mcp.server.url).toBe('http://localhost:3006/slack/mcp');

    // Verify sub-agent tool relation was created
    const toolRelationRecords = await db
      .select()
      .from(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, tenantId),
          eq(subAgentToolRelations.projectId, 'slack-digest'),
          eq(subAgentToolRelations.agentId, 'slack-digest'),
          eq(subAgentToolRelations.subAgentId, 'slack-digest'),
          eq(subAgentToolRelations.toolId, 'slack-mcp')
        )
      );

    expect(toolRelationRecords).toHaveLength(1);
  });

  it('should update existing project when pushed again', async () => {
    // Push twice
    await pushCommand({
      project: projectDir,
      config: join(__dirname, 'src', 'projects', 'inkeep.config.ts'),
    });

    // Verify only one project record exists
    const projectRecords = await db
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.id, 'slack-digest')));

    expect(projectRecords).toHaveLength(1);

    // Verify only one agent record exists
    const agentRecords = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, tenantId),
          eq(agents.projectId, 'slack-digest'),
          eq(agents.id, 'slack-digest')
        )
      );

    expect(agentRecords).toHaveLength(1);
  });

  it('should verify all database constraints are satisfied', async () => {
    // This test ensures that foreign key constraints are satisfied
    // by attempting to query with joins

    const result = await db
      .select({
        project: projects,
        agent: agents,
        subAgent: subAgents,
        tool: tools,
      })
      .from(projects)
      .leftJoin(agents, and(
        eq(agents.tenantId, projects.tenantId),
        eq(agents.projectId, projects.id)
      ))
      .leftJoin(subAgents, and(
        eq(subAgents.tenantId, agents.tenantId),
        eq(subAgents.projectId, agents.projectId),
        eq(subAgents.agentId, agents.id)
      ))
      .leftJoin(tools, and(
        eq(tools.tenantId, projects.tenantId),
        eq(tools.projectId, projects.id)
      ))
      .where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, 'slack-digest')
      ));

    expect(result.length).toBeGreaterThan(0);
    
    // Verify all relationships are properly linked
    for (const row of result) {
      if (row.agent) {
        expect(row.agent.tenantId).toBe(row.project.tenantId);
        expect(row.agent.projectId).toBe(row.project.id);
      }
      
      if (row.subAgent) {
        expect(row.subAgent.tenantId).toBe(row.agent?.tenantId);
        expect(row.subAgent.projectId).toBe(row.agent?.projectId);
        expect(row.subAgent.agentId).toBe(row.agent?.id);
      }
      
      if (row.tool) {
        expect(row.tool.tenantId).toBe(row.project.tenantId);
        expect(row.tool.projectId).toBe(row.project.id);
      }
    }
  });
});