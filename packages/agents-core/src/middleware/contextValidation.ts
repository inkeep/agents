import Ajv, { type ValidateFunction } from 'ajv';
import type { Context, Next } from 'hono';
import { ContextResolver } from '../context/ContextResolver';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { getAgentGraphWithDefaultAgent } from '../data-access/agentGraphs';
import { getContextConfigById } from '../data-access/contextConfigs';
import type { DatabaseClient } from '../db/client';
import type { ContextConfigSelect } from '../types/entities';
import { createApiError } from '../utils/error';
import { getRequestExecutionContext } from '../utils/execution';
import { getLogger } from '../utils/logger';

const logger = getLogger('context-validation');

const ajv = new Ajv({ allErrors: true, strict: false });

// Constants for HTTP request parts (simplified to headers only)
export const HTTP_REQUEST_PARTS = ['headers'] as const;
export type HttpRequestPart = (typeof HTTP_REQUEST_PARTS)[number];

// Schema compilation cache for performance with LRU eviction
const MAX_SCHEMA_CACHE_SIZE = 1000;
const schemaCache = new Map<string, ValidateFunction>();

export interface ContextValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ContextValidationResult {
  valid: boolean;
  errors: ContextValidationError[];
  validatedContext?: Record<string, unknown> | ParsedHttpRequest;
}

export interface ParsedHttpRequest {
  headers?: Record<string, string>;
}

// Type guard for validating HTTP request objects
export function isValidHttpRequest(obj: any): obj is ParsedHttpRequest {
  return obj != null && typeof obj === 'object' && !Array.isArray(obj) && 'headers' in obj;
}

// Cached schema compilation for performance with LRU eviction
export function getCachedValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);

  // Check if schema exists in cache
  if (schemaCache.has(key)) {
    // LRU: Move to end by deleting and re-adding (marks as recently used)
    const validator = schemaCache.get(key);
    if (!validator) {
      throw new Error('Unexpected: validator not found in cache after has() check');
    }
    schemaCache.delete(key);
    schemaCache.set(key, validator);
    return validator;
  }

  // Evict oldest entry if cache is at size limit
  if (schemaCache.size >= MAX_SCHEMA_CACHE_SIZE) {
    const firstKey = schemaCache.keys().next().value;
    if (firstKey) {
      schemaCache.delete(firstKey);
    }
  }

  // Compile new schema
  const permissiveSchema = makeSchemaPermissive(schema);

  const validator = ajv.compile(permissiveSchema);
  schemaCache.set(key, validator);

  return validator;
}

// Helper function to recursively make schemas permissive
function makeSchemaPermissive(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const permissiveSchema = { ...schema };

  // For object schemas, set additionalProperties: true
  if (permissiveSchema.type === 'object') {
    permissiveSchema.additionalProperties = true;

    // Recursively apply to nested object properties
    if (permissiveSchema.properties && typeof permissiveSchema.properties === 'object') {
      const newProperties: any = {};
      for (const [key, value] of Object.entries(permissiveSchema.properties)) {
        newProperties[key] = makeSchemaPermissive(value);
      }
      permissiveSchema.properties = newProperties;
    }
  }

  // For array schemas, apply to items
  if (permissiveSchema.type === 'array' && permissiveSchema.items) {
    permissiveSchema.items = makeSchemaPermissive(permissiveSchema.items);
  }

  // Handle oneOf, anyOf, allOf
  if (permissiveSchema.oneOf) {
    permissiveSchema.oneOf = permissiveSchema.oneOf.map(makeSchemaPermissive);
  }
  if (permissiveSchema.anyOf) {
    permissiveSchema.anyOf = permissiveSchema.anyOf.map(makeSchemaPermissive);
  }
  if (permissiveSchema.allOf) {
    permissiveSchema.allOf = permissiveSchema.allOf.map(makeSchemaPermissive);
  }

  return permissiveSchema;
}

// Validation wrapper for testing purposes (now uses cache)
export function validationHelper(jsonSchema: Record<string, unknown>) {
  return getCachedValidator(jsonSchema);
}

export function validateAgainstJsonSchema(jsonSchema: Record<string, unknown>, context: unknown) {
  logger.debug({ jsonSchema, context }, 'Validating context against JSON Schema');
  const validate = validationHelper(jsonSchema);
  return validate(context);
}

/**
 * Recursively filters data based on JSON schema properties
 */
function filterByJsonSchema(data: any, schema: any): any {
  if (!schema || data === null || data === undefined) {
    return data;
  }

  // Handle object schemas
  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof data === 'object' &&
    !Array.isArray(data)
  ) {
    const filtered: Record<string, any> = {};

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        // Recursively filter nested objects
        filtered[key] = filterByJsonSchema(data[key], propSchema);
      }
    }

    return filtered;
  }

  // Handle array schemas
  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    return data.map((item) => filterByJsonSchema(item, schema.items));
  }

  // Handle anyOf/oneOf schemas (take the first that might match)
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    // For anyOf, try to find the best matching schema
    for (const subSchema of schema.anyOf) {
      if (subSchema.type && typeof data === subSchema.type) {
        return filterByJsonSchema(data, subSchema);
      }
    }
    // If no specific type match, use the first schema
    return filterByJsonSchema(data, schema.anyOf[0]);
  }

  // For primitive types or schemas without properties, return as-is
  return data;
}

/**
 * Filters validated context to only include keys defined in the headers schema
 * This prevents storing extra keys from .passthrough() schemas in the cache
 */
function filterContextToSchemaKeys(
  validatedContext: Record<string, any>,
  headersSchema: any
): Record<string, any> {
  if (!headersSchema || !validatedContext) {
    return validatedContext;
  }

  // Use recursive filtering directly on the headers data
  const filteredHeaders = filterByJsonSchema(validatedContext, headersSchema);

  if (filteredHeaders !== null && filteredHeaders !== undefined) {
    // Only include if the filtered result has content
    if (typeof filteredHeaders === 'object' && Object.keys(filteredHeaders).length > 0) {
      return filteredHeaders;
    } else if (typeof filteredHeaders !== 'object') {
      return filteredHeaders;
    }
  }

  return {};
}

/**
 * Validates HTTP request headers against schema
 */
export async function validateHttpRequestHeaders(
  headersSchema: any,
  httpRequest: ParsedHttpRequest
): Promise<ContextValidationResult> {
  const errors: ContextValidationError[] = [];
  let validatedContext: Record<string, any> = {};

  // Type guard validation
  if (!isValidHttpRequest(httpRequest)) {
    return {
      valid: false,
      errors: [
        {
          field: 'httpRequest',
          message: 'Invalid HTTP request format - must contain headers',
        },
      ],
    };
  }

  try {
    if (headersSchema && httpRequest.headers !== undefined) {
      try {
        const validate = validationHelper(headersSchema);
        const isValid = validate(httpRequest.headers);

        if (isValid) {
          validatedContext = httpRequest.headers;
        } else {
          // Convert AJV errors for headers
          if (validate.errors) {
            for (const error of validate.errors) {
              errors.push({
                field: `headers.${error.instancePath || 'root'}`,
                message: `headers ${error.message}`,
                value: error.data,
              });
            }
          }
        }
      } catch (validationError) {
        errors.push({
          field: 'headers',
          message: `Failed to validate headers: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
        });
      }
    }

    const filteredContext =
      errors.length === 0 ? filterContextToSchemaKeys(validatedContext, headersSchema) : undefined;

    return {
      valid: errors.length === 0,
      errors,
      validatedContext: filteredContext,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to validate headers schema'
    );

    return {
      valid: false,
      errors: [
        {
          field: 'schema',
          message: 'Failed to validate headers schema',
        },
      ],
    };
  }
}

/**
 * Fetches the request context from the context cache if it exists
 */
async function fetchExistingRequestContext({
  tenantId,
  projectId,
  contextConfig,
  conversationId,
  dbClient,
  credentialStores,
}: {
  tenantId: string;
  projectId: string;
  contextConfig: ContextConfigSelect;
  conversationId: string;
  dbClient: DatabaseClient;
  credentialStores?: CredentialStoreRegistry;
}) {
  //If no request context is provided, but this is a continued conversation first try to get the request context from the context cache
  const contextResolver = new ContextResolver(tenantId, projectId, dbClient, credentialStores);
  const requestContext = await contextResolver.resolveRequestContext(
    conversationId,
    contextConfig.id
  );
  if (Object.keys(requestContext).length > 0) {
    return {
      valid: true,
      errors: [],
      validatedContext: requestContext,
    };
  }
  throw new Error(
    'No request context found in cache. Please provide requestContext in request body.'
  );
}

/**
 * Validates request context against the JSON Schema stored in context configuration
 * Supports both legacy simple schemas and new comprehensive HTTP request schemas
 */
export async function validateRequestContext({
  tenantId,
  projectId,
  graphId,
  conversationId,
  parsedRequest,
  dbClient,
  credentialStores,
}: {
  tenantId: string;
  projectId: string;
  graphId: string;
  conversationId: string;
  parsedRequest: ParsedHttpRequest;
  dbClient: DatabaseClient;
  credentialStores?: CredentialStoreRegistry;
}): Promise<ContextValidationResult> {
  try {
    // Get the graph's context config
    const agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
      scopes: { tenantId, projectId, graphId },
    });

    if (!agentGraph?.contextConfigId) {
      // No context config means no validation needed
      logger.debug({ graphId }, 'No context config found for graph, skipping validation');
      return {
        valid: true,
        errors: [],
        validatedContext: parsedRequest,
      };
    }

    // Get context configuration
    const contextConfig = await getContextConfigById(dbClient)({
      scopes: { tenantId, projectId },
      id: agentGraph.contextConfigId,
    });

    if (!contextConfig) {
      logger.warn({ contextConfigId: agentGraph.contextConfigId }, 'Context config not found');
      return {
        valid: false,
        errors: [
          {
            field: 'contextConfig',
            message: 'Context configuration not found',
          },
        ],
      };
    }

    // If no request context schema is defined, any context is valid
    if (!contextConfig.requestContextSchema) {
      logger.debug(
        { contextConfigId: contextConfig.id },
        'No request context schema defined, accepting any context'
      );
      return {
        valid: true,
        errors: [],
        validatedContext: parsedRequest,
      };
    }

    // Validate headers against the schema
    try {
      const schema = contextConfig.requestContextSchema;
      logger.debug({ contextConfigId: contextConfig.id }, 'Using headers schema validation');

      // For headers schema, expect the requestContext to have headers
      const httpRequest = parsedRequest;
      const validationResult = await validateHttpRequestHeaders(schema, httpRequest);
      if (validationResult.valid) {
        return validationResult;
      }
      //If the request context is not valid, try to fetch it from the context cache
      try {
        return await fetchExistingRequestContext({
          tenantId,
          projectId,
          contextConfig,
          conversationId,
          dbClient,
          credentialStores,
        });
      } catch (_error) {
        validationResult.errors.push({
          field: 'requestContext',
          message: 'Failed to fetch request context from cache',
        });
        return validationResult;
      }
    } catch (error) {
      logger.error(
        {
          contextConfigId: contextConfig.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to compile or validate schema'
      );

      return {
        valid: false,
        errors: [
          {
            field: 'schema',
            message: 'Invalid schema definition or validation error',
          },
        ],
      };
    }
  } catch (error) {
    logger.error(
      {
        tenantId,
        graphId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to validate request context'
    );

    return {
      valid: false,
      errors: [
        {
          field: 'validation',
          message: 'Context validation failed due to internal error',
        },
      ],
    };
  }
}

/**
 * Hono middleware for context validation
 */
export function contextValidationMiddleware(dbClient: DatabaseClient) {
  return async (c: Context, next: Next) => {
    try {
      const executionContext = getRequestExecutionContext(c);
      let { tenantId, projectId, graphId } = executionContext;
      if (!tenantId || !projectId || !graphId) {
        // Fallback to path parameters for to handle management api routes
        tenantId = c.req.param('tenantId');
        projectId = c.req.param('projectId');
        graphId = c.req.param('graphId');
      }

      if (!tenantId || !projectId || !graphId) {
        return next(); // Let the main handler deal with missing params
      }

      // Get parsed body from middleware (shared across all handlers)
      const body = (c as any).get('requestBody') || {};
      const conversationId = body.conversationId || '';

      // Extract headers from the request
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const credentialStores = c.get('credentialStores') as CredentialStoreRegistry;

      const parsedRequest = {
        headers,
      } as ParsedHttpRequest;

      // Validate the context
      const validationResult = await validateRequestContext({
        tenantId,
        projectId,
        graphId,
        conversationId,
        parsedRequest,
        dbClient,
        credentialStores,
      });

      if (!validationResult.valid) {
        logger.warn(
          {
            tenantId,
            graphId,
            errors: validationResult.errors,
          },
          'Request context validation failed'
        );
        const errorMessage = `Invalid request context: ${validationResult.errors.map((e) => `${e.field}: ${e.message}`).join(', ')}`;
        throw createApiError({
          code: 'bad_request',
          message: errorMessage,
        });
      }

      // Store validated context for use in the main handler
      (c as any).set('validatedContext', validationResult.validatedContext);

      logger.debug(
        {
          tenantId,
          graphId,
          contextKeys: Object.keys(validationResult.validatedContext || {}),
        },
        'Request context validation successful'
      );

      return next();
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Context validation middleware error'
      );
      throw createApiError({
        code: 'internal_server_error',
        message: 'Context validation failed',
      });
    }
  };
}
