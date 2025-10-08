import {
  type DatabaseClient,
  getAgentGraphWithDefaultAgent,
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

// Helper function to determine context resolution trigger
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

  // New conversation or no previous context resolution = initialization
  if (!conversation || !conversation.lastContextResolution) {
    return 'initialization';
  }

  // Existing conversation with previous context = invocation
  return 'invocation';
}

// Helper function to handle context config changes
async function handleContextConfigChange(
  tenantId: string,
  projectId: string,
  conversationId: string,
  graphId: string,
  newContextConfigId: string,
  dbClient: DatabaseClient,
  credentialStores?: CredentialStoreRegistry
): Promise<void> {
  const conversation = await getConversation(dbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });
  if (!conversation) return;

  // For existing conversations, we conservatively clear cache when there's
  // a possibility of config change since we don't store contextConfigId in conversations
  if (conversation.lastContextResolution) {
    // Context config might have changed - clear cache for this conversation
    const contextResolver = new ContextResolver(tenantId, projectId, dbClient, credentialStores);
    await contextResolver.clearCache(tenantId, projectId, conversationId);

    logger.info(
      {
        conversationId,
        graphId,
        contextConfigId: newContextConfigId,
      },
      'Potential context config change for existing conversation, cache cleared'
    );
  }
}

// Enhanced context resolution function
async function handleContextResolution({
  tenantId,
  projectId,
  graphId,
  conversationId,
  headers,
  dbClient,
  credentialStores,
}: {
  tenantId: string;
  projectId: string;
  graphId: string;
  conversationId: string;
  headers: Record<string, unknown>;
  dbClient: DatabaseClient;
  credentialStores?: CredentialStoreRegistry;
}): Promise<ResolvedContext | null> {
  // Create parent span for the entire context resolution process
  return tracer.startActiveSpan(
    'context.handle_context_resolution',
    {
      attributes: {
        'context.headers_keys': Object.keys(headers),
      },
    },
    async (parentSpan: Span) => {
      let agentGraph: any;
      let trigger: 'initialization' | 'invocation';

      try {
        // 1. Get graph's context config
        agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
          scopes: { tenantId, projectId, graphId },
        });
        if (!agentGraph?.contextConfigId) {
          logger.debug({ graphId }, 'No context config found for graph');
          return null;
        }

        // 2. Handle context config changes (upsert scenario)
        await handleContextConfigChange(
          tenantId,
          projectId,
          conversationId,
          graphId,
          agentGraph.contextConfigId,
          dbClient,
          credentialStores
        );

        // 3. Determine trigger based on conversation state
        trigger = await determineContextTrigger(tenantId, projectId, conversationId, dbClient);

        // 4. Get context configuration directly from database
        const contextConfig = await getContextConfigById(dbClient)({
          scopes: { tenantId, projectId, graphId },
          id: agentGraph.contextConfigId,
        });

        if (!contextConfig) {
          logger.warn(
            { contextConfigId: agentGraph.contextConfigId },
            'Context config not found, proceeding without context resolution'
          );
          parentSpan.setStatus({ code: SpanStatusCode.ERROR });
          parentSpan.addEvent('context.config_not_found', {
            contextConfigId: agentGraph.contextConfigId,
          });
          return null;
        }

        // 5. Resolve context based on trigger
        const contextResolver = new ContextResolver(
          tenantId,
          projectId,
          dbClient,
          credentialStores
        );

        // Resolve unified context with appropriate trigger for cache invalidation
        const contextResult = await contextResolver.resolve(contextConfig, {
          triggerEvent: trigger,
          conversationId,
          headers,
          tenantId,
        });

        // Add built-in variables to resolved context
        const resolvedContext = {
          ...contextResult.resolvedContext,
          $now: new Date().toISOString(),
          $env: process.env,
        };

        // Update conversation's last context resolution timestamp
        await updateConversation(dbClient)({
          scopes: { tenantId, projectId },
          conversationId,
          data: {
            lastContextResolution: new Date().toISOString(),
          },
        });

        // Check if there were any errors during context resolution
        if (contextResult.errors.length > 0) {
          // Mark span as failed if there are errors
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Context resolution completed with errors`,
          });
        } else {
          // Mark span as successful if no errors
          parentSpan.setStatus({ code: SpanStatusCode.OK });
        }

        logger.info(
          {
            conversationId,
            graphId,
            contextConfigId: contextConfig.id,
            trigger,
            resolvedKeys: Object.keys(resolvedContext),
            cacheHits: contextResult.cacheHits.length,
            cacheMisses: contextResult.cacheMisses.length,
            fetchedDefinitions: contextResult.fetchedDefinitions.length,
            errors: contextResult.errors.length,
          },
          'Context resolution completed (contextConfigId derived from graph)'
        );

        return resolvedContext;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Record error in parent span
        parentSpan.setAttributes({
          'context.final_status': 'failed',
          'context.error_message': errorMessage,
        });
        setSpanWithError(parentSpan, error instanceof Error ? error : new Error(String(error)));
        logger.error(
          {
            error: errorMessage,
            contextConfigId: agentGraph?.contextConfigId,
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
