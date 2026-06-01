import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pendingDeferred: Promise<unknown>[] = [];

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    getConversation: vi.fn(),
    getConversationHistory: vi.fn(),
    getEvaluationRunById: vi.fn(),
    getProjectMainResolvedRef: vi.fn(),
    evaluatePassCriteria: actual.evaluatePassCriteria,
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
  getEvaluationRunById,
  getProjectMainResolvedRef,
  listWebhookDestinationsForEvent,
  withRef,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import {
  buildSlackPayload,
  buildTestSlackPayload,
  isSlackIncomingWebhookUrl,
} from '../slackBlockKit';
import {
  emitConversationWebhook,
  emitEvaluationFailedWebhook,
  emitFeedbackWebhook,
  emitWebhookEvent,
  emitWebhookEventFireAndForget,
} from '../WebhookDeliveryService';

const mockWithRef = withRef as ReturnType<typeof vi.fn>;
const mockListForEvent = listWebhookDestinationsForEvent as ReturnType<typeof vi.fn>;
const mockStart = start as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockGetConversationHistory = getConversationHistory as ReturnType<typeof vi.fn>;
const mockGetResolvedRef = getProjectMainResolvedRef as ReturnType<typeof vi.fn>;
const mockGetEvaluationRunById = getEvaluationRunById as ReturnType<typeof vi.fn>;

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
        { id: 'dest-1', url: 'https://hook1.example.com', headers: null },
        { id: 'dest-2', url: 'https://hook2.example.com', headers: null },
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

    it('includes dest.headers in dispatched payload', async () => {
      const destinations = [
        {
          id: 'dest-with-headers',
          url: 'https://hook.example.com',
          headers: { 'X-Api-Key': 'secret', Authorization: 'Bearer tok' },
        },
      ];

      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve(destinations));

      await emitWebhookEvent(baseParams);

      expect(mockStart).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          headers: { 'X-Api-Key': 'secret', Authorization: 'Bearer tok' },
          webhookDestinationId: 'dest-with-headers',
        }),
      ]);
    });

    it('passes null headers when destination has no custom headers', async () => {
      const destinations = [
        { id: 'dest-no-headers', url: 'https://hook.example.com', headers: null },
      ];

      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => {
        return fn('mock-db');
      });
      mockListForEvent.mockReturnValue(() => Promise.resolve(destinations));

      await emitWebhookEvent(baseParams);

      expect(mockStart).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          headers: null,
          webhookDestinationId: 'dest-no-headers',
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
      metadata: null,
      userProperties: { email: 'u@x.com' },
      properties: null,
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
        agentId: 'caller-agent',
        feedback: feedback as any,
      });
      await flushDeferred();

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      const wireFeedback = dispatchedPayload.payload.data.feedback;
      expect(wireFeedback).not.toHaveProperty('tenantId');
      expect(wireFeedback).not.toHaveProperty('projectId');
    });

    it('uses the provided agentId in the envelope', async () => {
      await emitFeedbackWebhook({
        runDbClient: 'mock-run-db' as any,
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'explicit-agent',
        feedback: feedback as any,
      });
      await flushDeferred();

      const dispatchedPayload = mockStart.mock.calls[0][1][0];
      expect(dispatchedPayload.payload.agentId).toBe('explicit-agent');
    });

    it('derives agentId from conversation when caller does not pass one', async () => {
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

  describe('emitEvaluationFailedWebhook', () => {
    const evalResult = {
      id: 'eval-result-1',
      evaluatorId: 'evaluator-1',
      conversationId: 'conv-1',
      evaluationRunId: 'run-1',
    };

    const resolvedRef = { type: 'branch' as const, name: 'tenant-1_project-1_main', hash: 'abc' };

    const failedScoreConditions = [{ field: 'score', operator: '>=', value: 0.7, actual: 0.3 }];

    const baseEvalParams = {
      runDbClient: 'mock-run-db' as any,
      tenantId: 'tenant-1',
      projectId: 'project-1',
      agentId: 'agent-1',
      evaluationResult: evalResult,
      evaluator: { id: 'evaluator-1', name: 'Quality Check' },
      resolvedRef,
    };

    beforeEach(() => {
      pendingDeferred.length = 0;
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => fn('mock-db'));
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hooks.slack.com/services/T/B/x' }])
      );
      mockGetEvaluationRunById.mockReturnValue(() => Promise.resolve(null));
    });

    it('emits evaluation.failed with Block Kit payload when criteria fails', async () => {
      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      expect(mockStart).toHaveBeenCalledTimes(1);
      const deliveryPayload = mockStart.mock.calls[0][1][0];
      const slackPayload = deliveryPayload.payload;
      expect(slackPayload.text).toContain('Evaluation failed');
      expect(slackPayload.text).toContain('Quality Check');
      expect(slackPayload.blocks).toBeDefined();
      expect(slackPayload.blocks).toHaveLength(6);
      expect(slackPayload.data.failedConditions).toEqual([
        { field: 'score', operator: '>=', value: 0.7, actual: 0.3 },
      ]);
    });

    it('does not leak slackMeta fields into Slack payload', async () => {
      mockGetEvaluationRunById.mockReturnValue(() =>
        Promise.resolve({
          id: 'run-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          evaluationRunConfigId: 'run-config-abc',
          evaluationJobConfigId: null,
        })
      );

      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      const slackPayload = mockStart.mock.calls[0][1][0].payload;
      expect(slackPayload).not.toHaveProperty('evaluationRunConfigId');
      expect(slackPayload).not.toHaveProperty('evaluationJobConfigId');
      expect(slackPayload).not.toHaveProperty('_evaluationRunConfigId');
      expect(slackPayload).not.toHaveProperty('_evaluationJobConfigId');
    });

    it('links to run-configs page for continuous evaluations', async () => {
      mockGetEvaluationRunById.mockReturnValue(() =>
        Promise.resolve({
          id: 'run-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          evaluationRunConfigId: 'run-config-abc',
          evaluationJobConfigId: null,
        })
      );

      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      const slackPayload = mockStart.mock.calls[0][1][0].payload;
      const linksBlock = slackPayload.blocks[4];
      expect(linksBlock.type).toBe('section');
      expect(linksBlock.text.text).toContain(
        'http://localhost:3000/tenant-1/projects/project-1/evaluations/run-configs/run-config-abc'
      );
      expect(linksBlock.text.text).toContain('View Evaluation');
    });

    it('links to jobs page for non-continuous evaluations', async () => {
      mockGetEvaluationRunById.mockReturnValue(() =>
        Promise.resolve({
          id: 'run-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          evaluationRunConfigId: null,
          evaluationJobConfigId: 'job-config-xyz',
        })
      );

      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      const slackPayload = mockStart.mock.calls[0][1][0].payload;
      const linksBlock = slackPayload.blocks[4];
      expect(linksBlock.type).toBe('section');
      expect(linksBlock.text.text).toContain(
        'http://localhost:3000/tenant-1/projects/project-1/evaluations/jobs/job-config-xyz'
      );
      expect(linksBlock.text.text).toContain('View Evaluation');
    });

    it('sends structured data without text/blocks to non-Slack destinations', async () => {
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hook.example.com', headers: null }])
      );

      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      const payload = mockStart.mock.calls[0][1][0].payload;
      expect(payload.type).toBe('evaluation.failed');
      expect(payload.data.evaluator.name).toBe('Quality Check');
      expect(payload.data.conversation.id).toBe('conv-1');
      expect(payload.data.failedConditions).toBeDefined();
      expect(payload.data).not.toHaveProperty('text');
      expect(payload.data).not.toHaveProperty('blocks');
    });

    it('does not emit when criteria passes', async () => {
      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'passed',
        failedConditions: [],
      });
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('does not emit when evaluator has no pass criteria', async () => {
      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'no_criteria',
        failedConditions: [],
      });
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('skips dispatch when no destinations match', async () => {
      mockListForEvent.mockReturnValue(() => Promise.resolve([]));

      await emitEvaluationFailedWebhook({
        ...baseEvalParams,
        verdict: 'failed',
        failedConditions: failedScoreConditions,
      });
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('swallows errors and does not throw', async () => {
      mockWithRef.mockRejectedValue(new Error('DB down'));

      await expect(
        emitEvaluationFailedWebhook({
          ...baseEvalParams,
          verdict: 'failed',
          failedConditions: failedScoreConditions,
        })
      ).resolves.toBeUndefined();
      await expect(flushDeferred()).resolves.toBeUndefined();
    });
  });

  describe('isSlackIncomingWebhookUrl', () => {
    it('matches hooks.slack.com incoming webhook URLs', () => {
      expect(isSlackIncomingWebhookUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true);
      expect(isSlackIncomingWebhookUrl('https://example.com/webhook')).toBe(false);
    });
  });

  describe('buildTestSlackPayload', () => {
    const ctx = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      agentId: 'test-agent-id',
      manageUiBaseUrl: 'https://app.inkeep.com',
    };

    it('builds Block Kit payload with test header and fields', () => {
      const envelope = {
        type: 'test',
        timestamp: '2026-05-13T00:00:00.000Z',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'test-agent-id',
        data: {
          conversation: {
            id: 'test-conversation-id',
            title: 'Test webhook delivery',
          },
        },
      };

      const result = buildTestSlackPayload(envelope, ctx);

      expect(result.text).toBe('Test Webhook: Test webhook delivery');
      expect(result.blocks).toHaveLength(4);
      expect((result.blocks as { type: string; text: { text: string } }[])[0].text.text).toBe(
        'Test Webhook Delivery'
      );
      const blocks = result.blocks as { type: string; text?: { text: string } }[];
      expect(blocks.some((b) => b.text?.text?.includes('View Conversation'))).toBe(false);
      expect(result.type).toBe('test');
    });
  });

  describe('buildSlackPayload', () => {
    const ctx = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      agentId: 'agent-1',
      manageUiBaseUrl: 'https://app.inkeep.com',
    };

    describe('conversation.created', () => {
      it('builds a header, fields, and conversation link', () => {
        const envelope = {
          type: 'conversation.created',
          timestamp: '2026-05-13T00:00:00.000Z',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
          data: {
            conversation: {
              id: 'conv-1',
              title: 'My Chat',
              agentId: 'agent-1',
            },
          },
        };

        const result = buildSlackPayload('conversation.created', envelope, ctx);

        expect(result.text).toBe('New Conversation: My Chat');
        expect(result.blocks).toHaveLength(4);
        const header = (result.blocks as any[])[0];
        expect(header.text.text).toBe('New Conversation');
        const linksBlock = (result.blocks as any[])[2];
        expect(linksBlock.text.text).toContain(
          'https://app.inkeep.com/tenant-1/projects/project-1/traces/conversations/conv-1'
        );
        expect(result.type).toBe('conversation.created');
        expect(result.tenantId).toBe('tenant-1');
      });

      it('falls back to conversation ID when title is null', () => {
        const envelope = { data: { conversation: { id: 'conv-1', title: null } } };
        const result = buildSlackPayload('conversation.created', envelope, ctx);
        expect(result.text).toBe('New Conversation: conv-1');
      });
    });

    describe('conversation.updated', () => {
      it('uses "Conversation Updated" header', () => {
        const envelope = { data: { conversation: { id: 'conv-1', title: 'Updated Chat' } } };
        const result = buildSlackPayload('conversation.updated', envelope, ctx);
        expect(result.text).toBe('Conversation Updated: Updated Chat');
        expect((result.blocks as any[])[0].text.text).toBe('Conversation Updated');
      });
    });

    describe('feedback.created', () => {
      it('builds feedback block with type and conversation link', () => {
        const envelope = {
          data: {
            feedback: { type: 'positive', details: 'Great answer!', conversationId: 'conv-1' },
            conversation: { id: 'conv-1', title: 'Support Chat' },
          },
        };

        const result = buildSlackPayload('feedback.created', envelope, ctx);

        expect(result.text).toContain('positive');
        expect(result.text).toContain('Support Chat');
        expect(result.blocks).toHaveLength(4);
        const linksBlock = (result.blocks as any[])[2];
        expect(linksBlock.text.text).toContain('View Conversation');
        expect(linksBlock.text.text).toContain('View Feedback');
        expect(linksBlock.text.text).toContain('conversationId=conv-1');
      });

      it('truncates long details', () => {
        const longDetails = 'x'.repeat(300);
        const envelope = {
          data: {
            feedback: { type: 'negative', details: longDetails },
            conversation: { id: 'conv-1' },
          },
        };

        const result = buildSlackPayload('feedback.created', envelope, ctx);
        const fields = (result.blocks as any[])[1].fields;
        const detailsField = fields.find((f: any) => f.text.includes('Details'));
        expect(detailsField.text).toContain('...');
        expect(detailsField.text.length).toBeLessThan(300);
      });

      it('escapes Slack mrkdwn metacharacters in user-controlled details', () => {
        const envelope = {
          data: {
            feedback: {
              type: 'negative',
              details: '<https://attacker.example.com|click here>',
              conversationId: 'conv-1',
            },
            conversation: { id: 'conv-1', title: '<https://evil.example.com|trusted>' },
          },
        };

        const result = buildSlackPayload('feedback.created', envelope, ctx);
        const fields = (result.blocks as any[])[1].fields;
        const detailsField = fields.find((f: any) => f.text.includes('Details'));
        expect(detailsField.text).not.toContain('<https://attacker.example.com|click here>');
        expect(detailsField.text).toContain('&lt;https://attacker.example.com|click here&gt;');
        const convField = fields.find((f: any) => f.text.startsWith('*Conversation:*'));
        expect(convField.text).not.toContain('<https://evil.example.com|trusted>');
        expect(convField.text).toContain('&lt;https://evil.example.com|trusted&gt;');
      });
    });

    describe('event.created', () => {
      it('builds event block with type and ID', () => {
        const envelope = {
          data: {
            event: { id: 'evt-1', type: 'page_view', conversationId: 'conv-1' },
          },
        };

        const result = buildSlackPayload('event.created', envelope, ctx);

        expect(result.text).toContain('page_view');
        expect(result.text).toContain('evt-1');
        expect(result.blocks).toHaveLength(4);
        const linksBlock = (result.blocks as any[])[2];
        expect(linksBlock.text.text).toContain('View Conversation');
      });

      it('omits conversation link when conversationId is absent', () => {
        const envelope = { data: { event: { id: 'evt-1', type: 'page_view' } } };
        const result = buildSlackPayload('event.created', envelope, ctx);
        expect(result.blocks).toHaveLength(3);
      });
    });

    describe('evaluation.failed', () => {
      it('builds evaluation failed block with conditions and links', () => {
        const envelope = {
          data: {
            evaluator: { name: 'Quality Check' },
            conversation: { id: 'conv-1' },
            failedConditions: [{ field: 'score', operator: '>=', value: 0.7, actual: 0.3 }],
          },
        };
        const meta = { evaluationRunConfigId: 'rc-1', evaluationJobConfigId: null };

        const result = buildSlackPayload('evaluation.failed', envelope, ctx, meta);

        expect(result.text).toContain('Quality Check');
        expect(result.text).toContain('got 0.3');
        expect(result.blocks).toHaveLength(6);
        const linksBlock = (result.blocks as any[])[4];
        expect(linksBlock.text.text).toContain('evaluations/run-configs/rc-1');
      });

      it('does not leak meta fields into output', () => {
        const envelope = {
          data: {
            evaluator: { name: 'Check' },
            conversation: { id: 'conv-1' },
            failedConditions: [],
          },
        };
        const meta = { evaluationRunConfigId: 'rc-1', evaluationJobConfigId: null };

        const result = buildSlackPayload('evaluation.failed', envelope, ctx, meta);
        expect(result).not.toHaveProperty('evaluationRunConfigId');
        expect(result).not.toHaveProperty('evaluationJobConfigId');
      });
    });

    describe('conversation.execution.error', () => {
      it('builds error card with reason, link, and Inkeep footer', () => {
        const envelope = {
          data: {
            conversation: { id: 'conv-1' },
            reason: 'Maximum error limit (3) reached',
          },
        };
        const result = buildSlackPayload('conversation.execution.error', envelope, ctx);
        expect(result.text).toContain('execution error');
        expect(result.blocks).toHaveLength(4);
        const fields = (result.blocks as any[])[1].fields;
        expect(fields[0].text).toContain('conversation.execution.error');
        expect(fields[1].text).toContain('Maximum error limit');
        const linkBlock = (result.blocks as any[])[2];
        expect(linkBlock.text.text).toContain('traces/conversations/conv-1');
        const footer = (result.blocks as any[])[3];
        expect(footer.type).toBe('context');
      });
    });

    describe('conversation.generation.error', () => {
      it('builds error card with reason and Inkeep footer', () => {
        const envelope = {
          data: {
            conversation: { id: 'conv-1' },
            reason: 'Generation terminated by timeout/abort signal',
          },
        };
        const result = buildSlackPayload('conversation.generation.error', envelope, ctx);
        expect(result.text).toContain('generation error');
        expect(result.blocks).toHaveLength(4);
        const footer = (result.blocks as any[]).at(-1);
        expect(footer.type).toBe('context');
      });
    });

    describe('conversation.tool.error', () => {
      it('includes tool name in fields', () => {
        const envelope = {
          data: {
            conversation: { id: 'conv-1' },
            tool: { id: 'tool-1', name: 'search_docs' },
            mcpServer: { id: 'mcp-1', name: 'docs-server' },
            reason: 'Connection timeout',
          },
        };
        const result = buildSlackPayload('conversation.tool.error', envelope, ctx);
        expect(result.text).toContain('tool error');
        const fields = (result.blocks as any[])[1].fields;
        expect(fields.some((f: any) => f.text.includes('search_docs'))).toBe(true);
      });

      it('omits tool field when not present', () => {
        const envelope = {
          data: {
            conversation: { id: 'conv-1' },
            reason: 'Failed',
          },
        };
        const result = buildSlackPayload('conversation.tool.error', envelope, ctx);
        const fields = (result.blocks as any[])[1].fields;
        expect(fields.every((f: any) => !f.text.includes('undefined'))).toBe(true);
      });
    });

    describe('conversation.context.error', () => {
      it('renders context definition ID in fields', () => {
        const envelope = {
          data: {
            conversation: { id: 'conv-1' },
            contextDefinition: { id: 'def-1' },
            reason: 'HTTP 500 from upstream',
          },
        };
        const result = buildSlackPayload('conversation.context.error', envelope, ctx);
        expect(result.text).toContain('context error');
        expect(result.text).toContain('HTTP 500');
        const fields = (result.blocks as any[])[1].fields;
        expect(fields.some((f: any) => f.text.includes('def-1'))).toBe(true);
      });
    });

    describe('unknown event type', () => {
      it('falls back to plain text', () => {
        const envelope = { data: { foo: 'bar' } };
        const result = buildSlackPayload('unknown.type' as any, envelope, ctx);
        expect(result.text).toBe('[unknown.type] event fired');
        expect(result.blocks).toEqual([]);
        expect(result.data).toEqual({ foo: 'bar' });
      });
    });
  });

  describe('emitWebhookEvent Slack routing', () => {
    beforeEach(() => {
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => fn('mock-db'));
    });

    it('sends Block Kit payload to Slack URLs', async () => {
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([
          { id: 'dest-1', url: 'https://hooks.slack.com/services/T/B/x', headers: null },
        ])
      );

      await emitWebhookEvent({
        ...baseParams,
        data: { conversation: { id: 'conv-1', title: 'Test' } },
      });

      const payload = mockStart.mock.calls[0][1][0].payload;
      expect(payload.text).toBeDefined();
      expect(payload.blocks).toBeDefined();
      expect(payload.data.conversation).toBeDefined();
      expect(payload.type).toBe('conversation.created');
      expect(payload.tenantId).toBe('tenant-1');
    });

    it('sends envelope to non-Slack URLs', async () => {
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hook.example.com', headers: null }])
      );

      await emitWebhookEvent({
        ...baseParams,
        data: { conversation: { id: 'conv-1', title: 'Test' } },
      });

      const payload = mockStart.mock.calls[0][1][0].payload;
      expect(payload.type).toBe('conversation.created');
      expect(payload.data).toBeDefined();
      expect(payload).not.toHaveProperty('text');
      expect(payload).not.toHaveProperty('blocks');
    });
  });

  describe('emitWebhookEventFireAndForget', () => {
    beforeEach(() => {
      mockWithRef.mockImplementation(async (_pool: any, _ref: any, fn: any) => fn('mock-db'));
      mockListForEvent.mockReturnValue(() =>
        Promise.resolve([{ id: 'dest-1', url: 'https://hook.example.com', headers: null }])
      );
    });

    it('dispatches webhook and registers with waitUntil', async () => {
      emitWebhookEventFireAndForget(
        {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
          resolvedRef: { ref: 'main', commitHash: 'abc' } as any,
          eventType: 'conversation.execution.error',
          data: { conversation: { id: 'conv-1' }, reason: 'test error' },
        },
        'test-context'
      );

      await vi.waitFor(() => expect(pendingDeferred.length).toBeGreaterThan(0));
      await flushDeferred();

      expect(mockStart).toHaveBeenCalled();
      const payload = mockStart.mock.calls[0][1][0].payload;
      expect(payload.type).toBe('conversation.execution.error');
      expect(payload.data.reason).toBe('test error');
    });

    it('catches emission errors without throwing', async () => {
      mockWithRef.mockRejectedValue(new Error('DB down'));

      emitWebhookEventFireAndForget(
        {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
          resolvedRef: { ref: 'main', commitHash: 'abc' } as any,
          eventType: 'conversation.tool.error',
          data: { conversation: { id: 'conv-1' }, reason: 'tool failed' },
        },
        'test-context'
      );

      await vi.waitFor(() => expect(pendingDeferred.length).toBeGreaterThan(0));
      await flushDeferred();

      expect(mockStart).not.toHaveBeenCalled();
    });
  });
});
