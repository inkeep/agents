import {
  type DatabaseClient,
  getAgentWithDefaultSubAgent,
  getContextConfigById,
  getConversation,
  updateConversation,
} from '@inkeep/agents-core';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { getLogger } from '../utils';
import { setSpanWithError, tracer } from '../utils/tracer';
import { ContextResolver, type ResolvedContext } from './ContextResolver';

const logger = getLogger('context');

async function determineContextTrigger(
  tenantId: string,
  projectId: string,
  conversationId: string,
  dbClient: DatabaseClient
): Promise<'initialization' | 'invocation'> {
  const conversation = await getConversation(dbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (!conversation || !conversation.lastContextResolution) {
    return 'initialization';
  }

  return 'invocation';
}

async function handleContextConfigChange(
  tenantId: string,
  projectId: string,
  conversationId: string,
  agentId: string,
  newContextConfigId: string,
  dbClient: DatabaseClient,
  credentialStores?: CredentialStoreRegistry
): Promise<void> {
  const conversation = await getConversation(dbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });
  if (!conversation) return;

  if (conversation.lastContextResolution) {
    const contextResolver = new ContextResolver(tenantId, projectId, dbClient, credentialStores);
    await contextResolver.clearCache(tenantId, projectId, conversationId);

    logger.info(
      {
        conversationId,
        agentId,
        contextConfigId: newContextConfigId,
      },
      'Potential context config change for existing conversation, cache cleared'
    );
  }
}

async function handleContextResolution({
  tenantId,
  projectId,
  agentId,
  conversationId,
  headers,
  dbClient,
  credentialStores,
}: {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  headers: Record<string, unknown>;
  dbClient: DatabaseClient;
  credentialStores?: CredentialStoreRegistry;
}): Promise<ResolvedContext | null> {
  return tracer.startActiveSpan(
    'context.handle_context_resolution',
    {
      attributes: {
        'context.headers_keys': Object.keys(headers),
      },
    },
    async (parentSpan: Span) => {
      let agent: any;
      let trigger: 'initialization' | 'invocation';

      try {
        agent = await getAgentWithDefaultSubAgent(dbClient)({
          scopes: { tenantId, projectId, agentId: agentId },
        });
        if (!agent?.contextConfigId) {
          logger.debug({ agentId: agentId }, 'No context config found for agent');
          return null;
        }

        await handleContextConfigChange(
          tenantId,
          projectId,
          conversationId,
          agentId,
          agent.contextConfigId,
          dbClient,
          credentialStores
        );

        trigger = await determineContextTrigger(tenantId, projectId, conversationId, dbClient);

        const contextConfig = await getContextConfigById(dbClient)({
          scopes: { tenantId, projectId, agentId: agentId },
          id: agent.contextConfigId,
        });

        if (!contextConfig) {
          logger.warn(
            { contextConfigId: agent.contextConfigId },
            'Context config not found, proceeding without context resolution'
          );
          parentSpan.setStatus({ code: SpanStatusCode.ERROR });
          parentSpan.addEvent('context.config_not_found', {
            contextConfigId: agent.contextConfigId,
          });
          return null;
        }

        const contextResolver = new ContextResolver(
          tenantId,
          projectId,
          dbClient,
          credentialStores
        );

        const contextResult = await contextResolver.resolve(contextConfig, {
          triggerEvent: trigger,
          conversationId,
          headers,
          tenantId,
        });

        const resolvedContext = {
          ...contextResult.resolvedContext,
          $now: new Date().toISOString(),
          $env: process.env,
        };

        await updateConversation(dbClient)({
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
        } else {
          parentSpan.setStatus({ code: SpanStatusCode.OK });
        }

        logger.info(
          {
            conversationId,
            agentId: agentId,
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
            contextConfigId: agent?.contextConfigId,
            trigger: await determineContextTrigger(
              tenantId,
              projectId,
              conversationId,
              dbClient
            ).catch(() => 'unknown'),
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
