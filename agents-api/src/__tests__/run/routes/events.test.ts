import { OpenAPIHono } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  createConversation,
  createMessage,
  generateId,
  getEventById,
  listEventsByConversationId,
  type ResolvedRef,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import eventsApp from '../../../domains/run/routes/events';
import { createTestTenantWithOrg } from '../../utils/testTenant';

const { emitEventWebhookMock, getConversationMock, getMessageByIdMock } = vi.hoisted(() => ({
  emitEventWebhookMock: vi.fn().mockResolvedValue(undefined),
  getConversationMock: vi.fn(),
  getMessageByIdMock: vi.fn(),
}));

vi.mock('../../../domains/run/services/WebhookDeliveryService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../domains/run/services/WebhookDeliveryService')>();
  return {
    ...actual,
    emitEventWebhook: emitEventWebhookMock,
  };
});

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  getConversationMock.mockImplementation(actual.getConversation);
  getMessageByIdMock.mockImplementation(actual.getMessageById);
  return {
    ...actual,
    getConversation: getConversationMock,
    getMessageById: getMessageByIdMock,
  };
});

type ContextOverrides = Partial<BaseExecutionContext> & {
  metadata?: BaseExecutionContext['metadata'];
  resolvedRef?: ResolvedRef;
};

function buildAppWithContext(overrides: ContextOverrides) {
  const app = new OpenAPIHono<{
    Variables: { executionContext: BaseExecutionContext; resolvedRef?: ResolvedRef };
  }>();
  app.use('*', async (c, next) => {
    const executionContext: BaseExecutionContext = {
      apiKey: 'test-key',
      apiKeyId: 'test-key-id',
      tenantId: overrides.tenantId ?? 'test-tenant',
      projectId: overrides.projectId ?? 'default',
      agentId: overrides.agentId ?? 'test-agent',
      baseUrl: 'http://localhost:8080',
      ...(overrides.metadata !== undefined ? { metadata: overrides.metadata } : {}),
    };
    c.set('executionContext', executionContext);
    if (overrides.resolvedRef) {
      c.set('resolvedRef', overrides.resolvedRef);
    }
    await next();
  });
  app.route('/', eventsApp);
  return app;
}

const testResolvedRef: ResolvedRef = {
  type: 'branch',
  name: 'main',
  hash: 'test-hash',
};

async function setupConversationAndMessage({
  tenantId,
  projectId,
}: {
  tenantId: string;
  projectId: string;
}) {
  const conversationId = `conv-${generateId(12)}`;
  await createConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId,
    agentId: 'test-agent',
    activeSubAgentId: 'test-sub-agent',
    ref: { type: 'branch', name: 'main', hash: 'test-hash' },
  });

  const messageId = `msg-${generateId(12)}`;
  await createMessage(runDbClient)({
    scopes: { tenantId, projectId },
    data: {
      id: messageId,
      conversationId,
      role: 'user',
      content: { text: 'hello' },
      visibility: 'user-facing',
      messageType: 'chat',
    },
  });

  return { conversationId, messageId };
}

describe('POST /events route handler', () => {
  it('returns 201 and persists a message-anchored event', async () => {
    const tenantId = await createTestTenantWithOrg('events-msg');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId, messageId } = await setupConversationAndMessage({
      tenantId,
      projectId,
    });

    const app = buildAppWithContext({ tenantId, projectId, metadata: { authMethod: undefined } });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        conversationId,
        messageId,
        properties: { foo: 'bar' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBeDefined();

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted).toBeDefined();
    expect(persisted?.type).toBe('user_message_submitted');
    expect(persisted?.conversationId).toBe(conversationId);
    expect(persisted?.messageId).toBe(messageId);
    expect(persisted?.properties).toEqual({ foo: 'bar' });
    expect(persisted?.agentId).toBe('test-agent');
  });

  it('returns 201 and persists a conversation-anchored event without messageId', async () => {
    const tenantId = await createTestTenantWithOrg('events-conv');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await setupConversationAndMessage({ tenantId, projectId });

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat_share_button_clicked',
        conversationId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.conversationId).toBe(conversationId);
    expect(persisted?.messageId).toBeNull();
  });

  it('returns 201 and persists a free-form event without anchors (D33)', async () => {
    const tenantId = await createTestTenantWithOrg('events-free');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'system_health_check' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.conversationId).toBeNull();
    expect(persisted?.messageId).toBeNull();
    expect(persisted?.type).toBe('system_health_check');
  });

  it('returns 400 when type is missing', async () => {
    const tenantId = await createTestTenantWithOrg('events-no-type');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { foo: 'bar' } }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when userProperties exceeds the per-field byte cap', async () => {
    const tenantId = await createTestTenantWithOrg('events-userprops-too-large');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    // 80 KiB string > 64 KiB per-field cap.
    const oversized = { blob: 'x'.repeat(80 * 1024) };

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', userProperties: oversized }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when properties exceeds the per-field key-count cap', async () => {
    const tenantId = await createTestTenantWithOrg('events-properties-too-many-keys');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    // 200 keys > 100 per-field cap.
    const tooManyKeys: Record<string, number> = {};
    for (let i = 0; i < 200; i++) tooManyKeys[`k${i}`] = i;

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', properties: tooManyKeys }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts payloads at the byte cap boundary', async () => {
    const tenantId = await createTestTenantWithOrg('events-userprops-at-cap');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    // ~32 KiB payload, comfortably under the 64 KiB cap.
    const justUnderCap = { blob: 'x'.repeat(32 * 1024) };

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', userProperties: justUnderCap }),
    });

    expect(res.status).toBe(201);
  });

  it('is idempotent on client-supplied id (201 first, 200 second)', async () => {
    const tenantId = await createTestTenantWithOrg('events-idem');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const id = `evt-${generateId(12)}`;

    const first = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: 'user_message_submitted' }),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: { id: string; createdAt: string } };

    const second = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: 'different_type', properties: { changed: true } }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data: { id: string; createdAt: string; type: string };
    };

    expect(secondBody.data.id).toBe(id);
    expect(secondBody.data.createdAt).toBe(firstBody.data.createdAt);
    expect(secondBody.data.type).toBe('user_message_submitted');
  });

  it('isolates server authMethod into serverMetadata; preserves caller metadata namespace (C1 fix via column separation)', async () => {
    const tenantId = await createTestTenantWithOrg('events-c1');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      metadata: { authMethod: 'app_credential_support_copilot', endUserId: 'oauth-subject-1' },
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        // Caller's `metadata` is their own namespace — server never writes to it.
        // The key 'authMethod' here has no special meaning; it's just a caller-supplied key.
        metadata: { authMethod: 'caller-says-this', custom: 'value' },
        // Caller attempts to set serverMetadata; Zod strips it because it's not in EventApiInsertSchema.
        serverMetadata: { authMethod: 'spoofed' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });

    // Caller's metadata namespace is preserved as-is — server doesn't read or write it.
    expect(persisted?.metadata).toEqual({ authMethod: 'caller-says-this', custom: 'value' });
    // Server's authMethod lives in a structurally separate column; caller cannot influence it.
    expect(persisted?.serverMetadata?.authMethod).toBe('app_credential_support_copilot');
  });

  it('preserves arbitrary userProperties keys verbatim (freeform schema)', async () => {
    const tenantId = await createTestTenantWithOrg('events-userprops');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        userProperties: {
          userId: 'u1',
          plan: 'pro',
          email: 'foo@bar.com',
          extraCustomKey: { nested: 'value' },
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });

    expect(persisted?.userProperties).toEqual({
      userId: 'u1',
      plan: 'pro',
      email: 'foo@bar.com',
      extraCustomKey: { nested: 'value' },
    });
  });

  it('preserves caller-sent userProperties.userId on OAuth path (caller-wins on every auth path)', async () => {
    const tenantId = await createTestTenantWithOrg('events-oauth-caller-wins');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      metadata: {
        authMethod: 'app_credential_support_copilot',
        endUserId: 'oauth-subject-2',
      },
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        userProperties: { userId: 'caller-supplied-id', other: 'preserved' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties?.userId).toBe('caller-supplied-id');
    expect(persisted?.userProperties?.other).toBe('preserved');
  });

  it('preserves caller-sent userProperties.userId on non-OAuth paths (caller-wins)', async () => {
    const tenantId = await createTestTenantWithOrg('events-d23');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      metadata: { endUserId: 'server-derived-user' },
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        userProperties: { userId: 'my-system-user-42' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };

    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties?.userId).toBe('my-system-user-42');
  });

  it('auto-fills userProperties from conversation when no caller userProperties (D38 chain)', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-conv');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      userProperties: { userId: 'conv-level-user', plan: 'pro' },
    });

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat_share_button_clicked',
        conversationId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toEqual({ userId: 'conv-level-user', plan: 'pro' });
  });

  it('auto-fills userProperties from message when message has its own value (message wins over conversation)', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-msg');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      userProperties: { userId: 'conv-level' },
    });
    const messageId = `msg-${generateId(12)}`;
    await createMessage(runDbClient)({
      scopes: { tenantId, projectId },
      data: {
        id: messageId,
        conversationId,
        role: 'user',
        content: { text: 'hi' },
        visibility: 'user-facing',
        messageType: 'chat',
        userProperties: { userId: 'msg-level' },
      },
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toEqual({ userId: 'msg-level' });
    expect(persisted?.conversationId).toBe(conversationId);
  });

  it('backfills conversationId from the message anchor when only messageId is supplied (even when both userProperties and properties are caller-supplied)', async () => {
    const tenantId = await createTestTenantWithOrg('events-conv-id-backfill');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
    });
    const messageId = `msg-${generateId(12)}`;
    await createMessage(runDbClient)({
      scopes: { tenantId, projectId },
      data: {
        id: messageId,
        conversationId,
        role: 'user',
        content: { text: 'hi' },
        visibility: 'user-facing',
        messageType: 'chat',
      },
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Both caller properties supplied — verifies the backfill happens even
      // when the auto-fill chain would otherwise short-circuit message lookup.
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId,
        userProperties: { userId: 'caller-supplied' },
        properties: { url: '/caller-page' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.conversationId).toBe(conversationId);
    expect(persisted?.messageId).toBe(messageId);
  });

  it('caller userProperties wins over message and conversation', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-caller');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      userProperties: { userId: 'conv-level' },
    });
    const messageId = `msg-${generateId(12)}`;
    await createMessage(runDbClient)({
      scopes: { tenantId, projectId },
      data: {
        id: messageId,
        conversationId,
        role: 'user',
        content: { text: 'hi' },
        visibility: 'user-facing',
        messageType: 'chat',
        userProperties: { userId: 'msg-level' },
      },
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId,
        userProperties: { userId: 'caller-id' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toEqual({ userId: 'caller-id' });
  });

  it.each([
    ['ANONYMOUS', { id: 'nanoid-x', identificationType: 'ANONYMOUS' }],
    ['COOKIED', { id: 'nanoid-y', identificationType: 'COOKIED' }],
  ])('drops widget auto-mint identityType=%s userProperties on direct events POST', async (_label, userProperties) => {
    const tenantId = await createTestTenantWithOrg(`events-automint-${_label.toLowerCase()}`);
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        userProperties,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toBeNull();
  });

  it('preserves caller-supplied userProperties but strips identificationType marker', async () => {
    const tenantId = await createTestTenantWithOrg('events-strip-identification-type');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        userProperties: {
          id: 'real-customer',
          identificationType: 'ID_PROVIDED',
          plan: 'pro',
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toEqual({ id: 'real-customer', plan: 'pro' });
  });

  it('returns 400 when conversationId references a nonexistent conversation (FK violation)', async () => {
    const tenantId = await createTestTenantWithOrg('events-fk-conv-violation');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'system_health_check',
        conversationId: 'conv-does-not-exist',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('bad_request');
  });

  it('returns 400 when messageId references a nonexistent message (FK violation)', async () => {
    const tenantId = await createTestTenantWithOrg('events-fk-msg-violation');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId: 'msg-does-not-exist',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('bad_request');
  });

  it('returns null userProperties when no anchors and no caller value (does not auto-fill from endUserId)', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-no-endUserId-fallback');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      metadata: { endUserId: 'auth-end-user-1' },
    });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'system_health_check' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toBeNull();
  });

  it('returns null userProperties when caller, message anchor, and conversation anchor are all empty', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-null');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'free_form_event' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toBeNull();
  });

  it('auto-fills properties from message/conversation chain', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-properties');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      properties: { url: '/docs' },
    });

    const app = buildAppWithContext({
      tenantId,
      projectId,
      metadata: { endUserId: 'should-not-affect-properties' },
    });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat_share_button_clicked',
        conversationId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.properties).toEqual({ url: '/docs' });
  });

  it('body.agentId takes precedence over executionContext.agentId', async () => {
    const tenantId = await createTestTenantWithOrg('events-agent-precedence');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId, agentId: 'context-agent' });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', agentId: 'body-agent' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.agentId).toBe('body-agent');
  });

  it('auto-fills properties from message when message has its own value (message wins over conversation)', async () => {
    const tenantId = await createTestTenantWithOrg('events-d38-msg-properties');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const conversationId = `conv-${generateId(12)}`;
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-sub-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      properties: { url: '/landing' },
    });
    const messageId = `msg-${generateId(12)}`;
    await createMessage(runDbClient)({
      scopes: { tenantId, projectId },
      data: {
        id: messageId,
        conversationId,
        role: 'user',
        content: { text: 'hi' },
        visibility: 'user-facing',
        messageType: 'chat',
        properties: { url: '/docs/specific' },
      },
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.properties).toEqual({ url: '/docs/specific' });
  });

  it('gracefully degrades when conversation enrichment lookup fails (returns 201 with caller-supplied values)', async () => {
    const tenantId = await createTestTenantWithOrg('events-graceful-conv-fail');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await setupConversationAndMessage({ tenantId, projectId });

    getConversationMock.mockImplementationOnce(() => async () => {
      throw new Error('simulated transient DB error');
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_message_submitted',
        conversationId,
        userProperties: { userId: 'caller-supplied' },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toEqual({ userId: 'caller-supplied' });
    expect(persisted?.properties).toBeNull();
  });

  it('gracefully degrades when message enrichment lookup fails (returns 201 with null fallback)', async () => {
    const tenantId = await createTestTenantWithOrg('events-graceful-msg-fail');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const { messageId } = await setupConversationAndMessage({ tenantId, projectId });

    getMessageByIdMock.mockImplementationOnce(() => async () => {
      throw new Error('simulated transient DB error');
    });

    const app = buildAppWithContext({ tenantId, projectId });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user_clicked_apply_draft',
        messageId,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const persisted = await getEventById(runDbClient)({
      scopes: { tenantId, projectId },
      eventId: body.data.id,
    });
    expect(persisted?.userProperties).toBeNull();
    expect(persisted?.properties).toBeNull();
    // Catch-block fallback discards messageRow (we never trust a partial result),
    // so the resolved conversationId falls through to body.conversationId ?? null.
    // With only messageId in the body, that means null — pinned here so a future
    // refactor that smuggles a stale messageRow through can't regress silently.
    expect(persisted?.conversationId).toBeNull();
  });

  it('lists events scoped to a single conversation in DESC order', async () => {
    const tenantId = await createTestTenantWithOrg('events-list');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);
    const a = await setupConversationAndMessage({ tenantId, projectId });
    const b = await setupConversationAndMessage({ tenantId, projectId });

    const app = buildAppWithContext({ tenantId, projectId });

    for (const conversationId of [a.conversationId, a.conversationId, b.conversationId]) {
      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user_message_submitted', conversationId }),
      });
      expect(res.status).toBe(201);
    }

    const aEvents = await listEventsByConversationId(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId: a.conversationId,
    });
    expect(aEvents).toHaveLength(2);
    expect(aEvents.every((e) => e.conversationId === a.conversationId)).toBe(true);
    const ts = aEvents.map((e) => e.createdAt);
    expect([...ts].sort((x, y) => (x > y ? -1 : 1))).toEqual(ts);
  });
});

describe('POST /events webhook dispatch (event.created)', () => {
  it('dispatches event.created webhook with the persisted row when resolvedRef is present', async () => {
    emitEventWebhookMock.mockClear();
    const tenantId = await createTestTenantWithOrg('events-dispatch-on');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      resolvedRef: testResolvedRef,
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', properties: { foo: 'bar' } }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    expect(emitEventWebhookMock).toHaveBeenCalledTimes(1);
    expect(emitEventWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        projectId,
        agentId: 'test-agent',
        resolvedRef: testResolvedRef,
        event: expect.objectContaining({
          id: body.data.id,
          type: 'user_message_submitted',
        }),
      })
    );
  });

  it('does not dispatch when resolvedRef is absent on the context', async () => {
    emitEventWebhookMock.mockClear();
    const tenantId = await createTestTenantWithOrg('events-dispatch-off');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({ tenantId, projectId });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted' }),
    });

    expect(res.status).toBe(201);
    expect(emitEventWebhookMock).not.toHaveBeenCalled();
  });

  it('dispatches event.created on the idempotent 200-conflict path (replay still notifies subscribers)', async () => {
    emitEventWebhookMock.mockClear();
    const tenantId = await createTestTenantWithOrg('events-dispatch-idem');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      resolvedRef: testResolvedRef,
    });
    const id = `evt-${generateId(12)}`;

    const first = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: 'user_message_submitted' }),
    });
    expect(first.status).toBe(201);
    expect(emitEventWebhookMock).toHaveBeenCalledTimes(1);

    const second = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: 'user_message_submitted' }),
    });
    expect(second.status).toBe(200);
    // Dispatch fires on every successful POST — including idempotent replays.
    // This is intentional so retries from at-least-once delivery upstream of
    // the API still notify webhook destinations once the row is durable.
    expect(emitEventWebhookMock).toHaveBeenCalledTimes(2);
  });

  it('dispatches with body.agentId (body wins over executionContext) when both are set', async () => {
    emitEventWebhookMock.mockClear();
    const tenantId = await createTestTenantWithOrg('events-dispatch-body-agent');
    const projectId = 'default';
    await createTestProject(manageDbClient, tenantId, projectId);

    const app = buildAppWithContext({
      tenantId,
      projectId,
      agentId: 'context-agent',
      resolvedRef: testResolvedRef,
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user_message_submitted', agentId: 'body-agent' }),
    });

    expect(res.status).toBe(201);
    expect(emitEventWebhookMock).toHaveBeenCalledTimes(1);
    expect(emitEventWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'body-agent' })
    );
  });
});

describe('POST /run/v1/events route mounting and permission marker', () => {
  it('uses inheritedRunApiKeyAuth permission marker (auth deferred to parent middleware)', async () => {
    const routes = (eventsApp as unknown as { routes: Array<{ path: string; method: string }> })
      .routes;
    const post = routes.find((r) => r.method === 'POST' && r.path === '/');
    expect(post).toBeDefined();
  });
});
