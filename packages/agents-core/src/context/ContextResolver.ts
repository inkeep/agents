import crypto from 'node:crypto';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import type { DatabaseClient } from '../db/client';
import type { ResolvedRef } from '../dolt/ref';
import type { ContextConfigSelect, ContextFetchDefinition } from '../types/index';
import { getLogger } from '../utils';
import { setSpanWithError, tracer } from '../utils/tracer';
import { ContextFetcher } from './ContextFetcher';
import { ContextCache } from './contextCache';

const logger = getLogger('context-resolver');

export interface ResolvedContext {
  [templateKey: string]: unknown;
}

export interface ContextResolutionOptions {
  triggerEvent: 'initialization' | 'invocation';
  conversationId: string;
  headers?: Record<string, unknown>;
  tenantId: string;
}

export interface ContextResolutionResult {
  resolvedContext: ResolvedContext;
  headers: Record<string, unknown>;
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
    credentialStoreRegistry?: CredentialStoreRegistry,
    ref?: ResolvedRef
  ) {
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.fetcher = new ContextFetcher(tenantId, projectId, dbClient, ref, credentialStoreRegistry);
    this.cache = new ContextCache(tenantId, projectId, dbClient, ref);

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

    return tracer.startActiveSpan(
      'context.resolve',
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
            headers: options.headers || {},
            fetchedDefinitions: [],
            cacheHits: [],
            cacheMisses: [],
            errors: [],
            totalDurationMs: 0,
          };

          result.resolvedContext.headers = result.headers;

          const currentHeaders = await this.cache.get({
            conversationId: options.conversationId,
            contextConfigId: contextConfig.id,
            contextVariableKey: 'headers',
          });

          if (options.headers && Object.keys(options.headers).length > 0) {
            await this.cache.invalidateHeaders(
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
              'Invalidated headers in cache'
            );
            await this.cache.set({
              contextConfigId: contextConfig.id,
              contextVariableKey: 'headers',
              conversationId: options.conversationId,
              value: options.headers,
              tenantId: this.tenantId,
            });
            logger.info(
              {
                conversationId: options.conversationId,
                contextConfigId: contextConfig.id,
              },
              'Headers set in cache'
            );
          } else if (currentHeaders) {
            result.headers = currentHeaders.value as Record<string, unknown>;
          } else {
            result.headers = {};
          }

          result.resolvedContext.headers = result.headers;

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

          const _initializationDefs = contextVariableEntries.filter(
            ([, def]) => def.trigger === 'initialization'
          );
          const invocationDefs = contextVariableEntries.filter(
            ([, def]) => def.trigger === 'invocation'
          );

          if (options.triggerEvent === 'invocation' && invocationDefs.length > 0) {
            await this.cache.invalidateInvocationDefinitions(
              this.tenantId,
              this.projectId,
              options.conversationId,
              contextConfig.id,
              invocationDefs.map(([, def]) => def.id)
            );
          }

          const requestHash = this.createRequestHash(result.headers);

          const fetchPromises = contextVariableEntries.map(([templateKey, definition]) =>
            this.resolveSingleFetchDefinition(
              contextConfig,
              definition,
              templateKey,
              options,
              requestHash,
              result
            ).catch((error) => {
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

          await Promise.all(fetchPromises);

          result.totalDurationMs = Date.now() - startTime;

          parentSpan.addEvent('context.resolution.completed', {
            resolved_keys: Object.keys(result.resolvedContext),
            fetched_definitions: result.fetchedDefinitions,
          });

          if (result.errors.length > 0) {
            parentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `Context resolution completed with errors`,
            });
          } else {
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

          setSpanWithError(parentSpan, error instanceof Error ? error : new Error(String(error)));

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
    const cachedEntry = await this.cache.get({
      conversationId: options.conversationId,
      contextConfigId: contextConfig.id,
      contextVariableKey: templateKey,
      requestHash,
    });

    if (cachedEntry) {
      result.resolvedContext[templateKey] = cachedEntry.value;
      result.cacheHits.push(definition.id);

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

    result.cacheMisses.push(definition.id);

    logger.debug(
      {
        definitionId: definition.id,
        templateKey,
        conversationId: options.conversationId,
      },
      'Cache miss for context variable, fetching data'
    );

    const definitionWithConversationId = {
      ...definition,
      fetchConfig: {
        ...definition.fetchConfig,
        conversationId: options.conversationId,
      },
    };

    const fetchedData = await tracer.startActiveSpan(
      'context-resolver.resolve_single_fetch_definition',
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
          const data = await this.fetcher.fetch(
            definitionWithConversationId,
            result.resolvedContext
          );

          parentSpan.setStatus({ code: SpanStatusCode.OK });
          parentSpan.addEvent('context.fetch_success', {
            definition_id: definition.id,
            template_key: templateKey,
            source: definition.fetchConfig.url,
          });

          return data;
        } catch (error) {
          setSpanWithError(parentSpan, error instanceof Error ? error : new Error(String(error)));
          throw error;
        } finally {
          parentSpan.end();
        }
      }
    );

    result.resolvedContext[templateKey] = fetchedData;
    result.fetchedDefinitions.push(definition.id);

    await this.cache.set({
      contextConfigId: contextConfig.id,
      contextVariableKey: templateKey,
      conversationId: options.conversationId,
      value: fetchedData,
      requestHash,
      tenantId: this.tenantId,
    });

    logger.debug(
      {
        definitionId: definition.id,
        templateKey,
        conversationId: options.conversationId,
      },
      'Context variable resolved and cached'
    );
  }

  /**
   * Resolve the headers for a given conversation
   */
  async resolveHeaders(
    conversationId: string,
    contextConfigId: string
  ): Promise<Record<string, unknown>> {
    const cachedEntry = await this.cache.get({
      conversationId: conversationId,
      contextConfigId: contextConfigId,
      contextVariableKey: 'headers',
    });

    if (cachedEntry) {
      return cachedEntry.value as Record<string, unknown>;
    }

    return {};
  }

  /**
   * Create a hash of the headers for cache invalidation
   */
  private createRequestHash(headers: Record<string, unknown>): string {
    const contextString = JSON.stringify(headers, Object.keys(headers).sort());
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
