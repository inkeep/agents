import {
  addLedgerArtifacts,
  agents,
  conversations,
  generateId,
  getLedgerArtifacts,
  ledgerArtifacts as ledgerArtifactsTable,
  subAgents,
  tasks,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient';

/**
 * Integration tests for the ledger artifact helper functions.
 *
 * These tests validate that artifacts can be written to and read back from
 * the ledger using the addLedgerArtifacts and getLedgerArtifacts helpers.
 *
 * The in-memory test database is initialised once globally via __tests__/setup.ts.
 */

describe('Ledger Artifacts – Data Layer', () => {
  const projectId = 'default';

  // Helper function to create required parent records
  async function createTestData(contextId: string, taskId: string, tenantId: string) {
    const subAgentId = `agent-${generateId()}`;
    const conversationId = contextId;

    // Ensure project exists for this tenant
    await createTestProject(dbClient, tenantId, projectId);

    // Create agent first
    const agentId = 'test-agent';
    await dbClient.insert(agents).values({
      id: agentId,
      tenantId,
      projectId,
      name: 'Test Agent',
      defaultSubAgentId: subAgentId,
    });

    // Create agent with agentId
    await dbClient.insert(subAgents).values({
      id: subAgentId,
      tenantId,
      projectId,
      agentId: agentId,
      name: 'Test Agent',
      description: 'Test agent for ledger artifacts',
      prompt: 'Test instructions',
    });

    // Create conversation
    await dbClient.insert(conversations).values({
      id: conversationId,
      tenantId,
      projectId,
      activeSubAgentId: subAgentId,
      title: 'Test Conversation',
    });

    // Create task
    await dbClient.insert(tasks).values({
      id: taskId,
      tenantId,
      projectId,
      agentId: agentId,
      contextId,
      status: 'completed',
      subAgentId,
      metadata: {
        conversation_id: conversationId,
        message_id: `msg-${generateId()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  // Ensure a clean database between individual tests.
  afterEach(async () => {
    await dbClient.delete(ledgerArtifactsTable);
    await dbClient.delete(tasks);
    await dbClient.delete(conversations);
    await dbClient.delete(subAgents);
  });

  // Extra safety – clear again when the suite finishes.
  afterAll(async () => {
    await dbClient.delete(ledgerArtifactsTable);
    await dbClient.delete(tasks);
    await dbClient.delete(conversations);
    await dbClient.delete(subAgents);
  });

  it('should persist and retrieve artifacts by taskId', async () => {
    const contextId = `ctx-${generateId()}`;
    const taskId = `task-${generateId()}`;
    const tenantId = `tenant-${generateId()}`;

    // Create required parent records
    await createTestData(contextId, taskId, tenantId);

    const artifacts = [
      {
        artifactId: generateId(),
        name: 'Artifact One',
        description: 'First test artifact',
        parts: [
          {
            kind: 'text' as const,
            text: 'Hello World',
          },
        ],
        taskId,
        metadata: { foo: 'bar' },
      },
      {
        artifactId: generateId(),
        name: 'Artifact Two',
        description: 'Second test artifact',
        parts: [
          {
            kind: 'text' as const,
            text: 'Lorem Ipsum',
          },
        ],
        taskId,
        metadata: { baz: 'qux' },
      },
    ];

    // Insert the two artifacts
    await addLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      contextId,
      taskId,
      artifacts,
    });

    // Retrieve by taskId
    const fetched = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      taskId,
    });
    expect(fetched).toHaveLength(2);

    // Make sure we get the same artifacts back (order not guaranteed)
    const fetchedIds = fetched.map((a) => a.artifactId).sort();
    const originalIds = artifacts.map((a) => a.artifactId).sort();
    expect(fetchedIds).toEqual(originalIds);
  });

  it('should retrieve a single artifact by artifactId', async () => {
    const contextId = `ctx-${generateId()}`;
    const taskId = `task-${generateId()}`;
    const tenantId = `tenant-${generateId()}`;

    // Create required parent records
    await createTestData(contextId, taskId, tenantId);

    const artifact = {
      artifactId: generateId(),
      name: 'Solo Artifact',
      description: 'A lone artifact',
      parts: [
        {
          kind: 'text' as const,
          text: 'Single',
        },
      ],
      taskId,
    };

    await addLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      contextId,
      taskId,
      artifacts: [artifact],
    });

    const fetched = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      taskId,
      artifactId: artifact.artifactId,
    });
    expect(fetched).toHaveLength(1);
    expect(fetched[0].artifactId).toBe(artifact.artifactId);
    expect(fetched[0].name).toBe(artifact.name);
    expect(fetched[0].description).toBe(artifact.description);
  });

  it('should handle empty artifact arrays gracefully', async () => {
    const contextId = `ctx-${generateId()}`;
    const taskId = `task-${generateId()}`;
    const tenantId = `tenant-${generateId()}`;

    // Create required parent records
    await createTestData(contextId, taskId, tenantId);

    await expect(
      addLedgerArtifacts(dbClient)({
        scopes: { tenantId, projectId },
        contextId,
        taskId,
        artifacts: [],
      })
    ).resolves.not.toThrow();

    // Table should still be empty
    const fetched = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      taskId,
    }).catch(() => []);
    expect(fetched).toHaveLength(0);
  });

  it('should throw when neither taskId nor artifactId is provided', async () => {
    // Intentionally passing an invalid param to trigger validation error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await expect(getLedgerArtifacts(dbClient)({} as any)).rejects.toThrow(
      'At least one of taskId, toolCallId, or artifactId must be provided'
    );
  });

  it('should handle missing artifacts gracefully', async () => {
    const contextId = `ctx-${generateId()}`;
    const taskId = `task-${generateId()}`;
    const tenantId = `tenant-${generateId()}`;

    // Create required parent records
    await createTestData(contextId, taskId, tenantId);

    // Try to get non-existent artifact
    const result = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId, projectId },
      artifactId: 'non-existent-id',
    });

    expect(result).toHaveLength(0);
  });

  it('should enforce tenant isolation', async () => {
    const tenant1Id = `tenant1-${generateId()}`;
    const tenant2Id = `tenant2-${generateId()}`;
    const sharedContextId = `shared-ctx-${generateId()}`;
    const sharedTaskId = `shared-task-${generateId()}`;

    // Create test data for both tenants with unique conversation IDs
    await createTestData(`${sharedContextId}-1`, `${sharedTaskId}-1`, tenant1Id);
    await createTestData(`${sharedContextId}-2`, `${sharedTaskId}-2`, tenant2Id);

    // Create artifacts for tenant 1
    await addLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant1Id, projectId },
      contextId: `${sharedContextId}-1`,
      taskId: `${sharedTaskId}-1`,
      artifacts: [
        {
          artifactId: 'tenant1-artifact',
          name: 'Tenant 1 Data',
          description: 'Sensitive tenant 1 data',
          parts: [
            {
              kind: 'data' as const,
              data: { secret: 'tenant1-secret' },
            },
          ],
        },
      ],
    });

    // Create artifacts for tenant 2
    await addLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant2Id, projectId },
      contextId: `${sharedContextId}-2`,
      taskId: `${sharedTaskId}-2`,
      artifacts: [
        {
          artifactId: 'tenant2-artifact',
          name: 'Tenant 2 Data',
          description: 'Sensitive tenant 2 data',
          parts: [
            {
              kind: 'data' as const,
              data: { secret: 'tenant2-secret' },
            },
          ],
        },
      ],
    });

    // Tenant 1 should not access tenant 2's artifacts
    const crossTenantResults = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant1Id, projectId },
      artifactId: 'tenant2-artifact',
    });

    expect(crossTenantResults).toHaveLength(0);

    // Tenant 2 should not access tenant 1's artifacts
    const crossTenantResults2 = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant2Id, projectId },
      artifactId: 'tenant1-artifact',
    });

    expect(crossTenantResults2).toHaveLength(0);

    // Each tenant should only see their own artifacts
    const tenant1Results = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant1Id, projectId },
      taskId: `${sharedTaskId}-1`,
    });
    expect(tenant1Results).toHaveLength(1);
    expect(tenant1Results[0].artifactId).toBe('tenant1-artifact');

    const tenant2Results = await getLedgerArtifacts(dbClient)({
      scopes: { tenantId: tenant2Id, projectId },
      taskId: `${sharedTaskId}-2`,
    });
    expect(tenant2Results).toHaveLength(1);
    expect(tenant2Results[0].artifactId).toBe('tenant2-artifact');
  });
});
