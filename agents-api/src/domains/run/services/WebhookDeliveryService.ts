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
  listEnabledWebhookDestinations,
  type ResolvedRef,
  type WebhookDestinationEventTypeEnum,
  type WebhookDestinationSelect,
  type WebhookDestinationWithAgents,
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
export async function prefetchWebhookDestinations(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  resolvedRef: ResolvedRef;
}): Promise<WebhookDestinationSelect[] | undefined> {
  try {
    let destinations: WebhookDestinationWithAgents[] = [];
    await withRef(manageDbPool, params.resolvedRef, async (db) => {
      destinations = await listEnabledWebhookDestinations(db)({
        scopes: { tenantId: params.tenantId, projectId: params.projectId },
        agentId: params.agentId,
      });
    });
    logger.info(
      { tenantId: params.tenantId, projectId: params.projectId, count: destinations.length },
      'Pre-fetched webhook destinations for turn'
    );
    return destinations.map(({ agentIds: _, ...dest }) => dest);
  } catch (err) {
    logger.error(
      {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to pre-fetch webhook destinations, will fall back to per-emit DB lookup'
    );
    return undefined;
  }
}

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
  prefetchedDestinations?: WebhookDestinationSelect[];
}

async function lookupWebhookDestinations(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  resolvedRef: ResolvedRef;
  eventType: WebhookEventType;
  prefetchedDestinations?: WebhookDestinationSelect[];
}): Promise<WebhookDestinationSelect[]> {
  const { tenantId, projectId, agentId, resolvedRef, eventType, prefetchedDestinations } = params;

  if (prefetchedDestinations) {
    return prefetchedDestinations.filter(
      (dest) => Array.isArray(dest.eventTypes) && dest.eventTypes.includes(eventType)
    );
  }

  let destinations: WebhookDestinationWithAgents[] = [];
  try {
    await withRef(manageDbPool, resolvedRef, async (db) => {
      destinations = await listEnabledWebhookDestinations(db)({
        scopes: { tenantId, projectId },
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
    return [];
  }

  return destinations.filter(
    (dest) => Array.isArray(dest.eventTypes) && dest.eventTypes.includes(eventType)
  );
}

interface DispatchToDestinationsParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  destinations: WebhookDestinationSelect[];
  slackMeta?: WebhookSlackMeta;
}

async function dispatchToDestinations(params: DispatchToDestinationsParams): Promise<void> {
  const { tenantId, projectId, agentId, eventType, data, destinations, slackMeta } = params;

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

export async function emitWebhookEvent(params: EmitWebhookEventParams): Promise<void> {
  const {
    tenantId,
    projectId,
    agentId,
    resolvedRef,
    eventType,
    data,
    slackMeta,
    prefetchedDestinations,
  } = params;

  const destinations = await lookupWebhookDestinations({
    tenantId,
    projectId,
    agentId,
    resolvedRef,
    eventType,
    prefetchedDestinations,
  });

  if (destinations.length === 0) {
    return;
  }

  await dispatchToDestinations({
    tenantId,
    projectId,
    agentId,
    eventType,
    data,
    destinations,
    slackMeta,
  });
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

export interface EmitConversationWebhookParams {
  runDbClient: AgentsRunDatabaseClient;
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  resolvedRef: ResolvedRef;
  eventType: WebhookEventType;
  prefetchedDestinations?: WebhookDestinationSelect[];
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

  const promise = lookupWebhookDestinations({
    tenantId,
    projectId,
    agentId,
    resolvedRef,
    eventType,
    prefetchedDestinations: params.prefetchedDestinations,
  })
    .then(async (destinations) => {
      if (destinations.length === 0) return;

      const [conversation, messages] = await Promise.all([
        getConversation(db)({ scopes, conversationId }),
        getConversationHistory(db)({
          scopes,
          conversationId,
          options: { limit: CONVERSATION_DETAIL_MESSAGE_LIMIT },
        }),
      ]);

      if (!conversation) {
        logger.warn({ conversationId, eventType }, 'Skipping webhook emit: conversation not found');
        return;
      }
      const detail = formatConversationDetail(conversation, messages);
      return dispatchToDestinations({
        tenantId,
        projectId,
        agentId,
        eventType,
        data: { conversation: detail },
        destinations,
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

export interface EmitFeedbackWebhookParams {
  runDbClient: AgentsRunDatabaseClient;
  tenantId: string;
  projectId: string;
  agentId?: string;
  feedback: FeedbackSelect;
  resolvedRef?: ResolvedRef;
}

export async function emitFeedbackWebhook(params: EmitFeedbackWebhookParams): Promise<void> {
  const { runDbClient: db, tenantId, projectId, feedback } = params;
  const scopes = { tenantId, projectId };

  const promise = (async () => {
    const resolvedRef =
      params.resolvedRef ?? (await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId));

    const conversation = await getConversation(db)({
      scopes,
      conversationId: feedback.conversationId,
    });

    if (!conversation) {
      logger.warn(
        { conversationId: feedback.conversationId, feedbackId: feedback.id },
        'Skipping feedback webhook emit: conversation not found'
      );
      return;
    }

    const agentId = params.agentId ?? conversation.agentId ?? '';

    const destinations = await lookupWebhookDestinations({
      tenantId,
      projectId,
      agentId,
      resolvedRef,
      eventType: 'feedback.created',
    });

    if (destinations.length === 0) return;

    const messages = await getConversationHistory(db)({
      scopes,
      conversationId: feedback.conversationId,
      options: { limit: CONVERSATION_DETAIL_MESSAGE_LIMIT },
    });

    return dispatchToDestinations({
      tenantId,
      projectId,
      agentId,
      eventType: 'feedback.created',
      data: {
        feedback: formatFeedback(feedback),
        conversation: formatConversationDetail(conversation, messages),
      },
      destinations,
    });
  })().catch((err) => {
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
  agentId: string;
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
  resolvedRef: ResolvedRef;
}

export async function emitEvaluationFailedWebhook(
  params: EmitEvaluationFailedWebhookParams
): Promise<void> {
  const {
    runDbClient: db,
    tenantId,
    projectId,
    agentId,
    verdict,
    failedConditions,
    evaluationResult,
    evaluator,
    resolvedRef,
  } = params;

  if (verdict !== 'failed') {
    return;
  }

  const promise = (async () => {
    const destinations = await lookupWebhookDestinations({
      tenantId,
      projectId,
      agentId,
      resolvedRef,
      eventType: 'evaluation.failed',
    });

    if (destinations.length === 0) return;

    const evaluationRun = evaluationResult.evaluationRunId
      ? await getEvaluationRunById(db)({
          scopes: { tenantId, projectId, evaluationRunId: evaluationResult.evaluationRunId },
        })
      : null;

    return dispatchToDestinations({
      tenantId,
      projectId,
      agentId,
      eventType: 'evaluation.failed',
      data: {
        evaluator: { id: evaluator.id, name: evaluator.name },
        conversation: { id: evaluationResult.conversationId },
        failedConditions,
      },
      destinations,
      slackMeta: {
        evaluationRunConfigId: evaluationRun?.evaluationRunConfigId ?? null,
        evaluationJobConfigId: evaluationRun?.evaluationJobConfigId ?? null,
      },
    });
  })().catch((err) => {
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
