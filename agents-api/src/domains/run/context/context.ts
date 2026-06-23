import {
  type CredentialStoreRegistry,
  type FullExecutionContext,
  getConversation,
  getLogger,
  getTracer,
  setSpanWithError,
  updateConversation,
  type WebhookDestinationSelect,
} from '@inkeep/agents-core';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import runDbClient from '../../../data/db/runDbClient';
import { emitWebhookEventFireAndForget } from '../services/WebhookDeliveryService';
import { ContextResolver, type ResolvedContext } from './ContextResolver';

const logger = getLogger('context');
const tracer = getTracer('context');

async function determineContextTrigger(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<'initialization' | 'invocation'> {
  const conversation = await getConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (!conversation || !conversation.lastContextResolution) {
    return 'initialization';
  }

  return 'invocation';
}

async function handleContextConfigChange(
  executionContext: FullExecutionContext,
  conversationId: string,
  newContextConfigId: string,
  credentialStores?: CredentialStoreRegistry
): Promise<void> {
  const { tenantId, projectId } = executionContext;
  const conversation = await getConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });
  if (!conversation) return;

  if (conversation.lastContextResolution) {
    const contextResolver = new ContextResolver(executionContext, credentialStores);
    await contextResolver.clearCache(tenantId, projectId, conversationId);

    logger.info(
      {
        conversationId,
        contextConfigId: newContextConfigId,
      },
      'Potential context config change for existing conversation, cache cleared'
    );
  }
}

async function handleContextResolution({
  executionContext,
  conversationId,
  headers,
  credentialStores,
  prefetchedDestinations,
  conversationUserProperties,
  conversationProperties,
}: {
  executionContext: FullExecutionContext;
  conversationId: string;
  headers: Record<string, unknown>;
  credentialStores?: CredentialStoreRegistry;
  prefetchedDestinations?: WebhookDestinationSelect[];
  conversationUserProperties?: Record<string, unknown> | null;
  conversationProperties?: Record<string, unknown> | null;
}): Promise<ResolvedContext | null> {
  return tracer.startActiveSpan(
    'context.handle_context_resolution',
    {
      attributes: {
        'context.headers_keys': Object.keys(headers),
      },
    },
    async (parentSpan: Span) => {
      const { tenantId, projectId, agentId, project } = executionContext;
      const agent = project.agents[agentId];
      let trigger: 'initialization' | 'invocation';

      try {
        const contextConfig = agent.contextConfig;

        if (!contextConfig) {
          logger.debug('No context config found for agent');
          return null;
        }

        await handleContextConfigChange(
          executionContext,
          conversationId,
          contextConfig.id,
          credentialStores
        );

        trigger = await determineContextTrigger(tenantId, projectId, conversationId);

        const contextResolver = new ContextResolver(executionContext, credentialStores);

        const contextResult = await contextResolver.resolve(contextConfig, {
          triggerEvent: trigger,
          conversationId,
          headers,
          tenantId,
        });

        logger.info({ contextResult }, 'Context result');

        const resolvedContext = {
          ...contextResult.resolvedContext,
          $env: process.env,
        };

        await updateConversation(runDbClient)({
          scopes: { tenantId, projectId },
          conversationId,
          data: {
            lastContextResolution: new Date().toISOString(),
          },
        });

        if (contextResult.errors.length > 0) {
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Context resolution completed with errors`,
          });

          const { resolvedRef } = executionContext;
          if (resolvedRef && conversationId) {
            for (const err of contextResult.errors) {
              emitWebhookEventFireAndForget(
                {
                  tenantId,
                  projectId,
                  agentId,
                  agentName: agent?.name,
                  resolvedRef,
                  eventType: 'conversation.context.error',
                  data: {
                    conversation: {
                      id: conversationId,
                      userProperties: conversationUserProperties ?? null,
                      properties: conversationProperties ?? null,
                    },
                    contextDefinition: err.definitionId ? { id: err.definitionId } : undefined,
                    reason: err.error,
                  },
                  prefetchedDestinations,
                },
                'context-resolution-error'
              );
            }
          }
        } else {
          parentSpan.setStatus({ code: SpanStatusCode.OK });
        }

        logger.info(
          {
            conversationId,
            contextConfigId: contextConfig.id,
            trigger,
            resolvedKeys: Object.keys(resolvedContext),
            cacheHits: contextResult.cacheHits.length,
            cacheMisses: contextResult.cacheMisses.length,
            fetchedDefinitions: contextResult.fetchedDefinitions.length,
            errors: contextResult.errors.length,
          },
          'Context resolution completed (contextConfigId derived from agent)'
        );

        return resolvedContext;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        parentSpan.setAttributes({
          'context.final_status': 'failed',
          'context.error_message': errorMessage,
        });
        setSpanWithError(parentSpan, error instanceof Error ? error : new Error(String(error)));
        logger.error(
          {
            error: errorMessage,
            contextConfigId: agent?.contextConfig?.id,
            trigger: await determineContextTrigger(tenantId, projectId, conversationId).catch(
              () => 'unknown'
            ),
          },
          'Failed to resolve context, proceeding without context resolution'
        );
        return null;
      } finally {
        parentSpan.end();
      }
    }
  );
}

export { handleContextResolution, determineContextTrigger, handleContextConfigChange };
