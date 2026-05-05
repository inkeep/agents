import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pendingDeferred: Promise<unknown>[] = [];

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    getConversation: vi.fn(),
    getConversationHistory: vi.fn(),
    getProjectMainResolvedRef: vi.fn(),
    // Mirror Vercel's waitUntil: capture the fire-and-forget promise so tests can await it.
    getWaitUntil: vi.fn(() =>
      Promise.resolve((p: Promise<unknown>) => {
        pendingDeferred.push(p);
      })
    ),
    listWebhookDestinationsForEvent: vi.fn(),
    withRef: vi.fn(),
  };
});

async function flushDeferred(): Promise<void> {
  while (pendingDeferred.length > 0) {
    const next = pendingDeferred.shift();
    if (next) await next;
  }
}

vi.mock('workflow/api', () => ({
  start: vi.fn(),
}));

vi.mock('../../../../data/db', () => ({
  manageDbClient: 'mock-manage-client',
  manageDbPool: 'mock-manage-pool',
}));

vi.mock('../../../../logger', () => createMockLoggerModule().module);

import {
  getConversation,
  getConversationHistory,
  getProjectMainResolvedRef,
  listWebhookDestinationsForEvent,
  withRef,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import {
  emitConversationWebhook,
  emitFeedbackWebhook,
  emitWebhookEvent,
} from '../WebhookDeliveryService';

const mockWithRef = withRef as ReturnType<typeof vi.fn>;
const mockListForEvent = listWebhookDestinationsForEvent as ReturnType<typeof vi.fn>;
const mockStart = start as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockGetConversationHistory = getConversationHistory as ReturnType<typeof vi.fn>;
const mockGetResolvedRef = getProjectMainResolvedRef as ReturnType<typeof vi.fn>;

const baseParams = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  resolvedRef: { type: 'branch' as const, name: 'tenant-1_project-1_main', hash: 'abc123' },
  eventType: 'conversation.created' as const,
  data: { conversationId: 'conv-1', userId: null },
};

describe('WebhookDeliveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
  });

  describe('emitWebhookEvent', () => {
    it('does nothing when no destinations match', async () => {
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve([]));

      await emitWebhookEvent(baseParams);

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts a workflow for each matching destination', async () => {
      const destinations = [
        { id: 'dest-1', url: 'https://hook1.example.com' },
        { id: 'dest-2', url: 'https://hook2.example.com' },
      ];

      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve(destinations));

      await emitWebhookEvent(baseParams);

      expect(mockStart).toHaveBeenCalledTimes(2);

      expect(mockStart).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          destinationUrl: 'https://hook1.example.com',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
          webhookDestinationId: 'dest-1',
          payload: expect.objectContaining({
            type: 'conversation.created',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            agentId: 'agent-1',
            data: { conversationId: 'conv-1', userId: null },
          }),
        }),
      ]);
    });

    it('continues dispatching when one workflow start fails', async () => {
      const destinations = [
        { id: 'dest-ok', url: 'https://ok.com' },
        { id: 'dest-fail', url: 'https://fail.com' },
      ];

      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve(destinations));

      mockStart
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Queue unavailable'));

      await emitWebhookEvent(baseParams);

      expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('handles error when querying destinations fails', async () => {
      mockWithRef.mockRejectedValue(new Error('DB connection failed'));

      await emitWebhookEvent(baseParams);

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('passes resolvedRef to withRef', async () => {
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve([]));

      await emitWebhookEvent(baseParams);

      expect(mockWithRef).toHaveBeenCalledWith(
        'mock-manage-pool',
        baseParams.resolvedRef,
        expect.any(Function)
      );
    });
  });

  describe('emitConversationWebhook', () => {
    const conversation = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      userId: 'user-1',
      agentId: 'agent-1',
      activeSubAgentId: 'sub-1',
      ref: null,
      title: null,
      lastContextResolution: null,
      metadata: { userContext: { email: 'u@x.com' } },
      createdAt: '2026-05-05T10:00:00.000Z',
      updatedAt: '2026-05-05T10:00:01.000Z',
    };

    const message = {
      id: 'msg-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      conversationId: 'conv-1',
      role: 'user',
      content: { text: 'hello' },
      visibility: 'user-facing',
      messageType: 'chat',
      metadata: null,
      createdAt: '2026-05-05T10:00:00.500Z',
      updatedAt: '2026-05-05T10:00:00.500Z',
    };

    const params = {
      runDbClient: 'mock-run-db' as any,
      tenantId: 'tenant-1',
      projectId: 'project-1',
      agentId: 'agent-1',
      conversationId: 'conv-1',
      resolvedRef: { type: 'branch' as const, name: 'tenant-1_project-1_main', hash: 'abc' },
      eventType: 'conversation.created' as const,
    };

    beforeEach(() => {
      pendingDeferred.length = 0;
      mockGetConversation.mockReturnValue(() => Promise.resolve(conversation));
      mockGetConversationHistory.mockReturnValue(() => Promise.resolve([message]));
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => fn('mock-db'));
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hook.example.com' }])
      );
    });

    it('fetches conversation + history and dispatches with the canonical shape', async () => {
      await emitConversationWebhook(params);
      await flushDeferred();

      expect(mockGetConversation).toHaveBeenCalledWith('mock-run-db');
      expect(mockGetConversationHistory).toHaveBeenCalledWith('mock-run-db');
      expect(mockStart).toHaveBeenCalledTimes(1);

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      expect(dispatchedPayload.payload).toMatchObject({
        type: 'conversation.created',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        data: {
          conversation: {
            id: 'conv-1',
            agentId: 'agent-1',
            title: null,
            userProperties: { email: 'u@x.com' },
            properties: null,
            createdAt: '2026-05-05T10:00:00.000Z',
            updatedAt: '2026-05-05T10:00:01.000Z',
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                content: 'hello',
                createdAt: '2026-05-05T10:00:00.500Z',
              },
            ],
          },
        },
      });
    });

    it('skips dispatch when conversation row is not found', async () => {
      mockGetConversation.mockReturnValue(() => Promise.resolve(undefined));

      await emitConversationWebhook(params);
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('caps history fetch at the message limit', async () => {
      const historyFn = vi.fn(() => Promise.resolve([message]));
      mockGetConversationHistory.mockReturnValue(historyFn);

      await emitConversationWebhook(params);
      await flushDeferred();

      expect(historyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ limit: 200 }),
        })
      );
    });

    it('swallows errors and does not throw', async () => {
      mockGetConversation.mockReturnValue(() => Promise.reject(new Error('DB down')));

      await expect(emitConversationWebhook(params)).resolves.toBeUndefined();
      await expect(flushDeferred()).resolves.toBeUndefined();
    });
  });

  describe('emitFeedbackWebhook', () => {
    const conversation = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      userId: 'user-1',
      agentId: 'agent-derived',
      activeSubAgentId: 'sub-1',
      ref: null,
      title: null,
      lastContextResolution: null,
      metadata: null,
      createdAt: '2026-05-05T10:00:00.000Z',
      updatedAt: '2026-05-05T10:00:01.000Z',
    };

    const feedback = {
      id: 'fb-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      type: 'positive',
      details: 'Good answer',
      createdAt: '2026-05-05T11:00:00.000Z',
      updatedAt: '2026-05-05T11:00:00.000Z',
    } as const;

    beforeEach(() => {
      pendingDeferred.length = 0;
      mockGetConversation.mockReturnValue(() => Promise.resolve(conversation));
      mockGetConversationHistory.mockReturnValue(() => Promise.resolve([]));
      mockGetResolvedRef.mockReturnValue(() =>
        Promise.resolve({ type: 'branch', name: 'tenant-1_project-1_main', hash: 'abc' })
      );
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => fn('mock-db'));
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hook.example.com' }])
      );
    });

    it('emits feedback.created with both feedback and conversation blocks', async () => {
      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'caller-agent',
        feedback: feedback as any,
      });
      await flushDeferred();

      expect(mockStart).toHaveBeenCalledTimes(1);
      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      expect(dispatchedPayload.payload).toMatchObject({
        type: 'feedback.created',
        agentId: 'caller-agent',
        data: {
          feedback: {
            id: 'fb-1',
            type: 'positive',
            details: 'Good answer',
            messageId: 'msg-1',
            createdAt: '2026-05-05T11:00:00.000Z',
            updatedAt: '2026-05-05T11:00:00.000Z',
          },
          conversation: expect.objectContaining({ id: 'conv-1' }),
        },
      });
    });

    it('strips tenantId/projectId from the feedback object', async () => {
      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        feedback: feedback as any,
      });
      await flushDeferred();

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      const wireFeedback = dispatchedPayload.payload.data.feedback;
      expect(wireFeedback).not.toHaveProperty('tenantId');
      expect(wireFeedback).not.toHaveProperty('projectId');
    });

    it('derives agentId from conversation when caller does not pass one (fixes M1)', async () => {
      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        feedback: feedback as any,
      });
      await flushDeferred();

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      expect(dispatchedPayload.payload.agentId).toBe('agent-derived');
    });

    it('falls back to empty string when neither caller agentId nor conversation agentId are set', async () => {
      mockGetConversation.mockReturnValue(() =>
        Promise.resolve({ ...conversation, agentId: null })
      );

      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        feedback: feedback as any,
      });
      await flushDeferred();

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      expect(dispatchedPayload.payload.agentId).toBe('');
    });

    it('skips dispatch when conversation row is not found', async () => {
      mockGetConversation.mockReturnValue(() => Promise.resolve(undefined));

      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        feedback: feedback as any,
      });
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });
  });
});
