import jmespath from 'jmespath';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { CredentialStuffer } from '../credential-stuffer/CredentialStuffer';
import { getCredentialReference } from '../data-access/index';
import type { DatabaseClient } from '../db/client';
import { executeInBranch } from '../dolt/branch-scoped-execution';
import type { ResolvedRef } from '../dolt/ref';
import { validateAgainstJsonSchema } from '../middleware/index';
import type { CredentialReferenceSelect } from '../types/entities';
import type { ContextFetchDefinition } from '../types/utility';
import { getLogger } from '../utils/logger';
import { type TemplateContext, TemplateEngine } from './TemplateEngine';

const logger = getLogger('context-fetcher');

// Response validator type - checks for errors and throws if found
type ResponseErrorChecker = (data: unknown) => void;

/**
 * GraphQL error checker - validates response for GraphQL errors and throws if found
 */
const checkGraphQLErrors: ResponseErrorChecker = (data: unknown) => {
  if (data && typeof data === 'object' && 'errors' in data) {
    const errorObj = data as any;
    if (Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
      const agentqlErrors = errorObj.errors;
      const errorMessage = `GraphQL request failed with ${agentqlErrors.length} errors: ${agentqlErrors.map((e: any) => e.message || 'Unknown error').join(', ')}`;
      throw new Error(errorMessage);
    }
  }
};

// Each checker examines the response and throws if errors are detected
const responseErrorCheckers: ResponseErrorChecker[] = [
  checkGraphQLErrors,
  // Add more error checkers here as needed
];

export interface FetchResult {
  data: unknown;
  source: string;
  durationMs: number;
}

export class ContextFetcher {
  private tenantId: string;
  private projectId: string;
  private defaultTimeout: number;
  private credentialStuffer?: CredentialStuffer;
  private dbClient: DatabaseClient;
  private ref?: ResolvedRef;

  constructor(
    tenantId: string,
    projectId: string,
    dbClient: DatabaseClient,
    ref?: ResolvedRef,
    credentialStoreRegistry?: CredentialStoreRegistry,
    defaultTimeout = 10000
  ) {
    this.tenantId = tenantId;
    this.ref = ref;
    this.projectId = projectId;
    this.defaultTimeout = defaultTimeout;
    if (credentialStoreRegistry) {
      this.credentialStuffer = new CredentialStuffer(credentialStoreRegistry);
    }
    this.dbClient = dbClient;

    logger.info(
      {
        tenantId: this.tenantId,
        defaultTimeout: this.defaultTimeout,
        hasCredentialSupport: !!this.credentialStuffer,
      },
      'ContextFetcher initialized'
    );
  }

  /**
   * Fetch data according to a fetch definition
   */
  async fetch(definition: ContextFetchDefinition, context: TemplateContext): Promise<unknown> {
    const startTime = Date.now();

    logger.info(
      {
        definitionId: definition.id,
        url: definition.fetchConfig.url,
      },
      'Starting context fetch'
    );

    try {
      // Resolve template variables in the fetch configuration and inject credential headers
      const resolvedConfig = await this.resolveTemplateVariables(
        definition.fetchConfig,
        context,
        definition.credentialReferenceId
      );
      // Perform the HTTP request with retry logic
      const response = await this.performRequest(resolvedConfig);

      // Transform the response if needed
      let transformedData = response.data;

      if (definition.fetchConfig.transform) {
        transformedData = this.transformResponse(response.data, definition.fetchConfig.transform);
      }

      if (definition.responseSchema) {
        this.validateResponseWithJsonSchema(
          transformedData,
          definition.responseSchema,
          definition.id
        );
      }

      const durationMs = Date.now() - startTime;

      logger.info(
        {
          definitionId: definition.id,
          source: response.source,
          durationMs,
        },
        'Context fetch completed successfully'
      );

      return transformedData;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          definitionId: definition.id,
          error: errorMessage,
          durationMs,
        },
        'Context fetch failed'
      );

      throw error;
    }
  }

  private async getCredential(credentialReferenceId: string) {
    try {
      let credentialReference: CredentialReferenceSelect | undefined;
      if (this.ref) {
        credentialReference = await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
          },
          async (db) => {
            return await getCredentialReference(db)({
              scopes: { tenantId: this.tenantId, projectId: this.projectId },
              id: credentialReferenceId,
            });
          }
        );
      } else {
        credentialReference = await getCredentialReference(this.dbClient)({
          scopes: { tenantId: this.tenantId, projectId: this.projectId },
          id: credentialReferenceId,
        });
      }

      logger.info({ credentialReference }, 'Credential reference');

      if (!credentialReference || !this.credentialStuffer) {
        throw new Error(`Credential store not found for reference ID: ${credentialReferenceId}`);
      }

      const credentialContext = {
        tenantId: this.tenantId,
        projectId: this.projectId,
      };

      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      const credentialData = await this.credentialStuffer.getCredentials(
        credentialContext,
        storeReference
      );

      return credentialData;
    } catch (error) {
      logger.error(
        {
          credentialReferenceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to resolve credentials for fetch request'
      );
      throw error;
    }
  }

  /**
   * Resolve template variables in fetch configuration and inject credential headers
   */
  private async resolveTemplateVariables(
    fetchConfig: ContextFetchDefinition['fetchConfig'],
    context: TemplateContext,
    credentialReferenceId?: string
  ): Promise<ContextFetchDefinition['fetchConfig']> {
    const resolved = { ...fetchConfig };

    // Resolve URL template variables
    resolved.url = this.interpolateTemplate(fetchConfig.url, context);

    logger.info({ resolvedUrl: resolved.url }, 'Resolved URL');

    // Resolve header template variables
    if (fetchConfig.headers) {
      resolved.headers = {};
      for (const [key, value] of Object.entries(fetchConfig.headers)) {
        resolved.headers[key] = this.interpolateTemplate(value, context);
      }
    }

    // Resolve body template variables
    if (fetchConfig.body) {
      resolved.body = this.interpolateObjectTemplates(fetchConfig.body, context);
    }

    // Inject credential headers if credentialReferenceId is provided
    if (credentialReferenceId && this.credentialStuffer) {
      try {
        const credentialData = await this.getCredential(credentialReferenceId);
        const credentialHeaders = credentialData?.headers;
        if (credentialHeaders) {
          resolved.headers = {
            ...resolved.headers,
            ...credentialHeaders,
          };

          logger.info(
            {
              credentialReferenceId,
            },
            'Added credential headers to fetch request'
          );
        }
      } catch (error) {
        logger.error(
          {
            credentialReferenceId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to resolve credentials for fetch request'
        );
        throw error;
      }
    }

    return resolved;
  }

  /**
   * Interpolate template variables in a string using TemplateEngine
   */
  private interpolateTemplate(template: string, context: TemplateContext): string {
    try {
      return TemplateEngine.render(template, context, {
        strict: false,
        preserveUnresolved: true,
      });
    } catch (error) {
      logger.error(
        {
          template,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to interpolate template variable'
      );
      return template; // Return original template on error
    }
  }

  /**
   * Interpolate template variables in an object recursively using TemplateEngine
   */
  private interpolateObjectTemplates(
    obj: Record<string, unknown>,
    context: TemplateContext
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateTemplate(value, context);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.interpolateObjectTemplates(value as Record<string, unknown>, context);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Perform HTTP request
   */
  private async performRequest(
    config: ContextFetchDefinition['fetchConfig']
  ): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      logger.debug(
        {
          url: config.url,
          method: config.method,
        },
        'Performing HTTP request'
      );

      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: AbortSignal.timeout(config.timeout || this.defaultTimeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        throw error;
      }

      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const durationMs = Date.now() - startTime;

      // Check response for errors using all configured checkers
      for (const checker of responseErrorCheckers) {
        checker(data);
      }

      return {
        data,
        source: config.url,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const requestError = error instanceof Error ? error : new Error('Unknown error');

      logger.warn(
        {
          url: config.url,
          error: requestError.message,
          durationMs,
        },
        'HTTP request failed'
      );

      throw requestError;
    }
  }

  /**
   * Transform response data using JMESPath
   */
  private transformResponse(data: unknown, transform: string): unknown {
    try {
      const result = jmespath.search(data as any, transform);
      return result;
    } catch (error) {
      logger.error(
        {
          transform,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to transform response data'
      );

      return data;
    }
  }

  /**
   * Validate response against JSON Schema
   */
  private validateResponseWithJsonSchema(
    data: unknown,
    jsonSchema: Record<string, unknown>,
    definitionId: string
  ): void {
    try {
      const isValid = validateAgainstJsonSchema(jsonSchema, data);

      if (!isValid) {
        throw new Error('Data does not match JSON Schema');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      logger.error(
        {
          definitionId,
          jsonSchema,
          error: errorMessage,
        },
        'JSON Schema response validation failed'
      );

      throw new Error(`Response validation failed: ${errorMessage}`);
    }
  }

  /**
   * Test a fetch definition without caching
   */
  async test(
    definition: ContextFetchDefinition,
    context: TemplateContext
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    durationMs: number;
  }> {
    const startTime = Date.now();

    try {
      const data = await this.fetch(definition, context);
      return {
        success: true,
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get fetcher statistics
   */
  getStats(): {
    tenantId: string;
    defaultTimeout: number;
  } {
    return {
      tenantId: this.tenantId,
      defaultTimeout: this.defaultTimeout,
    };
  }
}
