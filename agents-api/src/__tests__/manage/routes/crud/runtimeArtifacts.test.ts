import { addLedgerArtifacts, createConversation } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import runDbClient from '../../../../data/db/runDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const createTestConversation = async ({
  tenantId,
  projectId,
  userId,
  agentId = 'test-agent',
}: {
  tenantId: string;
  projectId: string;
  userId?: string;
  agentId?: string;
}) => {
  const id = `conv-${crypto.randomUUID()}`;
  return createConversation(runDbClient)({
    id,
    tenantId,
    projectId,
    userId,
    agentId,
    title: 'Test conversation',
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
};

const createTestArtifact = async ({
  tenantId,
  projectId,
  conversationId,
  name,
  artifactId,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  name: string;
  artifactId?: string;
}) => {
  const id = artifactId ?? `artifact-${crypto.randomUUID()}`;
  await addLedgerArtifacts(runDbClient)({
    scopes: { tenantId, projectId },
    contextId: conversationId,
    taskId: `task-${crypto.randomUUID()}`,
    toolCallId: `call-${crypto.randomUUID()}`,
    artifacts: [
      {
        artifactId: id,
        type: 'source',
        name,
        description: `Description for ${name}`,
        parts: [{ kind: 'text' as const, text: `Content of ${name}` }],
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
  });
  return id;
};

describe('Manage API - Runtime Artifacts', () => {
  describe('GET /manage/tenants/:tenantId/projects/:projectId/artifacts', () => {
    it('should list all artifacts in a project', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-list');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'Artifact 1',
      });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'Artifact 2',
      });

      const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/artifacts`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.artifacts).toHaveLength(2);
      expect(body.data.pagination.total).toBe(2);
    });

    it('should filter by conversationId', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-conv-filter');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv1 = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      const conv2 = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv1.id,
        name: 'Conv1 Artifact',
      });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv2.id,
        name: 'Conv2 Artifact',
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/artifacts?conversationId=${conv1.id}`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.artifacts).toHaveLength(1);
      expect(body.data.artifacts[0].name).toBe('Conv1 Artifact');
    });

    it('should filter by userId', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-user-filter');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv1 = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      const conv2 = await createTestConversation({ tenantId, projectId, userId: 'user-2' });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv1.id,
        name: 'User1 Artifact',
      });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv2.id,
        name: 'User2 Artifact',
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/artifacts?userId=user-1`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.artifacts).toHaveLength(1);
      expect(body.data.artifacts[0].name).toBe('User1 Artifact');
    });

    it('should support pagination', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-page');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      for (let i = 0; i < 5; i++) {
        await createTestArtifact({
          tenantId,
          projectId,
          conversationId: conv.id,
          name: `Art ${i}`,
        });
      }

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/artifacts?page=1&limit=2`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.artifacts).toHaveLength(2);
      expect(body.data.pagination.total).toBe(5);
      expect(body.data.pagination.hasMore).toBe(true);
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(2);
    });

    it('should return empty list when no artifacts exist', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/artifacts`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.artifacts).toHaveLength(0);
      expect(body.data.pagination.total).toBe(0);
      expect(body.data.pagination.hasMore).toBe(false);
    });

    it('should not include parts in list response', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-no-parts');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'Art with parts',
      });

      const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/artifacts`);

      expect(res.status).toBe(200);
      const body = await res.json();
      const artifact = body.data.artifacts[0];
      expect(artifact.name).toBe('Art with parts');
      expect(artifact).not.toHaveProperty('parts');
      expect(artifact).not.toHaveProperty('metadata');
    });
  });

  describe('GET /manage/tenants/:tenantId/projects/:projectId/artifacts/{id}', () => {
    it('should return full artifact including parts', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-detail');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, userId: 'user-1' });
      const artifactId = await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'Detail Artifact',
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/artifacts/${artifactId}`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(artifactId);
      expect(body.data.name).toBe('Detail Artifact');
      expect(body.data.description).toBe('Description for Detail Artifact');
      expect(body.data.parts).toBeDefined();
      expect(body.data.parts).toHaveLength(1);
      expect(body.data.parts[0].text).toBe('Content of Detail Artifact');
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 for non-existent artifact', async () => {
      const tenantId = await createTestTenantWithOrg('manage-art-not-found');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/artifacts/nonexistent-id`
      );

      expect(res.status).toBe(404);
    });
  });
});
