/**
 * Service for handling trigger webhook business logic.
 * Encapsulates validation, transformation, and async agent execution.
 *
 * On Vercel, uses waitUntil to ensure execution completes after response.
 * Locally, the process stays alive so standard async execution works.
 */
import type { Context } from 'hono';
import type { FullExecutionContext, Part, ResolvedRef } from '@inkeep/agents-core';
import {
  createMessage,
  createOrGetConversation,
  createTriggerInvocation,
  generateId,
  getConversationId,
  getFullProjectWithRelationIds,
  getTriggerById,
  interpolateTemplate,
  JsonTransformer,
  setActiveAgentForConversation,
  updateTriggerInvocationStatus,
  verifySigningSecret,
  verifyTriggerAuth,
  withRef,
} from '@inkeep/agents-core';
import Ajv from 'ajv';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { ExecutionHandler } from '../handlers/executionHandler';
import { createSSEStreamHelper } from '../utils/stream-helpers';

const logger = getLogger('TriggerService');
const ajv = new Ajv({ allErrors: true });

export type TriggerWebhookParams = {
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  resolvedRef: ResolvedRef;
  rawBody: string;
  honoContext: Context;
};

export type TriggerWebhookResult =
  | { success: true; invocationId: string; conversationId: string }
  | { success: false; error: string; status: 400 | 401 | 403 | 404 | 422; validationErrors?: string[] };

/**
 * Process a trigger webhook request.
 * Handles validation, transformation, and dispatches async execution.
 */
export async function processWebhook(params: TriggerWebhookParams): Promise<TriggerWebhookResult> {
  const { tenantId, projectId, agentId, triggerId, resolvedRef, rawBody, honoContext } = params;

  // 1. Load and validate trigger
  const trigger = await loadTrigger({ tenantId, projectId, agentId, triggerId, resolvedRef });
  if (!trigger) {
    return { success: false, error: `Trigger ${triggerId} not found`, status: 404 };
  }

  if (!trigger.enabled) {
    return { success: false, error: 'Trigger is disabled', status: 404 };
  }

  // 2. Parse payload
  const payload: Record<string, unknown> = rawBody ? JSON.parse(rawBody) : {};

  // 3. Verify authentication
  const authResult = await verifyAuthentication(trigger, honoContext);
  if (!authResult.success) {
    return authResult;
  }

  // 4. Verify signature
  const signatureResult = verifySignature(trigger, honoContext, rawBody);
  if (!signatureResult.success) {
    return signatureResult;
  }

  // 5. Validate payload against schema
  const validationResult = validatePayload(trigger, payload);
  if (!validationResult.success) {
    return validationResult;
  }

  // 6. Transform payload
  const transformResult = await transformPayload(trigger, payload, { tenantId, projectId, triggerId });
  if (!transformResult.success) {
    return transformResult;
  }
  const transformedPayload = transformResult.payload;

  // 7. Build message
  const { messageParts, userMessageText } = buildMessage(trigger, transformedPayload, triggerId);

  // 8. Create invocation record and dispatch async execution
  const { invocationId, conversationId } = await dispatchExecution({
    tenantId,
    projectId,
    agentId,
    triggerId,
    resolvedRef,
    payload,
    transformedPayload,
    messageParts,
    userMessageText,
  });

  return { success: true, invocationId, conversationId };
}

async function loadTrigger(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  resolvedRef: ResolvedRef;
}) {
  const { tenantId, projectId, agentId, triggerId, resolvedRef } = params;

  return await withRef(manageDbPool, resolvedRef, (db) =>
    getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
    })
  );
}

async function verifyAuthentication(
  trigger: { authentication?: unknown },
  honoContext: Context
): Promise<{ success: true } | { success: false; error: string; status: 401 | 403 }> {
  if (!trigger.authentication) {
    return { success: true };
  }

  const authResult = await verifyTriggerAuth(honoContext, trigger.authentication as any);
  if (!authResult.success) {
    if (authResult.status === 401) {
      return { success: false, error: authResult.message || 'Unauthorized', status: 401 };
    }
    return { success: false, error: authResult.message || 'Forbidden', status: 403 };
  }

  return { success: true };
}

function verifySignature(
  trigger: { signingSecret?: string | null },
  honoContext: Context,
  rawBody: string
): { success: true } | { success: false; error: string; status: 403 } {
  if (!trigger.signingSecret) {
    return { success: true };
  }

  const signatureResult = verifySigningSecret(honoContext, trigger.signingSecret, rawBody);
  if (!signatureResult.success) {
    return { success: false, error: signatureResult.message || 'Invalid signature', status: 403 };
  }

  return { success: true };
}

function validatePayload(
  trigger: { inputSchema?: unknown },
  payload: unknown
): { success: true } | { success: false; error: string; status: 400; validationErrors?: string[] } {
  if (!trigger.inputSchema) {
    return { success: true };
  }

  const validate = ajv.compile(trigger.inputSchema as object);
  const valid = validate(payload);

  if (!valid) {
    const errors = validate.errors?.map((err) => `${err.instancePath} ${err.message}`);
    return {
      success: false,
      error: 'Payload validation failed',
      status: 400,
      validationErrors: errors,
    };
  }

  return { success: true };
}

async function transformPayload(
  trigger: { outputTransform?: unknown },
  payload: Record<string, unknown>,
  context: { tenantId: string; projectId: string; triggerId: string }
): Promise<{ success: true; payload: unknown } | { success: false; error: string; status: 422 }> {
  if (!trigger.outputTransform) {
    return { success: true, payload };
  }

  try {
    const transformedPayload = await JsonTransformer.transformWithConfig(
      payload,
      trigger.outputTransform
    );
    logger.debug(context, 'Payload transformation successful');
    return { success: true, payload: transformedPayload };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ ...context, error: errorMessage }, 'Payload transformation failed');
    return { success: false, error: `Payload transformation failed: ${errorMessage}`, status: 422 };
  }
}

function buildMessage(
  trigger: { messageTemplate?: string | null },
  transformedPayload: unknown,
  triggerId: string
): { messageParts: Part[]; userMessageText: string } {
  const messageParts: Part[] = [];

  // Add text part if messageTemplate exists
  // interpolateTemplate requires Record<string, unknown>, so only use it if payload is an object
  if (trigger.messageTemplate) {
    const payloadForTemplate = typeof transformedPayload === 'object' && transformedPayload !== null && !Array.isArray(transformedPayload)
      ? (transformedPayload as Record<string, unknown>)
      : {};
    const interpolatedMessage = interpolateTemplate(trigger.messageTemplate, payloadForTemplate);
    messageParts.push({ kind: 'text', text: interpolatedMessage });
  }

  // Add data part if payload is not null/undefined
  if (transformedPayload != null) {
    messageParts.push({
      kind: 'data',
      data: transformedPayload,
      metadata: { source: 'trigger', triggerId },
    });
  }

  // Text representation for execution handler
  const userMessageText = trigger.messageTemplate
    ? (() => {
        const payloadForTemplate = typeof transformedPayload === 'object' && transformedPayload !== null && !Array.isArray(transformedPayload)
          ? (transformedPayload as Record<string, unknown>)
          : {};
        return interpolateTemplate(trigger.messageTemplate, payloadForTemplate);
      })()
    : JSON.stringify(transformedPayload);

  return { messageParts, userMessageText };
}

async function dispatchExecution(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  resolvedRef: ResolvedRef;
  payload: Record<string, unknown>;
  transformedPayload: unknown;
  messageParts: Part[];
  userMessageText: string;
}): Promise<{ invocationId: string; conversationId: string }> {
  const {
    tenantId,
    projectId,
    agentId,
    triggerId,
    resolvedRef,
    payload,
    transformedPayload,
    messageParts,
    userMessageText,
  } = params;

  const conversationId = getConversationId();
  const invocationId = generateId();

  // Create invocation record (status: pending)
  // Note: transformedPayload can be any JSON value (object, array, primitive) from JMESPath transforms
  await createTriggerInvocation(runDbClient)({
    id: invocationId,
    triggerId,
    tenantId,
    projectId,
    agentId,
    conversationId,
    status: 'pending',
    requestPayload: payload,
    transformedPayload: transformedPayload as Record<string, unknown> | undefined,
  });

  logger.info(
    { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
    'Trigger invocation created'
  );

  // Create the execution promise
  const executionPromise = executeAgentAsync({
    tenantId,
    projectId,
    agentId,
    triggerId,
    invocationId,
    conversationId,
    userMessage: userMessageText,
    messageParts,
    resolvedRef,
  });

  // On Vercel, use waitUntil to ensure completion after response is sent
  // In other environments, the promise runs in the background
  if (process.env.VERCEL) {
    import('@vercel/functions').then(({ waitUntil }) => {
      waitUntil(executionPromise);
    }).catch((err) => {
      logger.error({ err }, 'Failed to import @vercel/functions');
    });
  } else {
    // For local/non-Vercel: fire-and-forget with error logging
    executionPromise.catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { err: errorMessage, errorStack, tenantId, projectId, agentId, triggerId, invocationId },
        'Background trigger execution failed'
      );
    });
  }

  logger.info(
    { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
    'Async execution dispatched'
  );

  return { invocationId, conversationId };
}

/**
 * Execute the agent asynchronously.
 * This runs after the webhook response is sent.
 */
async function executeAgentAsync(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  invocationId: string;
  conversationId: string;
  userMessage: string;
  messageParts: Part[];
  resolvedRef: ResolvedRef;
}): Promise<void> {
  const {
    tenantId,
    projectId,
    agentId,
    triggerId,
    invocationId,
    conversationId,
    userMessage,
    messageParts,
    resolvedRef,
  } = params;

  logger.info(
    { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
    'Starting async trigger execution'
  );

  try {
    // Load project
    const project = await withRef(manageDbPool, resolvedRef, async (db) => {
      return await getFullProjectWithRelationIds(db)({
        scopes: { tenantId, projectId },
      });
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Find the agent's default sub-agent
    const agent = project.agents?.[agentId];
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in project`);
    }
    const defaultSubAgentId = agent.defaultSubAgentId;
    if (!defaultSubAgentId) {
      throw new Error(`Agent ${agentId} has no default sub-agent configured`);
    }

    // Create conversation and set active agent
    await createOrGetConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId,
      activeSubAgentId: defaultSubAgentId,
      ref: resolvedRef,
    });

    await setActiveAgentForConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      subAgentId: defaultSubAgentId,
      agentId,
      ref: resolvedRef,
    });

    await createMessage(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      conversationId,
      role: 'user',
      content: {
        text: userMessage,
        parts: messageParts,
      },
      metadata: {
        a2a_metadata: {
          triggerId,
          invocationId,
        },
      },
    });

    // Build execution context
    const executionContext: FullExecutionContext = {
      tenantId,
      projectId,
      agentId,
      baseUrl: env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
      apiKey: env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '',
      apiKeyId: 'trigger-invocation',
      resolvedRef,
      project,
      metadata: {
        initiatedBy: {
          type: 'api_key',
          id: triggerId,
        },
      },
    };

    const requestId = `trigger-${invocationId}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Create no-op stream helper (we're not streaming to client)
    const noOpStreamHelper = createSSEStreamHelper(
      {
        writeSSE: async () => {},
        sleep: async () => {},
      },
      requestId,
      timestamp
    );

    // Execute the agent
    const executionHandler = new ExecutionHandler();
    await executionHandler.execute({
      executionContext,
      conversationId,
      userMessage,
      messageParts,
      initialAgentId: agentId,
      requestId,
      sseHelper: noOpStreamHelper,
      emitOperations: false,
    });

    // Update status to success
    await updateTriggerInvocationStatus(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
      invocationId,
      data: { status: 'success' },
    });

    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
      'Async trigger execution completed successfully'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        err: errorMessage,
        errorStack,
        tenantId,
        projectId,
        agentId,
        triggerId,
        invocationId,
      },
      'Async trigger execution failed'
    );

    // Update status to failed
    try {
      await updateTriggerInvocationStatus(runDbClient)({
        scopes: { tenantId, projectId, agentId },
        triggerId,
        invocationId,
        data: { status: 'failed', errorMessage },
      });
    } catch (updateError) {
      const updateErrorMessage =
        updateError instanceof Error ? updateError.message : String(updateError);
      logger.error(
        { err: updateErrorMessage, invocationId },
        'Failed to update invocation status to failed'
      );
    }

    throw error;
  }
}
