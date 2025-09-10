import Ajv, { type ValidateFunction } from 'ajv';
import type { Context, Next } from 'hono';
import { ContextResolver } from '../context/ContextResolver';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { getAgentGraphWithDefaultAgent } from '../data-access/agentGraphs';
import { getContextConfigById } from '../data-access/contextConfigs';
import type { DatabaseClient } from '../db/client';
import type { ContextConfigSelect } from '../types/entities';
import { getRequestExecutionContext } from '../utils/execution';
import { getLogger } from '../utils/logger';

const logger = getLogger('context-validation');

// @ts-ignore
const ajv = new Ajv({ allErrors: true, strict: false });

// Constants for HTTP request parts
export const HTTP_REQUEST_PARTS = ['body', 'headers', 'query', 'params'] as const;
export type HttpRequestPart = (typeof HTTP_REQUEST_PARTS)[number];

// Schema compilation cache for performance
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
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  params?: Record<string, string>;
}

// Type guard for validating HTTP request objects
export function isValidHttpRequest(obj: any): obj is ParsedHttpRequest {
  return (
    obj != null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    HTTP_REQUEST_PARTS.some((key) => key in obj)
  );
}

// Cached schema compilation for performance
export function getCachedValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  if (!schemaCache.has(key)) {
    schemaCache.set(key, ajv.compile(schema));
  }
  const validator = schemaCache.get(key);
  if (!validator) {
    throw new Error('Failed to compile JSON schema');
  }
  return validator;
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
 * Filters validated context to only include keys defined in the schema
 * This prevents storing extra keys from .passthrough() schemas in the cache
 * Now supports recursive filtering of nested objects
 */
function filterContextToSchemaKeys(
  validatedContext: Record<string, any>,
  schemas: Record<string, any>
): Record<string, any> {
  const filteredContext: Record<string, any> = {};

  for (const part of HTTP_REQUEST_PARTS) {
    if (validatedContext[part] && schemas[part]) {
      const schema = schemas[part];
      const partData = validatedContext[part];

      // Use recursive filtering
      const filteredPart = filterByJsonSchema(partData, schema);

      if (filteredPart !== null && filteredPart !== undefined) {
        // Only include if the filtered result has content
        if (typeof filteredPart === 'object' && Object.keys(filteredPart).length > 0) {
          filteredContext[part] = filteredPart;
        } else if (typeof filteredPart !== 'object') {
          filteredContext[part] = filteredPart;
        }
      }
    } else if (validatedContext[part]) {
      // Part exists but no schema - still include for compatibility
      filteredContext[part] = validatedContext[part];
    }
  }

  return filteredContext;
}

/**
 * Filters legacy context to only include keys defined in the JSON schema
 * Now supports recursive filtering of nested objects
 */
function filterLegacyContextToSchemaKeys(
  validatedContext: Record<string, any>,
  jsonSchema: Record<string, any>
): Record<string, any> {
  return filterByJsonSchema(validatedContext, jsonSchema);
}

/**
 * Checks if the schema is in the new comprehensive request format
 */
export function isComprehensiveRequestSchema(schema: any): boolean {
  return (
    schema &&
    typeof schema === 'object' &&
    'schemas' in schema &&
    typeof schema.schemas === 'object'
  );
}

/**
 * Validates HTTP request parts against comprehensive schema
 */
export async function validateHttpRequestParts(
  comprehensiveSchema: any,
  httpRequest: ParsedHttpRequest
): Promise<ContextValidationResult> {
  const errors: ContextValidationError[] = [];
  const validatedParts: Record<string, any> = {};

  // Type guard validation
  if (!isValidHttpRequest(httpRequest)) {
    return {
      valid: false,
      errors: [
        {
          field: 'httpRequest',
          message:
            'Invalid HTTP request format - must contain at least one of: body, headers, query, params',
        },
      ],
    };
  }

  try {
    const { schemas, optional = [] } = comprehensiveSchema;

    // Validate each part if schema is defined
    for (const part of HTTP_REQUEST_PARTS) {
      if (schemas[part] && httpRequest[part] !== undefined) {
        try {
          const partSchema = schemas[part];
          const validate = validationHelper(partSchema);
          const isValid = validate(httpRequest[part]);

          if (isValid) {
            validatedParts[part] = httpRequest[part];
          } else {
            // Convert AJV errors for this part
            if (validate.errors) {
              for (const error of validate.errors) {
                errors.push({
                  field: `${part}.${error.instancePath || 'root'}`,
                  message: `${part} ${error.message}`,
                  value: error.data,
                });
              }
            }
          }
        } catch (validationError) {
          errors.push({
            field: part,
            message: `Failed to validate ${part}: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
          });
        }
      } else if (schemas[part] && httpRequest[part] === undefined) {
        // Check if this schema part is marked as optional
        const isPartOptional = optional.includes(part);

        if (!isPartOptional) {
          // Part is required but missing
          errors.push({
            field: part,
            message: `Required ${part} is missing`,
          });
        }
        // If optional, we simply skip it (no error, no validation)
      }
    }

    const filteredContext =
      errors.length === 0 ? filterContextToSchemaKeys(validatedParts, schemas) : undefined;

    return {
      valid: errors.length === 0,
      errors,
      validatedContext: filteredContext,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to validate comprehensive request schema'
    );

    return {
      valid: false,
      errors: [
        {
          field: 'schema',
          message: 'Failed to validate comprehensive request schema',
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
export async function validateRequestContext(
  tenantId: string,
  projectId: string,
  graphId: string,
  conversationId: string,
  parsedRequest: ParsedHttpRequest,
  dbClient: DatabaseClient,
  credentialStores?: CredentialStoreRegistry,
  legacyRequestContext?: Record<string, unknown> // legacy request context if it was included in the request body
): Promise<ContextValidationResult> {
  try {
    // Get the graph's context config
    const agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
      scopes: { tenantId, projectId },
      graphId,
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

    // Validate against the schema - handle both legacy and new formats
    try {
      const schema = contextConfig.requestContextSchema;

      // Check if it's the new comprehensive request schema format
      if (isComprehensiveRequestSchema(schema)) {
        logger.debug(
          { contextConfigId: contextConfig.id },
          'Using comprehensive HTTP request schema validation'
        );

        // For comprehensive schema, expect the requestContext to have HTTP parts
        const httpRequest = parsedRequest;
        const validationResult = await validateHttpRequestParts(schema, httpRequest);
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
      } else {
        // Legacy validation - treat as simple JSON Schema
        logger.debug({ contextConfigId: contextConfig.id }, 'Using legacy JSON schema validation');

        const jsonSchema = schema as Record<string, unknown>;
        const validate = validationHelper(jsonSchema);

        // Validate the request context
        const isValid = validate(legacyRequestContext);

        if (isValid) {
          logger.debug(
            {
              contextConfigId: contextConfig.id,
              requestContextKeys: Object.keys(legacyRequestContext as Record<string, unknown>),
            },
            'Request context validation successful'
          );

          const filteredContext = filterLegacyContextToSchemaKeys(
            legacyRequestContext as Record<string, unknown>,
            jsonSchema
          );

          return {
            valid: true,
            errors: [],
            validatedContext: filteredContext,
          };
        }
        // Convert AJV errors to our format
        const errors: ContextValidationError[] = [];

        if (validate.errors) {
          for (const error of validate.errors) {
            errors.push({
              field: error.instancePath || error.schemaPath || 'root',
              message: `${error.instancePath || 'root'} ${error.message}`,
              value: error.data,
            });
          }
        }

        logger.warn(
          {
            contextConfigId: contextConfig.id,
            legacyRequestContext,
            errors,
          },
          'Legacy request context validation failed, trying cache fallback'
        );

        // Try to fetch from cache as fallback, same as comprehensive schemas
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
          // Cache fallback failed, return original validation errors
          errors.push({
            field: 'requestContext',
            message: 'Failed to fetch request context from cache',
          });

          return {
            valid: false,
            errors,
          };
        }
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

      const body = await c.req.json();
      const conversationId = body.conversationId || '';

      // Extract HTTP parts from the request for comprehensive validation
      let url: URL;
      try {
        url = new URL(c.req.url);
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          `Invalid URL: ${c.req.url}`
        );
        return c.json({ error: 'Invalid request URL' }, 400);
      }

      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        query[key] = value;
      }

      // Get headers
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const credentialStores = c.get('credentialStores') as CredentialStoreRegistry;

      const parsedRequest = {
        body: body || {},
        headers,
        query,
        params: c.req.param() || {},
      } as ParsedHttpRequest;

      // Validate the context
      const validationResult = await validateRequestContext(
        tenantId,
        projectId,
        graphId,
        conversationId,
        parsedRequest,
        dbClient,
        credentialStores,
        body.requestContext
      );

      if (!validationResult.valid) {
        logger.warn(
          {
            tenantId,
            graphId,
            errors: validationResult.errors,
          },
          'Request context validation failed'
        );

        return c.json(
          {
            error: 'Invalid request context',
            details: validationResult.errors,
          },
          400
        );
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

      return c.json(
        {
          error: 'Context validation failed',
          message: 'Internal validation error',
        },
        500
      );
    }
  };
}
