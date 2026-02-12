/**
 * Service for handling trigger webhook business logic.
 * Encapsulates validation, transformation, and async agent execution.
 *
 * On Vercel, uses waitUntil to ensure execution completes after response.
 * Locally, the process stays alive so standard async execution works.
 */

import type {
  FullExecutionContext,
  Part,
  ResolvedRef,
  SignatureVerificationConfig,
} from '@inkeep/agents-core';
import {
  createKeyChainStore,
  createMessage,
  createNangoCredentialStore,
  createOrGetConversation,
  createTriggerInvocation,
  DEFAULT_NANGO_STORE_ID,
  generateId,
  getConversationId,
  getCredentialReference,
  getCredentialStoreLookupKeyFromRetrievalParams,
  getFullProjectWithRelationIds,
  getTriggerById,
  interpolateTemplate,
  JsonTransformer,
  setActiveAgentForConversation,
  updateTriggerInvocationStatus,
  verifySignatureWithConfig,
  verifyTriggerAuth,
  withRef,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, SpanStatusCode } from '@opentelemetry/api';
import Ajv from 'ajv';
import type { Context } from 'hono';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { flushBatchProcessor } from '../../../instrumentation';
import { getLogger } from '../../../logger';
import { ExecutionHandler } from '../handlers/executionHandler';
import { createSSEStreamHelper } from '../utils/stream-helpers';
import { tracer } from '../utils/tracer';

let _waitUntil: ((promise: Promise<unknown>) => void) | undefined;
let _waitUntilResolved = false;

async function getWaitUntil(): Promise<((promise: Promise<unknown>) => void) | undefined> {
  if (_waitUntilResolved) return _waitUntil;
  _waitUntilResolved = true;
  if (!process.env.VERCEL) return undefined;
  try {
    const mod = await import('@vercel/functions');
    _waitUntil = mod.waitUntil;
  } catch (e) {
    console.error('[TriggerService] Failed to import @vercel/functions:', e);
  }
  return _waitUntil;
}

const logger = getLogger('TriggerService');
const ajv = new Ajv({ allErrors: true });

// Credential cache with 5-minute TTL
const credentialCache = new Map<string, { secret: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  | {
      success: false;
      error: string;
      status: 400 | 401 | 403 | 404 | 422 | 500;
      validationErrors?: string[];
    };

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
  const signatureResult = await verifySignature({
    trigger,
    tenantId,
    projectId,
    resolvedRef,
    honoContext,
    rawBody,
  });
  if (!signatureResult.success) {
    return signatureResult;
  }

  // 5. Validate payload against schema
  const validationResult = validatePayload(trigger, payload);
  if (!validationResult.success) {
    return validationResult;
  }

  // 6. Transform payload
  const transformResult = await transformPayload(trigger, payload, {
    tenantId,
    projectId,
    triggerId,
  });
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

  const authResult = await verifyTriggerAuth(
    honoContext,
    trigger.authentication as Parameters<typeof verifyTriggerAuth>[1]
  );
  if (!authResult.success) {
    if (authResult.status === 401) {
      return { success: false, error: authResult.message || 'Unauthorized', status: 401 };
    }
    return { success: false, error: authResult.message || 'Forbidden', status: 403 };
  }

  return { success: true };
}

/**
 * Resolve signing secret from credential reference with caching
 */
async function resolveSigningSecret(params: {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
  resolvedRef: ResolvedRef;
}): Promise<string | null> {
  const { tenantId, projectId, credentialReferenceId, resolvedRef } = params;
  const cacheKey = `${tenantId}:${projectId}:${credentialReferenceId}`;

  // Check cache first
  const cached = credentialCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.secret;
  }

  // Fetch credential reference from database
  const credentialRef = await withRef(manageDbPool, resolvedRef, (db) =>
    getCredentialReference(db)({
      scopes: { tenantId, projectId },
      id: credentialReferenceId,
    })
  );

  if (!credentialRef) {
    logger.warn({ tenantId, projectId, credentialReferenceId }, 'Credential reference not found');
    return null;
  }

  // Get the lookup key from retrieval params
  const lookupKey = getCredentialStoreLookupKeyFromRetrievalParams({
    retrievalParams: credentialRef.retrievalParams ?? {},
    credentialStoreType: credentialRef.type as 'keychain' | 'nango' | 'memory',
  });

  if (!lookupKey) {
    logger.warn(
      {
        tenantId,
        projectId,
        credentialReferenceId,
        retrievalParams: credentialRef.retrievalParams,
      },
      'Could not determine lookup key from credential reference'
    );
    return null;
  }

  // Create the credential store and fetch the secret
  let secret: string | null = null;

  if (
    credentialRef.type === 'keychain' ||
    credentialRef.credentialStoreId?.startsWith('keychain')
  ) {
    const keychainStore = createKeyChainStore(
      credentialRef.credentialStoreId ?? 'keychain-default'
    );
    secret = await keychainStore.get(lookupKey);
  } else if (
    credentialRef.type === 'nango' ||
    credentialRef.credentialStoreId?.startsWith('nango')
  ) {
    // Nango store support for cloud deployments
    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      logger.warn(
        { tenantId, projectId, credentialReferenceId },
        'NANGO_SECRET_KEY not configured, cannot resolve Nango credential'
      );
      return null;
    }

    try {
      const nangoStore = createNangoCredentialStore(
        credentialRef.credentialStoreId ?? DEFAULT_NANGO_STORE_ID,
        {
          secretKey: nangoSecretKey,
          apiUrl: process.env.NANGO_SERVER_URL || 'https://api.nango.dev',
        }
      );
      secret = await nangoStore.get(lookupKey);
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId,
          credentialReferenceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create or fetch from Nango credential store'
      );
      return null;
    }
  } else {
    logger.warn(
      {
        credentialStoreType: credentialRef.type,
        credentialStoreId: credentialRef.credentialStoreId,
      },
      'Unsupported credential store type for signing secret'
    );
    return null;
  }

  if (!secret) {
    logger.warn(
      { tenantId, projectId, credentialReferenceId, lookupKey },
      'No secret found in credential store'
    );
    return null;
  }

  // Handle case where secret is stored as JSON (e.g., {"access_token": "actual-secret"})
  if (secret.startsWith('{')) {
    try {
      const parsed = JSON.parse(secret);
      // Try common fields: access_token, secret, value, token
      const extractedSecret =
        parsed.access_token || parsed.secret || parsed.value || parsed.token || parsed.key;
      if (extractedSecret && typeof extractedSecret === 'string') {
        secret = extractedSecret;
      }
    } catch {
      // Not valid JSON, use as-is
    }
  }

  // Cache the secret with TTL
  credentialCache.set(cacheKey, {
    secret,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return secret;
}

async function verifySignature(params: {
  trigger: {
    signingSecretCredentialReferenceId?: string | null;
    signatureVerification?: SignatureVerificationConfig | null;
    [key: string]: unknown;
  };
  tenantId: string;
  projectId: string;
  resolvedRef: ResolvedRef;
  honoContext: Context;
  rawBody: string;
}): Promise<{ success: true } | { success: false; error: string; status: 403 | 500 }> {
  const { trigger, tenantId, projectId, resolvedRef, honoContext, rawBody } = params;

  // Skip verification if no signature verification is configured
  if (!trigger.signatureVerification || !trigger.signingSecretCredentialReferenceId) {
    return { success: true };
  }

  try {
    // Resolve signing secret from credential reference
    const secret = await resolveSigningSecret({
      tenantId,
      projectId,
      credentialReferenceId: trigger.signingSecretCredentialReferenceId,
      resolvedRef,
    });

    if (!secret) {
      return {
        success: false,
        error: 'Failed to resolve signing secret from credential reference',
        status: 500,
      };
    }

    // Use new verification function
    const result = verifySignatureWithConfig(
      honoContext,
      trigger.signatureVerification,
      secret,
      rawBody
    );

    if (!result.success) {
      return {
        success: false,
        error: result.message || 'Invalid signature',
        status: 403,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: errorMessage, tenantId, projectId },
      'Error during signature verification'
    );
    return {
      success: false,
      error: 'Signature verification failed',
      status: 500,
    };
  }
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
    const payloadForTemplate =
      typeof transformedPayload === 'object' &&
      transformedPayload !== null &&
      !Array.isArray(transformedPayload)
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
        const payloadForTemplate =
          typeof transformedPayload === 'object' &&
          transformedPayload !== null &&
          !Array.isArray(transformedPayload)
            ? (transformedPayload as Record<string, unknown>)
            : {};
        return interpolateTemplate(trigger.messageTemplate, payloadForTemplate);
      })()
    : JSON.stringify(transformedPayload);

  return { messageParts, userMessageText };
}

export async function dispatchExecution(params: {
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

  // Wrap agent execution in a single promise protected by waitUntil
  // The trigger.message_received span is created inside executeAgentAsync
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

  // Attach error handling so failures are always logged and invocation status is updated to failed
  const safeExecutionPromise = executionPromise.catch(async (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { err: errorMessage, errorStack, tenantId, projectId, agentId, triggerId, invocationId },
      'Background trigger execution failed'
    );

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
  });

  // On Vercel, use waitUntil to ensure completion after response is sent
  // In other environments, the promise runs in the background
  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'Calling waitUntil with execution promise'
    );
    waitUntil(safeExecutionPromise);
  } else {
    logger.warn(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'waitUntil is NOT available — background execution will be abandoned on serverless'
    );
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
export async function executeAgentAsync(params: {
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
    { tenantId, projectId, agentId, triggerId, invocationId },
    'executeAgentAsync: started, loading project'
  );

  // Load project FIRST to get agent name
  const project = await withRef(manageDbPool, resolvedRef, async (db) => {
    return await getFullProjectWithRelationIds(db)({
      scopes: { tenantId, projectId },
    });
  });

  logger.info(
    { tenantId, projectId, agentId, triggerId, invocationId, hasProject: !!project },
    'executeAgentAsync: project loaded'
  );

  if (!project) {
    logger.error(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'Project not found for trigger execution'
    );
    throw new Error(`Project ${projectId} not found`);
  }

  // Find the agent's default sub-agent
  const agent = project.agents?.[agentId];
  if (!agent) {
    logger.error(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'Agent not found in project for trigger execution'
    );
    throw new Error(`Agent ${agentId} not found in project`);
  }
  const defaultSubAgentId = agent.defaultSubAgentId;
  if (!defaultSubAgentId) {
    logger.error(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'Agent has no default sub-agent configured'
    );
    throw new Error(`Agent ${agentId} has no default sub-agent configured`);
  }

  const agentName = agent.name;

  // Create baggage with conversation/tenant/project/agent info for child spans
  const baggage = propagation
    .createBaggage()
    .setEntry('conversation.id', { value: conversationId })
    .setEntry('tenant.id', { value: tenantId })
    .setEntry('project.id', { value: projectId })
    .setEntry('agent.id', { value: agentId })
    .setEntry('agent.name', { value: agentName });
  const ctxWithBaggage = propagation.setBaggage(otelContext.active(), baggage);

  logger.info(
    { tenantId, projectId, agentId, triggerId, invocationId },
    'executeAgentAsync: starting tracer span'
  );

  // Execute the agent in a new trace root with baggage
  return tracer.startActiveSpan(
    'trigger.execute_async',
    {
      root: true,
      attributes: {
        'tenant.id': tenantId,
        'project.id': projectId,
        'agent.id': agentId,
        'agent.name': agentName,
        'trigger.id': triggerId,
        'trigger.invocation.id': invocationId,
        'conversation.id': conversationId,
        'invocation.type': 'trigger',
      },
    },
    ctxWithBaggage,
    async (span) => {
      // Create trigger.message_received as a child span, explicitly using active context
      // This ensures it attaches to trigger.execute_async as its parent
      const messageSpan = tracer.startSpan(
        'trigger.message_received',
        {
          attributes: {
            'tenant.id': tenantId,
            'project.id': projectId,
            'agent.id': agentId,
            'agent.name': agentName,
            'trigger.id': triggerId,
            'trigger.invocation.id': invocationId,
            'conversation.id': conversationId,
            'invocation.type': 'trigger',
            'message.content': userMessage,
            'message.timestamp': new Date().toISOString(),
            'message.parts': JSON.stringify(messageParts),
          },
        },
        otelContext.active() // Explicitly use current context with execute_async as parent
      );
      messageSpan.end();
      await flushBatchProcessor();
      logger.info(
        { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
        'Starting async trigger execution'
      );

      try {
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
        const result = await executionHandler.execute({
          executionContext,
          conversationId,
          userMessage,
          messageParts,
          initialAgentId: agentId,
          requestId,
          sseHelper: noOpStreamHelper,
          emitOperations: false,
        });

        if (!result.success) {
          throw new Error(result.error || 'Agent execution failed');
        }

        // Update status to success
        await updateTriggerInvocationStatus(runDbClient)({
          scopes: { tenantId, projectId, agentId },
          triggerId,
          invocationId,
          data: { status: 'success' },
        });

        span.setStatus({ code: SpanStatusCode.OK });

        logger.info(
          { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
          'Async trigger execution completed successfully'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        span.recordException(error instanceof Error ? error : new Error(errorMessage));

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
      } finally {
        span.end();
        await flushBatchProcessor();
      }
    }
  );
}
