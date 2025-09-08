import crypto from 'node:crypto';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { ContextCache } from './contextCache';
import type { ContextConfigSelect, ContextFetchDefinition } from '../types/index';
import { createSpanName, getGlobalTracer, handleSpanError, getLogger } from '../utils/index';
import { ContextFetcher } from './ContextFetcher';
import { DatabaseClient } from '../db/client';

const logger = getLogger('context-resolver');

// Get tracer using centralized utility
const tracer = getGlobalTracer();

// Fetched data in context resolution
export interface ResolvedContext {
  [templateKey: string]: unknown;
}

export interface ContextResolutionOptions {
  triggerEvent: 'initialization' | 'invocation';
  conversationId: string;
  requestContext?: Record<string, unknown>;
  tenantId: string;
}

export interface ContextResolutionResult {
  resolvedContext: ResolvedContext;
  requestContext: Record<string, unknown>;
  fetchedDefinitions: string[];
  cacheHits: string[];
  cacheMisses: string[];
  errors: Array<{
    definitionId: string;
    error: string;
  }>;
  totalDurationMs: number;
}

export class ContextResolver {
  private fetcher: ContextFetcher;
  private cache: ContextCache;
  private tenantId: string;
  private projectId: string;

  constructor(
    tenantId: string,
    projectId: string,
    dbClient: DatabaseClient,
    credentialStoreRegistry?: CredentialStoreRegistry
  ) {
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.fetcher = new ContextFetcher(tenantId, projectId, dbClient, credentialStoreRegistry);
    this.cache = new ContextCache(tenantId, projectId, dbClient);

    logger.info(
      {
        tenantId: this.tenantId,
        hasCredentialSupport: !!credentialStoreRegistry,
      },
      'ContextResolver initialized'
    );
  }

  /**
   * Resolve all contexts for a given configuration and trigger event
   */
  async resolve(
    contextConfig: ContextConfigSelect,
    options: ContextResolutionOptions
  ): Promise<ContextResolutionResult> {
    const startTime = Date.now();

    logger.info(
      {
        contextConfigId: contextConfig.id,
        triggerEvent: options.triggerEvent,
        conversationId: options.conversationId,
      },
      'Starting context resolution'
    );

    // Create parent span for the entire context resolution process
    return tracer.startActiveSpan(
      createSpanName('context.resolve'),
      {
        attributes: {
          'context.config_id': contextConfig.id,
          'context.trigger_event': options.triggerEvent,
        },
      },
      async (parentSpan: Span) => {
        try {
          const result: ContextResolutionResult = {
            resolvedContext: {},
            requestContext: options.requestContext || {},
            fetchedDefinitions: [],
            cacheHits: [],
            cacheMisses: [],
            errors: [],
            totalDurationMs: 0,
          };

          // Include request context in resolved context under the key 'requestContext'
          result.resolvedContext.requestContext = result.requestContext;

          const currentRequestContext = await this.cache.get({
            conversationId: options.conversationId,
            contextConfigId: contextConfig.id,
            contextVariableKey: 'requestContext',
          });

          if (options.requestContext && Object.keys(options.requestContext).length > 0) {
            // Invalidate the current request context
            await this.cache.invalidateRequestContext(
              this.tenantId,
              this.projectId,
              options.conversationId,
              contextConfig.id
            );

            logger.info(
              {
                conversationId: options.conversationId,
                contextConfigId: contextConfig.id,
              },
              'Invalidated request context in cache'
            );
            // Push the new request context to the cache
            await this.cache.set({
              contextConfigId: contextConfig.id,
              contextVariableKey: 'requestContext',
              conversationId: options.conversationId,
              value: options.requestContext,
              tenantId: this.tenantId,
            });
            logger.info(
              {
                conversationId: options.conversationId,
                contextConfigId: contextConfig.id,
              },
              'Request context set in cache'
            );
          } else if (currentRequestContext) {
            result.requestContext = currentRequestContext.value as Record<string, unknown>;
          } else {
            result.requestContext = {};
          }

          result.resolvedContext.requestContext = result.requestContext;

          // Get all context variables - we'll handle trigger events through cache invalidation
          const contextVariables = contextConfig.contextVariables || {};
          const contextVariableEntries = Object.entries(contextVariables);

          if (contextVariableEntries.length === 0) {
            logger.info(
              {
                contextConfigId: contextConfig.id,
              },
              'No context variables in context config'
            );
            result.totalDurationMs = Date.now() - startTime;
            parentSpan.setStatus({ code: SpanStatusCode.OK });
            return result;
          }

          // Separate definitions by trigger type for cache invalidation logic
          const initializationDefs = contextVariableEntries.filter(
            ([, def]) => def.trigger === 'initialization'
          );
          const invocationDefs = contextVariableEntries.filter(
            ([, def]) => def.trigger === 'invocation'
          );

          // For invocation trigger, invalidate invocation definition cache entries first
          if (options.triggerEvent === 'invocation' && invocationDefs.length > 0) {
            await this.cache.invalidateInvocationDefinitions(
              this.tenantId,
              this.projectId,
              options.conversationId,
              contextConfig.id,
              invocationDefs.map(([, def]) => def.id)
            );
          }

          // Create request hash for cache invalidation
          const requestHash = this.createRequestHash(result.requestContext);

          // Execute all context variables in parallel (no dependencies)
          const fetchPromises = contextVariableEntries.map(([templateKey, definition]) =>
            this.resolveSingleFetchDefinition(
              contextConfig,
              definition,
              templateKey,
              options,
              requestHash,
              result
            ).catch((error) => {
              // Handle individual fetch failures without stopping others
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error(
                {
                  contextConfigId: contextConfig.id,
                  definitionId: definition.id,
                  templateKey,
                  error: errorMessage,
                },
                'Failed to resolve context variable'
              );

              result.errors.push({
                definitionId: definition.id,
                error: errorMessage,
              });

              // Use default value if available
              if (definition.defaultValue !== undefined) {
                result.resolvedContext[templateKey] = definition.defaultValue;
                logger.info(
                  {
                    contextConfigId: contextConfig.id,
                    definitionId: definition.id,
                    templateKey,
                  },
                  'Using default value for failed context variable'
                );
              }
            })
          );

          // Wait for all fetches to complete
          await Promise.all(fetchPromises);

          result.totalDurationMs = Date.now() - startTime;

          parentSpan.addEvent('context.resolution.completed', {
            resolved_keys: Object.keys(result.resolvedContext),
            fetched_definitions: result.fetchedDefinitions,
          });

          // Check if there were any errors during context resolution
          if (result.errors.length > 0) {
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
              contextConfigId: contextConfig.id,
              resolvedKeys: Object.keys(result.resolvedContext),
              fetchedDefinitions: result.fetchedDefinitions.length,
              cacheHits: result.cacheHits.length,
              cacheMisses: result.cacheMisses.length,
              errors: result.errors.length,
              totalDurationMs: result.totalDurationMs,
            },
            'Context resolution completed'
          );

          return result;
        } catch (error) {
          const durationMs = Date.now() - startTime;

          // Use helper function for consistent error handling
          handleSpanError(parentSpan, error);

          logger.error(
            {
              contextConfigId: contextConfig.id,
              error: error instanceof Error ? error.message : String(error),
              durationMs,
            },
            'Context resolution failed'
          );

          throw error;
        } finally {
          parentSpan.end();
        }
      }
    );
  }

  /**
   * Resolve a single context variable
   */
  private async resolveSingleFetchDefinition(
    contextConfig: ContextConfigSelect,
    definition: ContextFetchDefinition,
    templateKey: string,
    options: ContextResolutionOptions,
    requestHash: string,
    result: ContextResolutionResult
  ): Promise<void> {
    // Create parent span for individual context variable resolution
    return tracer.startActiveSpan(
      createSpanName('context-resolver.resolve_single_fetch_definition'),
      {
        attributes: {
          'context.definition_id': definition.id,
          'context.template_key': templateKey,
          'context.url': definition.fetchConfig.url,
          'context.method': definition.fetchConfig.method,
          'context.trigger': definition.trigger,
        },
      },
      async (parentSpan: Span) => {
        try {
          // Check cache first
          const cachedEntry = await this.cache.get({
            conversationId: options.conversationId,
            contextConfigId: contextConfig.id,
            contextVariableKey: templateKey,
            requestHash,
          });

          if (cachedEntry) {
            result.resolvedContext[templateKey] = cachedEntry.value;
            result.cacheHits.push(definition.id);

            // Mark span as successful (cache hit)
            parentSpan.setStatus({ code: SpanStatusCode.OK });
            parentSpan.addEvent('context.cache_hit', {
              definition_id: definition.id,
              template_key: templateKey,
            });

            logger.debug(
              {
                definitionId: definition.id,
                templateKey,
                conversationId: options.conversationId,
              },
              'Cache hit for context variable'
            );
            return;
          }

          // Cache miss - fetch the data
          result.cacheMisses.push(definition.id);
          parentSpan.addEvent('context.cache_miss', {
            definition_id: definition.id,
            template_key: templateKey,
          });

          logger.debug(
            {
              definitionId: definition.id,
              templateKey,
              conversationId: options.conversationId,
            },
            'Cache miss for context variable, fetching data'
          );

          // Fetch the data with conversationId in the fetch config
          const definitionWithConversationId = {
            ...definition,
            fetchConfig: {
              ...definition.fetchConfig,
              conversationId: options.conversationId,
            },
          };
          const fetchedData = await this.fetcher.fetch(
            definitionWithConversationId,
            result.resolvedContext
          );

          // Store in resolved context
          result.resolvedContext[templateKey] = fetchedData;
          result.fetchedDefinitions.push(definition.id);

          // Cache the result (unified cache)
          await this.cache.set({
            contextConfigId: contextConfig.id,
            contextVariableKey: templateKey,
            conversationId: options.conversationId,
            value: fetchedData,
            requestHash,
            tenantId: this.tenantId,
          });

          // Mark span as successful
          parentSpan.setStatus({ code: SpanStatusCode.OK });
          parentSpan.addEvent('context.fetch_success', {
            definition_id: definition.id,
            template_key: templateKey,
            source: definition.fetchConfig.url,
          });

          logger.debug(
            {
              definitionId: definition.id,
              templateKey,
              conversationId: options.conversationId,
            },
            'Context variable resolved and cached'
          );
        } catch (error) {
          // Use helper function for consistent error handling
          handleSpanError(parentSpan, error);
          throw error;
        } finally {
          parentSpan.end();
        }
      }
    );
  }

  /**
   * Resolve the request context for a given conversation
   */
  async resolveRequestContext(
    conversationId: string,
    contextConfigId: string
  ): Promise<Record<string, unknown>> {
    const cachedEntry = await this.cache.get({
      conversationId: conversationId,
      contextConfigId: contextConfigId,
      contextVariableKey: 'requestContext',
    });

    if (cachedEntry) {
      return cachedEntry.value as Record<string, unknown>;
    }

    return {};
  }

  /**
   * Create a hash of the request context for cache invalidation
   */
  private createRequestHash(requestContext: Record<string, unknown>): string {
    const contextString = JSON.stringify(requestContext, Object.keys(requestContext).sort());
    return crypto.createHash('sha256').update(contextString).digest('hex').substring(0, 16);
  }

  /**
   * Clear cache
   */
  async clearCache(tenantId: string, projectId: string, conversationId: string): Promise<void> {
    await this.cache.clearConversation(tenantId, projectId, conversationId);

    logger.info(
      {
        conversationId,
      },
      'Context cache cleared for conversation'
    );
  }
}
