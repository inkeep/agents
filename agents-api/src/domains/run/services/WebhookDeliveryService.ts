import type { z } from '@hono/zod-openapi';
import {
  type AgentsRunDatabaseClient,
  type EventSelect,
  type FeedbackSelect,
  getConversation,
  getConversationHistory,
  getEvaluationRunById,
  getProjectMainResolvedRef,
  getWaitUntil,
  listWebhookDestinationsForEvent,
  type ResolvedRef,
  type WebhookDestinationEventTypeEnum,
  type WebhookDestinationSelect,
  type WebhookEventEnvelopeSchema,
  withRef,
} from '@inkeep/agents-core';
import type { EvaluationStatus } from '@inkeep/agents-core/evaluation';
import { start } from 'workflow/api';
import { manageDbClient, manageDbPool } from '../../../data/db';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import {
  CONVERSATION_DETAIL_MESSAGE_LIMIT,
  formatConversationDetail,
  formatEvent,
  formatFeedback,
} from '../../../utils/conversationFormatter';
import {
  type WebhookDeliveryPayload,
  webhookDeliveryWorkflow,
} from '../workflow/functions/webhookDelivery';
import { buildSlackPayload, isSlackIncomingWebhookUrl, type SlackContext } from './slackBlockKit';
import { dispatchViaQueue } from './webhookQueueDispatcher';

const logger = getLogger('WebhookDeliveryService');
const useQueue = !!process.env.VERCEL;
export type WebhookEventType = z.infer<typeof WebhookDestinationEventTypeEnum>;
export type WebhookEventEnvelope = z.infer<typeof WebhookEventEnvelopeSchema>;

export interface WebhookSlackMeta {
  evaluationRunConfigId?: string | null;
  evaluationJobConfigId?: string | null;
}

export interface EmitWebhookEventParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  resolvedRef: ResolvedRef;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  slackMeta?: WebhookSlackMeta;
}

export interface EmitConversationWebhookParams {
  runDbClient: AgentsRunDatabaseClient;
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  resolvedRef: ResolvedRef;
  eventType: WebhookEventType;
}

export async function emitConversationWebhook(
  params: EmitConversationWebhookParams
): Promise<void> {
  const {
    runDbClient: db,
    tenantId,
    projectId,
    agentId,
    conversationId,
    resolvedRef,
    eventType,
  } = params;
  const scopes = { tenantId, projectId };

  const promise = Promise.all([
    getConversation(db)({ scopes, conversationId }),
    getConversationHistory(db)({
      scopes,
      conversationId,
      options: { limit: CONVERSATION_DETAIL_MESSAGE_LIMIT },
    }),
  ])
    .then(([conversation, messages]) => {
      if (!conversation) {
        logger.warn({ conversationId, eventType }, 'Skipping webhook emit: conversation not found');
        return;
      }
      const detail = formatConversationDetail(conversation, messages);
      return emitWebhookEvent({
        tenantId,
        projectId,
        agentId,
        resolvedRef,
        eventType,
        data: { conversation: detail },
      });
    })
    .catch((err) => {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          conversationId,
        },
        `Failed to emit ${eventType} webhook event`
      );
    });

  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    waitUntil(promise);
  }
}

export async function emitWebhookEvent(params: EmitWebhookEventParams): Promise<void> {
  const { tenantId, projectId, agentId, resolvedRef, eventType, data, slackMeta } = params;

  let destinations: WebhookDestinationSelect[] = [];

  try {
    await withRef(manageDbPool, resolvedRef, async (db) => {
      destinations = await listWebhookDestinationsForEvent(db)({
        scopes: { tenantId, projectId },
        eventType,
        agentId,
      });
    });
  } catch (err) {
    logger.error(
      {
        tenantId,
        projectId,
        agentId,
        eventType,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to query webhook destinations'
    );
    return;
  }

  if (destinations.length === 0) {
    return;
  }

  const envelope: WebhookEventEnvelope = {
    type: eventType,
    timestamp: new Date().toISOString(),
    tenantId,
    projectId,
    agentId,
    data,
  };

  const manageUiBaseUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
  const slackCtx: SlackContext = { tenantId, projectId, agentId, manageUiBaseUrl };

  const payloads: WebhookDeliveryPayload[] = destinations.map((dest) => {
    const isSlackWebhook = isSlackIncomingWebhookUrl(dest.url);
    let payload: Record<string, unknown>;
    if (isSlackWebhook) {
      try {
        payload = buildSlackPayload(
          eventType,
          envelope as unknown as Record<string, unknown>,
          slackCtx,
          slackMeta
        );
      } catch (err) {
        logger.error(
          {
            webhookDestinationId: dest.id,
            eventType,
            error: err instanceof Error ? err.message : String(err),
          },
          'Failed to build Slack payload, falling back to raw envelope'
        );
        payload = envelope as unknown as Record<string, unknown>;
      }
    } else {
      payload = envelope as unknown as Record<string, unknown>;
    }
    return {
      destinationUrl: dest.url,
      tenantId,
      projectId,
      agentId,
      webhookDestinationId: dest.id,
      payload,
      headers: dest.headers,
    };
  });

  const results = await Promise.allSettled(
    payloads.map((deliveryPayload) =>
      useQueue
        ? dispatchViaQueue(deliveryPayload)
        : start(webhookDeliveryWorkflow, [deliveryPayload])
    )
  );

  let dispatched = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      dispatched++;
    } else {
      const error = (results[i] as PromiseRejectedResult).reason;
      logger.error(
        {
          webhookDestinationId: destinations[i].id,
          eventType,
          error: error instanceof Error ? error.message : String(error),
        },
        useQueue
          ? 'Failed to enqueue webhook delivery'
          : 'Failed to start webhook delivery workflow'
      );
    }
  }

  if (dispatched > 0) {
    logger.debug(
      { tenantId, projectId, agentId, eventType, dispatched, total: destinations.length },
      useQueue ? 'Webhook deliveries enqueued' : 'Webhook delivery workflows started'
    );
  }
}

export function emitWebhookEventFireAndForget(
  params: EmitWebhookEventParams,
  context: string
): void {
  void getWaitUntil()
    .then((waitUntil) => {
      const promise = emitWebhookEvent(params).catch((err) => {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), eventType: params.eventType },
          `Failed to emit ${params.eventType} webhook event (${context})`
        );
      });
      if (waitUntil) waitUntil(promise);
    })
    .catch((err) => {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), eventType: params.eventType },
        `Unexpected error in webhook fire-and-forget setup (${context})`
      );
    });
}

export interface EmitFeedbackWebhookParams {
  runDbClient: AgentsRunDatabaseClient;
  tenantId: string;
  projectId: string;
  agentId?: string;
  feedback: FeedbackSelect;
}

export async function emitFeedbackWebhook(params: EmitFeedbackWebhookParams): Promise<void> {
  const { runDbClient: db, tenantId, projectId, agentId, feedback } = params;
  const scopes = { tenantId, projectId };

  const promise = Promise.all([
    getProjectMainResolvedRef(manageDbClient)(tenantId, projectId),
    getConversation(db)({ scopes, conversationId: feedback.conversationId }),
    getConversationHistory(db)({
      scopes,
      conversationId: feedback.conversationId,
      options: { limit: CONVERSATION_DETAIL_MESSAGE_LIMIT },
    }),
  ])
    .then(([resolvedRef, conversation, messages]) => {
      if (!conversation) {
        logger.warn(
          { conversationId: feedback.conversationId, feedbackId: feedback.id },
          'Skipping feedback webhook emit: conversation not found'
        );
        return;
      }
      return emitWebhookEvent({
        tenantId,
        projectId,
        agentId: agentId ?? conversation.agentId ?? '',
        resolvedRef,
        eventType: 'feedback.created',
        data: {
          feedback: formatFeedback(feedback),
          conversation: formatConversationDetail(conversation, messages),
        },
      });
    })
    .catch((err) => {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          feedbackId: feedback.id,
        },
        'Failed to emit feedback.created webhook event'
      );
    });

  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    waitUntil(promise);
  }
}

export interface EmitEventWebhookParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  resolvedRef: ResolvedRef;
  event: EventSelect;
}

export async function emitEventWebhook(params: EmitEventWebhookParams): Promise<void> {
  const { tenantId, projectId, agentId, resolvedRef, event } = params;

  const promise = emitWebhookEvent({
    tenantId,
    projectId,
    agentId,
    resolvedRef,
    eventType: 'event.created',
    data: { event: formatEvent(event) },
  }).catch((err) => {
    logger.warn(
      {
        tenantId,
        projectId,
        eventId: event.id,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to emit event.created webhook event'
    );
  });

  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    waitUntil(promise);
  }
}

export interface EmitEvaluationFailedWebhookParams {
  runDbClient: AgentsRunDatabaseClient;
  tenantId: string;
  projectId: string;
  verdict: EvaluationStatus;
  failedConditions: Array<{
    field: string;
    operator: string;
    value: number;
    actual: number;
  }>;
  evaluationResult: {
    id: string;
    evaluatorId: string;
    conversationId: string;
    evaluationRunId: string | null;
  };
  evaluator: { id: string; name: string };
}

export async function emitEvaluationFailedWebhook(
  params: EmitEvaluationFailedWebhookParams
): Promise<void> {
  const {
    runDbClient: db,
    tenantId,
    projectId,
    verdict,
    failedConditions,
    evaluationResult,
    evaluator,
  } = params;
  const scopes = { tenantId, projectId };

  if (verdict !== 'failed') {
    return;
  }

  const evaluationRunPromise = evaluationResult.evaluationRunId
    ? getEvaluationRunById(db)({
        scopes: { tenantId, projectId, evaluationRunId: evaluationResult.evaluationRunId },
      })
    : Promise.resolve(null);

  const promise = Promise.all([
    getProjectMainResolvedRef(manageDbClient)(tenantId, projectId),
    getConversation(db)({ scopes, conversationId: evaluationResult.conversationId }),
    evaluationRunPromise,
  ])
    .then(([resolvedRef, conversation, evaluationRun]) => {
      if (!conversation) {
        logger.warn(
          {
            conversationId: evaluationResult.conversationId,
            evaluationResultId: evaluationResult.id,
          },
          'Skipping evaluation.failed webhook emit: conversation not found'
        );
        return;
      }

      return emitWebhookEvent({
        tenantId,
        projectId,
        agentId: conversation.agentId ?? '',
        resolvedRef,
        eventType: 'evaluation.failed',
        data: {
          evaluator: { id: evaluator.id, name: evaluator.name },
          conversation: { id: evaluationResult.conversationId },
          failedConditions,
        },
        slackMeta: {
          evaluationRunConfigId: evaluationRun?.evaluationRunConfigId ?? null,
          evaluationJobConfigId: evaluationRun?.evaluationJobConfigId ?? null,
        },
      });
    })
    .catch((err) => {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          evaluationResultId: evaluationResult.id,
          evaluatorId: evaluationResult.evaluatorId,
          conversationId: evaluationResult.conversationId,
          evaluationRunId: evaluationResult.evaluationRunId,
        },
        'Failed to emit evaluation.failed webhook event'
      );
    });

  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    waitUntil(promise);
  }
}
