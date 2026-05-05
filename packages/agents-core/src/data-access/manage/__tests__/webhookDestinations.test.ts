import { describe, expect, it } from 'vitest';
import { testManageDbClient } from '../../../__tests__/setup';
import { agents } from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import {
  createWebhookDestination,
  deleteWebhookDestination,
  getWebhookDestinationAgentIds,
  getWebhookDestinationById,
  listWebhookDestinationsForEvent,
  listWebhookDestinationsPaginated,
  setWebhookDestinationAgentIds,
  updateWebhookDestination,
} from '../webhookDestinations';

const tenantId = 'tenant-webhook-dest';
const projectId = 'project-1';

async function ensureProject(currentTenantId = tenantId, currentProjectId = projectId) {
  await createTestProject(testManageDbClient, currentTenantId, currentProjectId);
}

async function insertWebhookDestination(
  id: string,
  overrides: {
    tenantId?: string;
    projectId?: string;
    enabled?: boolean;
    eventTypes?: string[];
    url?: string;
  } = {}
) {
  const tid = overrides.tenantId ?? tenantId;
  const pid = overrides.projectId ?? projectId;

  await ensureProject(tid, pid);

  return createWebhookDestination(testManageDbClient)({
    id,
    tenantId: tid,
    projectId: pid,
    name: `Webhook ${id}`,
    description: null,
    enabled: overrides.enabled ?? true,
    url: overrides.url ?? `https://example.com/webhook/${id}`,
    eventTypes: overrides.eventTypes ?? ['conversation.created', 'conversation.updated'],
  });
}

async function ensureAgent(agentId: string, tid = tenantId, pid = projectId) {
  await ensureProject(tid, pid);
  await testManageDbClient
    .insert(agents)
    .values({ tenantId: tid, projectId: pid, id: agentId, name: `Agent ${agentId}` })
    .onConflictDoNothing();
}

describe('webhookDestinations DAL', () => {
  describe('createWebhookDestination', () => {
    it('creates and returns a webhook destination', async () => {
      const dest = await insertWebhookDestination('wh-create-1');

      expect(dest.id).toBe('wh-create-1');
      expect(dest.tenantId).toBe(tenantId);
      expect(dest.projectId).toBe(projectId);
      expect(dest.name).toBe('Webhook wh-create-1');
      expect(dest.url).toBe('https://example.com/webhook/wh-create-1');
      expect(dest.eventTypes).toEqual(['conversation.created', 'conversation.updated']);
      expect(dest.enabled).toBe(true);
      expect(dest.createdAt).toBeDefined();
      expect(dest.updatedAt).toBeDefined();
    });
  });

  describe('getWebhookDestinationById', () => {
    it('returns the webhook destination by id', async () => {
      await insertWebhookDestination('wh-get-1');

      const found = await getWebhookDestinationById(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-get-1',
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe('wh-get-1');
      expect(found?.url).toBe('https://example.com/webhook/wh-get-1');
    });

    it('returns undefined for non-existent id', async () => {
      await ensureProject();

      const found = await getWebhookDestinationById(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'non-existent',
      });

      expect(found).toBeUndefined();
    });

    it('does not return destinations from other projects', async () => {
      await insertWebhookDestination('wh-isolation-1', { projectId: 'project-other' });

      const found = await getWebhookDestinationById(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-isolation-1',
      });

      expect(found).toBeUndefined();
    });
  });

  describe('listWebhookDestinationsPaginated', () => {
    it('lists destinations with pagination', async () => {
      await insertWebhookDestination('wh-list-1');
      await insertWebhookDestination('wh-list-2');
      await insertWebhookDestination('wh-list-3');

      const result = await listWebhookDestinationsPaginated(testManageDbClient)({
        scopes: { tenantId, projectId },
        pagination: { page: 1, limit: 2 },
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.pages).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
    });

    it('returns empty data when no destinations exist', async () => {
      await ensureProject('tenant-empty', 'project-empty');

      const result = await listWebhookDestinationsPaginated(testManageDbClient)({
        scopes: { tenantId: 'tenant-empty', projectId: 'project-empty' },
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    it('respects page 2', async () => {
      await insertWebhookDestination('wh-page-1');
      await insertWebhookDestination('wh-page-2');
      await insertWebhookDestination('wh-page-3');

      const result = await listWebhookDestinationsPaginated(testManageDbClient)({
        scopes: { tenantId, projectId },
        pagination: { page: 2, limit: 2 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(2);
    });
  });

  describe('listWebhookDestinationsForEvent', () => {
    it('returns destinations subscribed to the event type', async () => {
      await insertWebhookDestination('wh-event-1', {
        eventTypes: ['conversation.created'],
      });
      await insertWebhookDestination('wh-event-2', {
        eventTypes: ['conversation.created'],
      });

      const dests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'agent-1',
      });

      expect(dests).toHaveLength(2);
      const ids = dests.map((d) => d.id).sort();
      expect(ids).toEqual(['wh-event-1', 'wh-event-2']);
    });

    it('excludes disabled destinations', async () => {
      await insertWebhookDestination('wh-disabled-1', {
        eventTypes: ['conversation.updated'],
        enabled: false,
      });
      await insertWebhookDestination('wh-enabled-1', {
        eventTypes: ['conversation.updated'],
        enabled: true,
      });

      const dests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.updated',
        agentId: 'agent-1',
      });

      expect(dests).toHaveLength(1);
      expect(dests[0].id).toBe('wh-enabled-1');
    });

    it('returns empty array when no destinations exist', async () => {
      const dests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'agent-1',
      });

      expect(dests).toHaveLength(0);
    });

    it('returns destinations subscribed to conversation.created only', async () => {
      await insertWebhookDestination('wh-created-only', {
        eventTypes: ['conversation.created'],
      });

      const createdDests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'agent-1',
      });
      expect(createdDests).toHaveLength(1);
      expect(createdDests[0].id).toBe('wh-created-only');

      const updatedDests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.updated',
        agentId: 'agent-1',
      });
      expect(updatedDests).toHaveLength(0);
    });
  });

  describe('updateWebhookDestination', () => {
    it('updates name and url', async () => {
      await insertWebhookDestination('wh-update-1');

      const updated = await updateWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-update-1',
        data: { name: 'Updated Name', url: 'https://new-url.com/hook' },
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.url).toBe('https://new-url.com/hook');
    });

    it('updates enabled flag', async () => {
      await insertWebhookDestination('wh-toggle-1', { enabled: true });

      const updated = await updateWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-toggle-1',
        data: { enabled: false },
      });

      expect(updated?.enabled).toBe(false);
    });

    it('updates eventTypes', async () => {
      await insertWebhookDestination('wh-events-upd', {
        eventTypes: ['conversation.created'],
      });

      const updated = await updateWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-events-upd',
        data: { eventTypes: ['conversation.created', 'conversation.updated'] },
      });

      expect(updated?.eventTypes).toEqual(['conversation.created', 'conversation.updated']);
    });

    it('returns undefined for non-existent destination', async () => {
      await ensureProject();

      const updated = await updateWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'non-existent',
        data: { name: 'Ghost' },
      });

      expect(updated).toBeUndefined();
    });
  });

  describe('deleteWebhookDestination', () => {
    it('deletes a webhook destination', async () => {
      await insertWebhookDestination('wh-delete-1');

      await deleteWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-delete-1',
      });

      const found = await getWebhookDestinationById(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-delete-1',
      });

      expect(found).toBeUndefined();
    });

    it('returns false when deleting non-existent destination', async () => {
      await ensureProject();

      await expect(
        deleteWebhookDestination(testManageDbClient)({
          scopes: { tenantId, projectId },
          webhookDestinationId: 'non-existent',
        })
      ).resolves.toBe(false);
    });

    it('returns true when deleting an existing destination', async () => {
      await insertWebhookDestination('wh-delete-returns-true');

      const result = await deleteWebhookDestination(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-delete-returns-true',
      });

      expect(result).toBe(true);
    });
  });

  describe('webhook destination agent scoping', () => {
    it('returns destination for any agent when no agent filter is set', async () => {
      await insertWebhookDestination('wh-all-agents', {
        eventTypes: ['conversation.created'],
      });

      const dests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'any-agent-id',
      });

      expect(dests).toHaveLength(1);
      expect(dests[0].id).toBe('wh-all-agents');
    });

    it('filters destinations by agent when agent filter is set', async () => {
      await insertWebhookDestination('wh-scoped', {
        eventTypes: ['conversation.created'],
      });

      await ensureAgent('agent-a');
      await ensureAgent('agent-b');
      await setWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-scoped',
        agentIds: ['agent-a', 'agent-b'],
      });

      const matchedDests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'agent-a',
      });
      expect(matchedDests).toHaveLength(1);

      const unmatchedDests = await listWebhookDestinationsForEvent(testManageDbClient)({
        scopes: { tenantId, projectId },
        eventType: 'conversation.created',
        agentId: 'agent-c',
      });
      expect(unmatchedDests).toHaveLength(0);
    });

    it('get and set agent ids round-trip', async () => {
      await insertWebhookDestination('wh-roundtrip-agents');

      const initial = await getWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-roundtrip-agents',
      });
      expect(initial).toEqual([]);

      await ensureAgent('agent-x');
      await ensureAgent('agent-y');
      await setWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-roundtrip-agents',
        agentIds: ['agent-x', 'agent-y'],
      });

      const afterSet = await getWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-roundtrip-agents',
      });
      expect(afterSet.sort()).toEqual(['agent-x', 'agent-y']);

      await setWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-roundtrip-agents',
        agentIds: [],
      });

      const afterClear = await getWebhookDestinationAgentIds(testManageDbClient)({
        scopes: { tenantId, projectId },
        webhookDestinationId: 'wh-roundtrip-agents',
      });
      expect(afterClear).toEqual([]);
    });
  });
});
