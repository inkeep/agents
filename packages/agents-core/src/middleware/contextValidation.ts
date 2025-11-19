import Ajv, { type ValidateFunction } from 'ajv';
import type { Context, Next } from 'hono';
import { ContextResolver } from '../context/ContextResolver';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import { getAgentWithDefaultSubAgent } from '../data-access/agents';
import { getContextConfigById } from '../data-access/contextConfigs';
import type { DatabaseClient } from '../db/client';
import { executeInBranch } from '../dolt/branch-scoped-execution';
import type { ContextConfigSelect } from '../types/entities';
import { createApiError } from '../utils/error';
import { getRequestExecutionContext } from '../utils/execution';

import { getLogger } from '../utils/logger';

const logger = getLogger('context-validation');

const ajv = new Ajv({ allErrors: true, strict: false });

export const HTTP_REQUEST_PARTS = ['headers'] as const;
export type HttpRequestPart = (typeof HTTP_REQUEST_PARTS)[number];

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

export function isValidHttpRequest(obj: any): obj is ParsedHttpRequest {
  return obj != null && typeof obj === 'object' && !Array.isArray(obj) && 'headers' in obj;
}

export function getCachedValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);

  if (schemaCache.has(key)) {
    const validator = schemaCache.get(key);
    if (!validator) {
      throw new Error('Unexpected: validator not found in cache after has() check');
    }
    schemaCache.delete(key);
    schemaCache.set(key, validator);
    return validator;
  }

  if (schemaCache.size >= MAX_SCHEMA_CACHE_SIZE) {
    const firstKey = schemaCache.keys().next().value;
    if (firstKey) {
      schemaCache.delete(firstKey);
    }
  }

  const permissiveSchema = makeSchemaPermissive(schema);

  const validator = ajv.compile(permissiveSchema);
  schemaCache.set(key, validator);

  return validator;
}

function makeSchemaPermissive(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const permissiveSchema = { ...schema };

  if (permissiveSchema.type === 'object') {
    permissiveSchema.additionalProperties = true;

    if (permissiveSchema.properties && typeof permissiveSchema.properties === 'object') {
      const newProperties: any = {};
      for (const [key, value] of Object.entries(permissiveSchema.properties)) {
        newProperties[key] = makeSchemaPermissive(value);
      }
      permissiveSchema.properties = newProperties;
    }
  }

  if (permissiveSchema.type === 'array' && permissiveSchema.items) {
    permissiveSchema.items = makeSchemaPermissive(permissiveSchema.items);
  }

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

export function validationHelper(jsonSchema: Record<string, unknown>) {
  return getCachedValidator(jsonSchema);
}

export function validateAgainstJsonSchema(jsonSchema: Record<string, unknown>, context: unknown) {
  const validate = validationHelper(jsonSchema);
  return validate(context);
}

function filterByJsonSchema(data: any, schema: any): any {
  if (!schema || data === null || data === undefined) {
    return data;
  }

  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof data === 'object' &&
    !Array.isArray(data)
  ) {
    const filtered: Record<string, any> = {};

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        filtered[key] = filterByJsonSchema(data[key], propSchema);
      }
    }

    return filtered;
  }

  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    return data.map((item) => filterByJsonSchema(item, schema.items));
  }

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    for (const subSchema of schema.anyOf) {
      if (subSchema.type && typeof data === subSchema.type) {
        return filterByJsonSchema(data, subSchema);
      }
    }
    return filterByJsonSchema(data, schema.anyOf[0]);
  }

  return data;
}

function filterContextToSchemaKeys(
  validatedContext: Record<string, any>,
  headersSchema: any
): Record<string, any> {
  if (!headersSchema || !validatedContext) {
    return validatedContext;
  }

  const filteredHeaders = filterByJsonSchema(validatedContext, headersSchema);

  if (filteredHeaders !== null && filteredHeaders !== undefined) {
    if (typeof filteredHeaders === 'object' && Object.keys(filteredHeaders).length > 0) {
      return filteredHeaders;
    }
    if (typeof filteredHeaders !== 'object') {
      return filteredHeaders;
    }
  }

  return {};
}

export async function validateHttpRequestHeaders(
  headersSchema: any,
  httpRequest: ParsedHttpRequest
): Promise<ContextValidationResult> {
  const errors: ContextValidationError[] = [];
  let validatedContext: Record<string, any> = {};

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

async function fetchExistingHeaders({
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
  const contextResolver = new ContextResolver(tenantId, projectId, dbClient, credentialStores);
  const headers = await contextResolver.resolveHeaders(conversationId, contextConfig.id);
  if (Object.keys(headers).length > 0) {
    return {
      valid: true,
      errors: [],
      validatedContext: headers,
    };
  }
  throw new Error('No headers found in cache. Please provide headers in request.');
}

export async function validateHeaders({
  tenantId,
  projectId,
  agentId,
  conversationId,
  parsedRequest,
  dbClient,
  credentialStores,
}: {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  parsedRequest: ParsedHttpRequest;
  dbClient: DatabaseClient;
  credentialStores?: CredentialStoreRegistry;
}): Promise<ContextValidationResult> {
  try {
    logger.debug({ tenantId, projectId, agentId }, 'Validating headers');
    const agent = await getAgentWithDefaultSubAgent(dbClient)({
      scopes: { tenantId, projectId, agentId: agentId },
    });
    logger.debug({ agent }, 'Agent found');
    if (!agent?.contextConfigId) {
      logger.debug({ agentId }, 'No context config found for agent, skipping validation');
      return {
        valid: true,
        errors: [],
        validatedContext: parsedRequest,
      };
    }

    const contextConfig = await getContextConfigById(dbClient)({
      scopes: { tenantId, projectId, agentId: agentId },
      id: agent.contextConfigId,
    });

    if (!contextConfig) {
      logger.warn({ contextConfigId: agent.contextConfigId }, 'Context config not found');
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

    if (!contextConfig.headersSchema) {
      logger.debug(
        { contextConfigId: contextConfig.id },
        'No headers schema defined, accepting any context'
      );
      return {
        valid: true,
        errors: [],
        validatedContext: parsedRequest,
      };
    }

    try {
      const schema = contextConfig.headersSchema;
      logger.debug({ contextConfigId: contextConfig.id }, 'Using headers schema validation');

      const httpRequest = parsedRequest;
      const validationResult = await validateHttpRequestHeaders(schema, httpRequest);
      if (validationResult.valid) {
        return validationResult;
      }
      try {
        return await fetchExistingHeaders({
          tenantId,
          projectId,
          contextConfig,
          conversationId,
          dbClient,
          credentialStores,
        });
      } catch (_error) {
        validationResult.errors.push({
          field: 'headers',
          message: 'Failed to fetch headers from cache',
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
        agentId: agentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to validate headers'
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

export function contextValidationMiddleware(dbClient: DatabaseClient) {
  return async (c: Context, next: Next) => {
    try {
      const executionContext = getRequestExecutionContext(c);
      let { tenantId, projectId, agentId, ref } = executionContext;
      if (!tenantId || !projectId || !agentId) {
        tenantId = c.req.param('tenantId');
        projectId = c.req.param('projectId');
        agentId = c.req.param('agentId');
      }

      if (!tenantId || !projectId || !agentId) {
        return next();
      }

      const body = (c as any).get('requestBody') || {};
      const conversationId = body.conversationId || '';

      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const credentialStores = c.get('credentialStores') as CredentialStoreRegistry;

      const parsedRequest = {
        headers,
      } as ParsedHttpRequest;

      const validationResult = await executeInBranch({ dbClient, ref }, async (db) => {
        return await validateHeaders({
          tenantId,
          projectId,
          agentId,
          conversationId,
          parsedRequest,
          dbClient: db,
          credentialStores,
        });
      });

      if (!validationResult.valid) {
        logger.warn(
          {
            tenantId,
            agentId,
            errors: validationResult.errors,
          },
          'Headers validation failed'
        );
        const errorMessage = `Invalid headers: ${validationResult.errors.map((e) => `${e.field}: ${e.message}`).join(', ')}`;
        throw createApiError({
          code: 'bad_request',
          message: errorMessage,
        });
      }

      (c as any).set('validatedContext', validationResult.validatedContext);

      logger.debug(
        {
          tenantId,
          agentId,
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
