import { z } from 'zod';
import type { ContextConfigSelect, CredentialReferenceApiInsert } from '../types/index';
import { getLogger } from '../utils/logger';
import { ContextConfigApiUpdateSchema } from '../validation/schemas';
import type { DotPaths } from './validation-helpers';

const logger = getLogger('context-config');

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

type ErrorResponse = { error?: string; message?: string; details?: unknown };

type builderContextVariables = Record<string, builderFetchDefinition<z.ZodTypeAny>>;

type builderContextConfig = Omit<ContextConfigSelect, 'contextVariables'> & {
  contextVariables: builderContextVariables;
};

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

// Utility function for converting Zod schemas to JSON Schema
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    return z.toJSONSchema(zodSchema, { target: 'draft-7' });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to convert Zod schema to JSON Schema'
    );
    throw new Error('Failed to convert Zod schema to JSON Schema');
  }
}

export interface ContextConfigBuilderOptions<
  R extends z.ZodTypeAny | undefined = undefined,
  CV = Record<string, builderFetchDefinition<z.ZodTypeAny>>,
> {
  id: string;
  name: string;
  description?: string;
  requestContextSchema?: R; // Zod (optional)
  contextVariables?: CV; // Zod-based fetch defs
  tenantId?: string;
  projectId?: string;
  baseURL?: string;
}

export class ContextConfigBuilder<
  R extends z.ZodTypeAny | undefined,
  CV extends Record<string, builderFetchDefinition<z.ZodTypeAny>>,
> {
  private config: Partial<builderContextConfig>;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;

  private requestContextZod?: R;
  private builderContextVars: CV;
  private builderContextVarsZod: ExtractSchemasFromCV<CV>;

  constructor(options: ContextConfigBuilderOptions<R, CV>) {
    this.tenantId = options.tenantId || 'default';
    this.projectId = options.projectId || 'default';
    this.baseURL = process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002';
    this.builderContextVars = (options.contextVariables || {}) as CV;

    this.builderContextVarsZod = {} as ExtractSchemasFromCV<CV>;

    // Convert request headers schema to JSON schema if provided
    let requestContextSchema: any;
    if (options.requestContextSchema) {
      logger.info(
        {
          requestContextSchema: options.requestContextSchema,
        },
        'Converting request headers schema to JSON Schema for database storage'
      );

      this.requestContextZod = options.requestContextSchema;
      // It's a regular Zod schema for headers validation
      requestContextSchema = convertZodToJsonSchema(options.requestContextSchema);
    }

    // Convert contextVariables responseSchemas to JSON schemas for database storage
    const processedContextVariables: Record<string, any> = {};
    if (options.contextVariables) {
      for (const [key, definition] of Object.entries(options.contextVariables)) {
        processedContextVariables[key] = {
          ...definition,
          responseSchema: convertZodToJsonSchema(definition.responseSchema),
        };
        logger.debug(
          {
            contextVariableKey: key,
            originalSchema: definition.responseSchema,
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
      contextVariables: processedContextVariables,
    };

    logger.info(
      {
        contextConfigId: this.config.id,
        tenantId: this.tenantId,
      },
      'ContextConfig builder initialized'
    );
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

  getContextVariables(): builderContextVariables {
    return this.config.contextVariables || {};
  }

  // Builder methods for fluent API
  withRequestContextSchema(schema: any): this {
    this.config.requestContextSchema = schema;
    return this;
  }

  withContextVariable(key: string, definition: builderFetchDefinition<z.ZodTypeAny>): this {
    this.config.contextVariables = this.config.contextVariables || {};
    this.config.contextVariables[key] = definition;
    return this;
  }

  withContextVariables(variables: builderContextVariables): this {
    this.config.contextVariables = variables;
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
        `${this.baseURL}/tenants/${this.tenantId}/crud/context-configs/${this.getId()}`,
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
          `${this.baseURL}/tenants/${this.tenantId}/crud/context-configs`,
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
