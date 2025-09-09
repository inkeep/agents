import { z } from 'zod/v4';
import type { ContextConfigSelect, FetchDefinition } from '../types/index';
import type {
  ContextFetchDefinition,
  RequestSchemaConfig,
  RequestSchemaDefinition,
} from '../types/utility';
import { getLogger } from '../utils/logger';
import { ContextConfigApiUpdateSchema } from '../validation/schemas';

const logger = getLogger('context-config');

type ErrorResponse = { error?: string; message?: string; details?: unknown };

// Factory function to create a comprehensive request schema
export function createRequestSchema(
  schemas: RequestSchemaDefinition,
  config?: { optional?: ('body' | 'headers' | 'query' | 'params')[] }
) {
  const schemaConfig: RequestSchemaConfig = {
    schemas,
    optional: config?.optional,
  };

  return {
    schemas,
    config: schemaConfig,
    // Convert all schemas to JSON Schema for storage
    toJsonSchema: () => {
      const jsonSchemas: Record<string, any> = {};

      if (schemas.body) {
        jsonSchemas.body = convertZodToJsonSchema(schemas.body);
      }
      if (schemas.headers) {
        jsonSchemas.headers = convertZodToJsonSchema(schemas.headers);
      }
      if (schemas.query) {
        jsonSchemas.query = convertZodToJsonSchema(schemas.query);
      }
      if (schemas.params) {
        jsonSchemas.params = convertZodToJsonSchema(schemas.params);
      }

      return {
        schemas: jsonSchemas,
        optional: schemaConfig.optional,
      };
    },
    // Get the Zod schemas for runtime validation
    getZodSchemas: () => schemas,
    // Get the configuration including optional flags
    getConfig: () => schemaConfig,
  };
}

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

// Builder configuration interface
export interface ContextConfigBuilderOptions {
  id: string;
  name: string;
  description?: string;
  requestContextSchema?: z.ZodSchema<any> | ReturnType<typeof createRequestSchema>; // Zod schema or comprehensive request schema
  contextVariables?: Record<string, ContextFetchDefinition>;
  tenantId?: string;
  projectId?: string;
}

export class ContextConfigBuilder {
  private config: Partial<ContextConfigSelect>;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  constructor(options: ContextConfigBuilderOptions) {
    this.tenantId = options.tenantId || 'default';
    this.projectId = options.projectId || 'default';
    this.baseURL = process.env.INKEEP_MANAGEMENT_API_URL || 'http://localhost:3002';

    // Convert request schema to JSON schema if provided
    let requestContextSchema: any;
    if (options.requestContextSchema) {
      logger.info(
        {
          requestContextSchema: options.requestContextSchema,
        },
        'Converting request schema to JSON Schema for database storage'
      );

      // Check if it's a createRequestSchema result or a regular Zod schema
      if (
        typeof options.requestContextSchema === 'object' &&
        'toJsonSchema' in options.requestContextSchema
      ) {
        // It's a createRequestSchema result
        requestContextSchema = options.requestContextSchema.toJsonSchema();
      } else {
        // It's a regular Zod schema
        requestContextSchema = convertZodToJsonSchema(options.requestContextSchema);
      }
    }

    this.config = {
      id: options.id,
      tenantId: this.tenantId,
      projectId: this.projectId,
      name: options.name,
      description: options.description || '',
      requestContextSchema,
      contextVariables: options.contextVariables || {},
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

  getContextVariables(): Record<string, ContextFetchDefinition> {
    return this.config.contextVariables || {};
  }

  /**
   * Convert the builder to a plain object for database operations
   */
  toObject(): ContextConfigSelect {
    return {
      id: this.getId(),
      tenantId: this.tenantId,
      projectId: this.projectId,
      name: this.getName(),
      description: this.getDescription(),
      requestContextSchema: this.getRequestContextSchema(),
      contextVariables: this.getContextVariables(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Builder methods for fluent API
  withRequestContextSchema(schema: any): this {
    this.config.requestContextSchema = schema;
    return this;
  }

  withContextVariable(key: string, definition: ContextFetchDefinition): this {
    this.config.contextVariables = this.config.contextVariables || {};
    this.config.contextVariables[key] = definition;
    return this;
  }

  withContextVariables(variables: Record<string, ContextFetchDefinition>): this {
    this.config.contextVariables = variables;
    return this;
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
    } catch (error) {
      return { error: `HTTP ${response.status} ${response.statusText}` } as ErrorResponse;
    }
  }
}

// Factory function for creating context configs - similar to agent() and agentGraph()
export function contextConfig(options: ContextConfigBuilderOptions): ContextConfigBuilder {
  return new ContextConfigBuilder(options);
}

// Helper function to create fetch definitions
export function fetchDefinition(options: FetchDefinition | any): ContextFetchDefinition {
  // Handle both the correct FetchDefinition format and the legacy direct format
  const fetchConfig = options.fetchConfig || {
    url: options.url,
    method: options.method,
    headers: options.headers,
    body: options.body,
    transform: options.transform,
    timeout: options.timeout,
  };

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
    responseSchema: options.responseSchema
      ? convertZodToJsonSchema(options.responseSchema)
      : undefined,
    defaultValue: options.defaultValue,
    credentialReferenceId: options.credential?.id,
  };
}
