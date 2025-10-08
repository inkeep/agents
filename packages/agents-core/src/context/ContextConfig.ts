import { z } from 'zod';
import type {
  ContextConfigSelect,
  ContextFetchDefinition,
  CredentialReferenceApiInsert,
} from '../types/index';
import { getLogger } from '../utils/logger';
import { convertZodToJsonSchema } from '../utils/schema-conversion';
import { ContextConfigApiUpdateSchema } from '../validation/schemas';
import type { DotPaths } from './validation-helpers';

const logger = getLogger('context-config');

type ErrorResponse = { error?: string; message?: string; details?: unknown };

// Extract Zod schemas from contextVariables
export type ExtractSchemasFromCV<CV> = {
  [K in keyof CV]: CV[K] extends builderFetchDefinition<infer S> ? S : never;
};

export type InferContextFromSchemas<CZ> = {
  [K in keyof CZ]: CZ[K] extends z.ZodTypeAny ? z.infer<CZ[K]> : never;
};
export type MergeRequestContext<R extends z.ZodTypeAny | undefined> = R extends z.ZodTypeAny
  ? { requestContext: z.infer<R> }
  : {};
type FullContext<R extends z.ZodTypeAny | undefined, CV> = MergeRequestContext<R> &
  InferContextFromSchemas<ExtractSchemasFromCV<CV>>;

export type AllowedPaths<R extends z.ZodTypeAny | undefined, CV> = DotPaths<FullContext<R, CV>>;

// Request Context Schema Builder
export interface RequestContextSchemaBuilderOptions<R extends z.ZodTypeAny> {
  schema: R;
}

export class RequestContextSchemaBuilder<R extends z.ZodTypeAny> {
  private schema: R;

  constructor(options: RequestContextSchemaBuilderOptions<R>) {
    this.schema = options.schema;
  }

  /** Template function for request context paths with type-safe autocomplete */
  toTemplate<P extends DotPaths<z.infer<R>>>(path: P): `{{requestContext.${P}}}` {
    return `{{requestContext.${path}}}` as `{{requestContext.${P}}}`;
  }

  getSchema(): R {
    return this.schema;
  }

  getJsonSchema(): Record<string, unknown> {
    return convertZodToJsonSchema(this.schema);
  }
}

// Context system type definitions
export type builderFetchDefinition<R extends z.ZodTypeAny> = {
  id: string;
  name?: string;
  trigger: 'initialization' | 'invocation';
  fetchConfig: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    transform?: string;
    timeout?: number;
  };
  responseSchema: R; // Zod Schema for validating HTTP response
  defaultValue?: unknown;
  credentialReference?: CredentialReferenceApiInsert; // Reference to credential store for secure credential resolution
};


export interface ContextConfigBuilderOptions<
  R extends z.ZodTypeAny | undefined = undefined,
  CV = Record<string, builderFetchDefinition<z.ZodTypeAny>>,
> {
  id: string;
  name: string;
  description?: string;
  requestContextSchema?: R | RequestContextSchemaBuilder<R extends z.ZodTypeAny ? R : z.ZodTypeAny>;
  contextVariables?: CV; // Zod-based fetch defs
  tenantId?: string;
  projectId?: string;
  graphId?: string;
  baseURL?: string;
}

export class ContextConfigBuilder<
  R extends z.ZodTypeAny | undefined,
  CV extends Record<string, builderFetchDefinition<z.ZodTypeAny>>,
> {
  private config: Partial<ContextConfigSelect>;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private graphId: string;

  constructor(options: ContextConfigBuilderOptions<R, CV>) {
    this.tenantId = options.tenantId || 'default';
    this.projectId = options.projectId || 'default';
    this.graphId = options.graphId || 'default';
    this.baseURL = process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002';

    // Convert request headers schema to JSON schema if provided
    let requestContextSchema: any;
    if (options.requestContextSchema) {
      // Handle both RequestContextSchemaBuilder and direct Zod schema
      const actualSchema =
        options.requestContextSchema instanceof RequestContextSchemaBuilder
          ? options.requestContextSchema.getSchema()
          : options.requestContextSchema;

      logger.info(
        {
          requestContextSchema: options.requestContextSchema,
        },
        'Converting request headers schema to JSON Schema for database storage'
      );

      // Convert to JSON schema for database storage
      requestContextSchema = convertZodToJsonSchema(actualSchema);
    }

    // Convert contextVariables responseSchemas to JSON schemas for database storage
    const processedContextVariables: Record<string, any> = {};
    if (options.contextVariables) {
      for (const [key, definition] of Object.entries(options.contextVariables)) {
        // Convert builderFetchDefinition to ContextFetchDefinition format
        const { credentialReference, ...rest } = definition;

        // Handle both direct credentialReference and pre-processed credentialReferenceId
        const credentialReferenceId =
          credentialReference?.id || (rest as any).credentialReferenceId;

        processedContextVariables[key] = {
          ...rest,
          responseSchema: convertZodToJsonSchema(definition.responseSchema),
          credentialReferenceId,
        };
        logger.debug(
          {
            contextVariableKey: key,
            originalSchema: definition.responseSchema,
            credentialReferenceId,
          },
          'Converting contextVariable responseSchema to JSON Schema for database storage'
        );
      }
    }

    this.config = {
      id: options.id,
      tenantId: this.tenantId,
      projectId: this.projectId,
      name: options.name,
      description: options.description || '',
      requestContextSchema,
      contextVariables: processedContextVariables as Record<string, ContextFetchDefinition>,
    };

    logger.info(
      {
        contextConfigId: this.config.id,
        tenantId: this.tenantId,
      },
      'ContextConfig builder initialized'
    );
  }

  /**
   * Set the context (tenantId, projectId, graphId) for this context config
   * Called by graph.setConfig() when the graph is configured
   */
  setContext(tenantId: string, projectId: string, graphId: string, baseURL: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.graphId = graphId;
    this.baseURL = baseURL;
    // Update the config object as well
    this.config.tenantId = tenantId;
    this.config.projectId = projectId;
    this.config.graphId = graphId;

    logger.info(
      {
        contextConfigId: this.config.id,
        tenantId: this.tenantId,
        projectId: this.projectId,
        graphId: this.graphId,
      },
      'ContextConfig context updated'
    );
  }

  /**
   * Convert the builder to a plain object for database operations
   */
  toObject(): ContextConfigSelect {
    return {
      id: this.getId(),
      tenantId: this.tenantId,
      projectId: this.projectId,
      graphId: this.graphId,
      name: this.getName(),
      description: this.getDescription(),
      requestContextSchema: this.getRequestContextSchema(),
      contextVariables: this.getContextVariables(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Getter methods
  getId(): string {
    if (!this.config.id) {
      throw new Error('Context config ID is not set');
    }
    return this.config.id;
  }

  getName(): string {
    if (!this.config.name) {
      throw new Error('Context config name is not set');
    }
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description || '';
  }

  getRequestContextSchema() {
    return this.config.requestContextSchema || null;
  }

  getContextVariables(): Record<string, ContextFetchDefinition> {
    return this.config.contextVariables || {};
  }

  // Builder methods for fluent API
  withRequestContextSchema(schema: any): this {
    this.config.requestContextSchema = schema;
    return this;
  }

  /** 4) The function you ship: path autocomplete + validation, returns {{path}} */
  toTemplate<P extends AllowedPaths<R, CV>>(path: P): `{{${P}}}` {
    return `{{${path}}}` as `{{${P}}}`;
  }
  // Validation method
  validate(): { valid: boolean; errors: string[] } {
    try {
      // Validate 'requestContext' key is not used in contextVariables
      const contextVariables = this.config.contextVariables || {};
      if ('requestContext' in contextVariables) {
        return {
          valid: false,
          errors: [
            "The key 'requestContext' is reserved for the request context and cannot be used in contextVariables",
          ],
        };
      }

      ContextConfigApiUpdateSchema.parse({
        id: this.config.id,
        name: this.config.name,
        description: this.config.description,
        requestContextSchema: this.config.requestContextSchema,
        contextVariables: this.config.contextVariables,
      });
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  // Initialize and save to database
  async init(): Promise<void> {
    // Validate the configuration
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Context config validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      await this.upsertContextConfig();
      logger.info(
        {
          contextConfigId: this.getId(),
        },
        'Context config initialized successfully'
      );
    } catch (error) {
      logger.error(
        {
          contextConfigId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize context config'
      );
      throw error;
    }
  }

  // Private method to upsert context config
  private async upsertContextConfig(): Promise<void> {
    const configData = {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      requestContextSchema: this.getRequestContextSchema(),
      contextVariables: this.getContextVariables(),
    };

    try {
      // First try to update (in case config exists)
      const updateResponse = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/graphs/${this.graphId}/context-configs/${this.getId()}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configData),
        }
      );

      if (updateResponse.ok) {
        logger.info(
          {
            contextConfigId: this.getId(),
          },
          'Context config updated successfully'
        );
        return;
      }

      // If update failed with 404, config doesn't exist - create it
      if (updateResponse.status === 404) {
        logger.info(
          {
            contextConfigId: this.getId(),
          },
          'Context config not found, creating new config'
        );

        const createResponse = await fetch(
          `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/graphs/${this.graphId}/context-configs`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData),
          }
        );

        if (!createResponse.ok) {
          const errorData = await this.parseErrorResponse(createResponse);
          throw new Error(
            `Failed to create context config (${createResponse.status}): ${errorData.message || errorData.error || 'Unknown error'}`
          );
        }

        logger.info(
          {
            contextConfigId: this.getId(),
          },
          'Context config created successfully'
        );
        return;
      }

      // Update failed for some other reason
      const errorData = await this.parseErrorResponse(updateResponse);
      throw new Error(
        `Failed to update context config (${updateResponse.status}): ${errorData.message || errorData.error || 'Unknown error'}`
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Network error while upserting context config: ${String(error)}`);
    }
  }

  // Helper method to parse error responses
  private async parseErrorResponse(response: Response): Promise<ErrorResponse> {
    try {
      const contentType = response.headers?.get('content-type');
      if (contentType?.includes('application/json')) {
        return (await response.json()) as ErrorResponse;
      }
      const text = await response.text();
      return { error: text || `HTTP ${response.status} ${response.statusText}` } as ErrorResponse;
    } catch (_error) {
      return { error: `HTTP ${response.status} ${response.statusText}` } as ErrorResponse;
    }
  }
}

// Factory function for creating context configs - similar to agent() and agentGraph()
export function contextConfig<
  R extends z.ZodTypeAny | undefined = undefined,
  CV extends Record<string, builderFetchDefinition<z.ZodTypeAny>> = Record<
    string,
    builderFetchDefinition<z.ZodTypeAny>
  >,
>(
  options: ContextConfigBuilderOptions<R, CV> & { contextVariables?: CV }
): ContextConfigBuilder<R, CV> {
  return new ContextConfigBuilder<R, CV>(options);
}

// Factory function for creating request context schema builders
export function requestContextSchema<R extends z.ZodTypeAny>(
  options: RequestContextSchemaBuilderOptions<R>
): RequestContextSchemaBuilder<R> {
  return new RequestContextSchemaBuilder<R>(options);
}

// Helper function to create fetch definitions
export function fetchDefinition<R extends z.ZodTypeAny>(
  options: builderFetchDefinition<R>
): Omit<builderFetchDefinition<R>, 'credentialReference'> & {
  credentialReferenceId?: string;
} {
  // Handle both the correct FetchDefinition format and the legacy direct format
  const fetchConfig = options.fetchConfig;

  return {
    id: options.id,
    name: options.name,
    trigger: options.trigger,
    fetchConfig: {
      url: fetchConfig.url,
      method: fetchConfig.method,
      headers: fetchConfig.headers,
      body: fetchConfig.body,
      transform: fetchConfig.transform,
      timeout: fetchConfig.timeout,
    },
    responseSchema: options.responseSchema,
    defaultValue: options.defaultValue,
    credentialReferenceId: options.credentialReference?.id,
  };
}
