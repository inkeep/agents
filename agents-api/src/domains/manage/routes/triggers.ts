import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddTriggerUserRequestSchema,
  canUseProjectStrict,
  commonGetErrorResponses,
  createApiError,
  createTriggerUser,
  createTriggerWithUsers,
  DateTimeFilterQueryParamsSchema,
  deleteTrigger,
  deleteTriggerUser,
  errorSchemaFactory,
  generateId,
  getCredentialReference,
  getTriggerById,
  getTriggerInvocationById,
  getTriggerUsers,
  getTriggerUsersBatch,
  hashAuthenticationHeaders,
  listTriggerInvocationsPaginated,
  listTriggersPaginated,
  type OrgRole,
  OrgRoles,
  PaginationQueryParamsSchema,
  PartSchema,
  SetTriggerUsersRequestSchema,
  setTriggerUsers,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  TriggerApiInsertSchema,
  TriggerApiUpdateSchema,
  TriggerInvocationListResponse,
  TriggerInvocationResponse,
  TriggerInvocationStatusEnum,
  TriggerUsersResponseSchema,
  TriggerWithWebhookUrlListResponse,
  TriggerWithWebhookUrlResponse,
  TriggerWithWebhookUrlWithWarningResponse,
  updateTrigger,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';
import { dispatchExecution } from '../../run/services/TriggerService';
import {
  assertCanMutateTrigger,
  validateRunAsUserId,
  validateRunAsUserIds,
} from './triggerHelpers';

const logger = getLogger('triggers');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

/**
 * Generate webhook URL for a trigger
 */
function generateWebhookUrl(params: {
  baseUrl: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
}): string {
  const { baseUrl, tenantId, projectId, agentId, triggerId } = params;
  return `${baseUrl}/run/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`;
}

function getResponseRunAsUserId(params: {
  legacyRunAsUserId?: string | null;
  runAsUserIds: string[];
}): string | null {
  const { legacyRunAsUserId, runAsUserIds } = params;

  if (runAsUserIds.length > 1) return null;
  if (runAsUserIds.length === 1) return runAsUserIds[0] ?? null;
  return legacyRunAsUserId ?? null;
}

type TriggerResponseInput = {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  runAsUserId?: string | null;
};

function buildTriggerResponse<T extends TriggerResponseInput>(params: {
  trigger: T;
  runAsUserIds: string[];
  webhookUrl: string;
}) {
  const { trigger, runAsUserIds, webhookUrl } = params;

  const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

  return {
    ...triggerWithoutScopes,
    runAsUserId: getResponseRunAsUserId({
      legacyRunAsUserId: trigger.runAsUserId,
      runAsUserIds,
    }),
    runAsUserIds,
    userCount: runAsUserIds.length,
    webhookUrl,
  };
}

async function getEffectiveTriggerUserIds(params: {
  db: ManageAppVariables['db'];
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  legacyRunAsUserId?: string | null;
}): Promise<string[]> {
  const rows = await getTriggerUsers(params.db)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    triggerId: params.triggerId,
  });

  if (rows.length > 0) {
    return rows.map((row) => row.userId);
  }

  return params.legacyRunAsUserId ? [params.legacyRunAsUserId] : [];
}

function validateRunNowDelegation(params: {
  runAsUserId?: string;
  callerId: string;
  tenantRole: OrgRole;
}): void {
  const { runAsUserId, callerId, tenantRole } = params;
  if (!runAsUserId || runAsUserId === callerId) return;

  const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
  if (!isAdmin) {
    throw createApiError({
      code: 'forbidden',
      message: 'Only org admins or owners can rerun triggers as a different user.',
    });
  }
}

/**
 * List Triggers for an Agent
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Triggers',
    operationId: 'list-triggers',
    tags: ['Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of triggers retrieved successfully',
        content: {
          'application/json': {
            schema: TriggerWithWebhookUrlListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

    const result = await listTriggersPaginated(db)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });

    const usersByTriggerId = await getTriggerUsersBatch(db)({
      scopes: { tenantId, projectId, agentId },
      triggerIds: result.data.map((trigger) => trigger.id),
    });

    const dataWithWebhookUrl = result.data.map((trigger) =>
      buildTriggerResponse({
        trigger,
        runAsUserIds:
          usersByTriggerId.get(trigger.id) ?? (trigger.runAsUserId ? [trigger.runAsUserId] : []),
        webhookUrl: generateWebhookUrl({
          baseUrl: apiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
        }),
      })
    );

    return c.json({
      data: dataWithWebhookUrl,
      pagination: result.pagination,
    });
  }
);

/**
 * Get Trigger by ID
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Trigger',
    operationId: 'get-trigger-by-id',
    tags: ['Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Trigger found',
        content: {
          'application/json': {
            schema: TriggerWithWebhookUrlResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

    const trigger = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    const runAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: trigger.runAsUserId,
    });

    return c.json({
      data: buildTriggerResponse({
        trigger,
        runAsUserIds,
        webhookUrl: generateWebhookUrl({
          baseUrl: apiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
        }),
      }),
    });
  }
);

/**
 * Create Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Trigger',
    operationId: 'create-trigger',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Trigger created successfully',
        content: {
          'application/json': {
            schema: TriggerWithWebhookUrlWithWarningResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    const id = body.id || generateId();
    const runAsUserIds = body.runAsUserIds;

    // Normalize empty runAsUserId to null
    const runAsUserId = body.runAsUserId || null;

    if (!callerId && (runAsUserId || (runAsUserIds && runAsUserIds.length > 0))) {
      throw createApiError({
        code: 'bad_request',
        message: 'Authenticated user ID is required when setting runAsUserId or runAsUserIds',
      });
    }

    if (runAsUserIds && runAsUserIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    } else if (runAsUserId) {
      if (!callerId) {
        throw createApiError({
          code: 'bad_request',
          message: 'Authenticated user ID is required when setting runAsUserId',
        });
      }
      await validateRunAsUserId({ runAsUserId, callerId, tenantId, projectId, tenantRole });
    }

    logger.debug({ triggerId: id }, 'Creating trigger');

    // Validate credential reference exists if provided
    if (body.signingSecretCredentialReferenceId) {
      const credentialRef = await getCredentialReference(db)({
        scopes: { tenantId, projectId },
        id: body.signingSecretCredentialReferenceId,
      });

      if (!credentialRef) {
        throw createApiError({
          code: 'bad_request',
          message: `Credential reference not found: ${body.signingSecretCredentialReferenceId}`,
        });
      }

      // Only project-scoped credentials can be attached to triggers
      if (credentialRef.userId) {
        throw createApiError({
          code: 'bad_request',
          message:
            'Only project-scoped credentials can be attached to triggers. User-scoped credentials are not allowed.',
        });
      }
    }

    // Hash authentication header values before storing
    // The input schema uses { headers: [{name, value}] }, stored as { headers: [{name, valueHash, valuePrefix}] }
    let hashedAuthentication: unknown;
    const authInput = body.authentication as
      | { headers?: Array<{ name: string; value: string }> }
      | undefined;
    if (authInput?.headers && authInput.headers.length > 0) {
      const hashedHeaders = await hashAuthenticationHeaders(authInput.headers);
      hashedAuthentication = { headers: hashedHeaders };
    }

    const effectiveRunAsUserIds = runAsUserIds?.length
      ? runAsUserIds
      : runAsUserId
        ? [runAsUserId]
        : [];

    const trigger = await createTriggerWithUsers(db)({
      trigger: {
        ...body,
        id,
        tenantId,
        projectId,
        agentId,
        enabled: body.enabled !== undefined ? body.enabled : true,
        authentication: hashedAuthentication as any,
        signatureVerification: body.signatureVerification as any,
        runAsUserId: null,
        dispatchDelayMs: body.dispatchDelayMs ?? null,
        createdBy: callerId || null,
      },
      userIds: effectiveRunAsUserIds,
    });

    const hasNoAuth =
      !body.authentication || !(body.authentication as { headers?: unknown[] }).headers?.length;
    const hasNoSignatureVerification = !body.signatureVerification;
    const warning =
      effectiveRunAsUserIds.length > 0 && hasNoAuth && hasNoSignatureVerification
        ? 'This trigger will authenticate on behalf of the specified users. Please configure authentication or signature verification to ensure the trigger is secure.'
        : undefined;

    return c.json(
      {
        data: buildTriggerResponse({
          trigger,
          runAsUserIds: effectiveRunAsUserIds,
          webhookUrl: generateWebhookUrl({
            baseUrl: apiBaseUrl,
            tenantId,
            projectId,
            agentId,
            triggerId: trigger.id,
          }),
        }),
        ...(warning && { warning }),
      },
      201
    );
  }
);

/**
 * Update Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Trigger',
    operationId: 'update-trigger',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger updated successfully',
        content: {
          'application/json': {
            schema: TriggerWithWebhookUrlWithWarningResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    // Fetch existing trigger first for authorization check
    const existingForAuth = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existingForAuth) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    const existingRunAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existingForAuth.runAsUserId,
    });

    assertCanMutateTrigger({
      trigger: {
        createdBy: existingForAuth.createdBy ?? null,
        runAsUserId: existingForAuth.runAsUserId ?? null,
        runAsUserIds: existingRunAsUserIds,
      },
      callerId,
      tenantRole,
    });

    const runAsUserIds = body.runAsUserIds;
    // Normalize empty runAsUserId to null
    const runAsUserId = body.runAsUserId !== undefined ? body.runAsUserId || null : undefined;

    if (!callerId && (runAsUserId || (runAsUserIds && runAsUserIds.length > 0))) {
      throw createApiError({
        code: 'bad_request',
        message: 'Authenticated user ID is required when setting runAsUserId or runAsUserIds',
      });
    }

    if (runAsUserIds && runAsUserIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    } else if (runAsUserId && runAsUserId !== existingForAuth.runAsUserId) {
      if (!callerId) {
        throw createApiError({
          code: 'bad_request',
          message: 'Authenticated user ID is required when setting runAsUserId',
        });
      }
      await validateRunAsUserId({ runAsUserId, callerId, tenantId, projectId, tenantRole });
    }

    // Check if any update fields were actually provided
    // We check each field explicitly to avoid issues with Zod defaults
    const hasUpdateFields =
      body.name !== undefined ||
      body.description !== undefined ||
      body.enabled !== undefined ||
      body.inputSchema !== undefined ||
      body.outputTransform !== undefined ||
      body.messageTemplate !== undefined ||
      body.authentication !== undefined ||
      body.signingSecretCredentialReferenceId !== undefined ||
      body.signatureVerification !== undefined ||
      body.runAsUserId !== undefined ||
      body.runAsUserIds !== undefined ||
      body.dispatchDelayMs !== undefined;

    if (!hasUpdateFields) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    logger.debug({ triggerId: id }, 'Updating trigger');

    // Validate credential reference exists if provided
    if (body.signingSecretCredentialReferenceId) {
      const credentialRef = await getCredentialReference(db)({
        scopes: { tenantId, projectId },
        id: body.signingSecretCredentialReferenceId,
      });

      if (!credentialRef) {
        throw createApiError({
          code: 'bad_request',
          message: `Credential reference not found: ${body.signingSecretCredentialReferenceId}`,
        });
      }

      // Only project-scoped credentials can be attached to triggers
      if (credentialRef.userId) {
        throw createApiError({
          code: 'bad_request',
          message:
            'Only project-scoped credentials can be attached to triggers. User-scoped credentials are not allowed.',
        });
      }
    }

    // Handle authentication headers update
    // The update schema supports { headers: [{name, value?, keepExisting?}] }
    // If keepExisting is true, we preserve the existing hashed value
    let hashedAuthentication: unknown;
    const authInput = body.authentication as
      | { headers?: Array<{ name: string; value?: string; keepExisting?: boolean }> }
      | undefined;

    if (authInput?.headers && authInput.headers.length > 0) {
      const existingAuth = existingForAuth.authentication as {
        headers?: Array<{ name: string; valueHash: string; valuePrefix: string }>;
      } | null;

      const hashedHeaders: Array<{ name: string; valueHash: string; valuePrefix: string }> = [];

      for (const header of authInput.headers) {
        if (header.keepExisting) {
          // Find and preserve existing header hash
          const existingHeader = existingAuth?.headers?.find((h) => h.name === header.name);
          if (existingHeader) {
            hashedHeaders.push({
              name: header.name,
              valueHash: existingHeader.valueHash,
              valuePrefix: existingHeader.valuePrefix,
            });
          }
          // If no existing header found, skip this one
        } else if (header.value) {
          // Hash the new value
          const hashed = await hashAuthenticationHeaders([
            { name: header.name, value: header.value },
          ]);
          hashedHeaders.push(hashed[0]);
        }
        // If neither keepExisting nor value, skip this header
      }

      hashedAuthentication = hashedHeaders.length > 0 ? { headers: hashedHeaders } : undefined;
    } else if (body.authentication !== undefined) {
      // Explicitly set to undefined/empty to clear authentication
      hashedAuthentication = body.authentication;
    }

    const updatedTrigger = await db.transaction(async (tx) => {
      const updated = await updateTrigger(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        data: {
          ...body,
          authentication: hashedAuthentication as any,
          signatureVerification: body.signatureVerification as any,
          ...(runAsUserId !== undefined || runAsUserIds !== undefined ? { runAsUserId: null } : {}),
          ...(body.dispatchDelayMs !== undefined ? { dispatchDelayMs: body.dispatchDelayMs } : {}),
        },
      });

      if (runAsUserIds !== undefined) {
        await setTriggerUsers(tx)({
          scopes: { tenantId, projectId, agentId },
          triggerId: id,
          userIds: runAsUserIds,
        });
      } else if (runAsUserId !== undefined) {
        await setTriggerUsers(tx)({
          scopes: { tenantId, projectId, agentId },
          triggerId: id,
          userIds: runAsUserId ? [runAsUserId] : [],
        });
      }

      return updated;
    });

    if (!updatedTrigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    const effectiveRunAsUserIds =
      runAsUserIds !== undefined
        ? runAsUserIds
        : runAsUserId !== undefined
          ? runAsUserId
            ? [runAsUserId]
            : []
          : existingRunAsUserIds;

    const effectiveAuth = updatedTrigger.authentication as { headers?: unknown[] } | null;
    const effectiveSigVerification = updatedTrigger.signatureVerification;
    const hasNoAuthAfterUpdate = !effectiveAuth || !effectiveAuth.headers?.length;
    const hasNoSigVerAfterUpdate = !effectiveSigVerification;
    const updateWarning =
      effectiveRunAsUserIds.length > 0 && hasNoAuthAfterUpdate && hasNoSigVerAfterUpdate
        ? 'This trigger will authenticate on behalf of the specified users. Please configure authentication or signature verification to ensure the trigger is secure.'
        : undefined;

    return c.json({
      data: buildTriggerResponse({
        trigger: updatedTrigger,
        runAsUserIds: effectiveRunAsUserIds,
        webhookUrl: generateWebhookUrl({
          baseUrl: apiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: updatedTrigger.id,
        }),
      }),
      ...(updateWarning && { warning: updateWarning }),
    });
  }
);

/**
 * Delete Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Trigger',
    operationId: 'delete-trigger',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Trigger deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const callerId = c.get('userId') ?? '';

    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    logger.debug({ triggerId: id }, 'Deleting trigger');

    // First check if the trigger exists
    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    const existingRunAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existing.runAsUserId,
    });

    assertCanMutateTrigger({
      trigger: {
        createdBy: existing.createdBy ?? null,
        runAsUserId: existing.runAsUserId ?? null,
        runAsUserIds: existingRunAsUserIds,
      },
      callerId,
      tenantRole,
    });

    await deleteTrigger(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    return c.body(null, 204);
  }
);

const TriggerUserIdParamsSchema = TenantProjectAgentIdParamsSchema.extend({
  userId: z.string().describe('User ID'),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/users',
    summary: 'List Trigger Users',
    operationId: 'list-trigger-users',
    tags: ['Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'List of users associated with this trigger',
        content: {
          'application/json': {
            schema: TriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Trigger not found' });
    }

    const runAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existing.runAsUserId,
    });

    return c.json({ data: runAsUserIds });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{id}/users',
    summary: 'Set Trigger Users',
    operationId: 'set-trigger-users',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SetTriggerUsersRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger users replaced successfully',
        content: {
          'application/json': {
            schema: TriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;

    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Trigger not found' });
    }

    const existingRunAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existing.runAsUserId,
    });

    assertCanMutateTrigger({
      trigger: {
        createdBy: existing.createdBy ?? null,
        runAsUserId: existing.runAsUserId ?? null,
        runAsUserIds: existingRunAsUserIds,
      },
      callerId,
      tenantRole,
    });

    if (userIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds: userIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }

    await db.transaction(async (tx) => {
      await setTriggerUsers(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        userIds,
      });

      await updateTrigger(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        data: {
          runAsUserId: null,
        },
      });
    });

    return c.json({ data: userIds });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/users',
    summary: 'Add User to Trigger',
    operationId: 'add-trigger-user',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AddTriggerUserRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'User added to trigger successfully',
        content: {
          'application/json': {
            schema: TriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const { userId } = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;

    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Trigger not found' });
    }

    const existingRunAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existing.runAsUserId,
    });

    assertCanMutateTrigger({
      trigger: {
        createdBy: existing.createdBy ?? null,
        runAsUserId: existing.runAsUserId ?? null,
        runAsUserIds: existingRunAsUserIds,
      },
      callerId,
      tenantRole,
    });

    await validateRunAsUserIds({
      runAsUserIds: [userId],
      callerId,
      tenantId,
      projectId,
      tenantRole,
    });

    await db.transaction(async (tx) => {
      if (existing.runAsUserId && existingRunAsUserIds.length === 1) {
        await setTriggerUsers(tx)({
          scopes: { tenantId, projectId, agentId },
          triggerId: id,
          userIds: existingRunAsUserIds,
        });
      }

      await createTriggerUser(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        userId,
      });

      await updateTrigger(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        data: {
          runAsUserId: null,
        },
      });
    });

    const rows = await getTriggerUsers(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    return c.json({ data: rows.map((row) => row.userId) }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}/users/{userId}',
    summary: 'Remove User from Trigger',
    operationId: 'remove-trigger-user',
    tags: ['Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TriggerUserIdParamsSchema,
    },
    responses: {
      200: {
        description: 'User removed from trigger successfully',
        content: {
          'application/json': {
            schema: TriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id, userId } = c.req.valid('param');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;

    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Trigger not found' });
    }

    const existingRunAsUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId: id,
      legacyRunAsUserId: existing.runAsUserId,
    });

    assertCanMutateTrigger({
      trigger: {
        createdBy: existing.createdBy ?? null,
        runAsUserId: existing.runAsUserId ?? null,
        runAsUserIds: existingRunAsUserIds,
      },
      callerId,
      tenantRole,
    });

    if (!existingRunAsUserIds.includes(userId)) {
      throw createApiError({
        code: 'not_found',
        message: 'User is not associated with this trigger',
      });
    }

    const remainingUserIds = existingRunAsUserIds.filter((idValue) => idValue !== userId);

    await db.transaction(async (tx) => {
      if (existing.runAsUserId && existingRunAsUserIds.length === 1) {
        await setTriggerUsers(tx)({
          scopes: { tenantId, projectId, agentId },
          triggerId: id,
          userIds: existingRunAsUserIds,
        });
      }

      await deleteTriggerUser(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        userId,
      });

      await updateTrigger(tx)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
        data: {
          runAsUserId: null,
        },
      });
    });

    return c.json({ data: remainingUserIds });
  }
);

/**
 * ========================================
 * Trigger Invocation Endpoints
 * ========================================
 */

// Query params for invocation filtering (extends base pagination with status/date filters)
const TriggerInvocationQueryParamsSchema = PaginationQueryParamsSchema.merge(
  DateTimeFilterQueryParamsSchema
)
  .extend({
    status: TriggerInvocationStatusEnum.optional().describe('Filter by invocation status'),
  })
  .openapi('TriggerInvocationQueryParams');

/**
 * List Trigger Invocations
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/invocations',
    summary: 'List Trigger Invocations',
    operationId: 'list-trigger-invocations',
    tags: ['Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      query: TriggerInvocationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of trigger invocations retrieved successfully',
        content: {
          'application/json': {
            schema: TriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id: triggerId } = c.req.valid('param');
    const { page, limit, status, from, to } = c.req.valid('query');

    logger.debug({ triggerId, status, from, to }, 'Listing trigger invocations');

    const result = await listTriggerInvocationsPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
      pagination: { page, limit },
      filters: {
        status,
        from,
        to,
      },
    });

    const dataWithoutScopes = result.data.map((invocation) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = invocation;
      return rest;
    });

    return c.json({
      data: dataWithoutScopes,
      pagination: result.pagination,
    });
  }
);

/**
 * Get Trigger Invocation by ID
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/invocations/{invocationId}',
    summary: 'Get Trigger Invocation',
    operationId: 'get-trigger-invocation-by-id',
    tags: ['Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentIdParamsSchema.extend({
        invocationId: z.string().describe('Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Trigger invocation found',
        content: {
          'application/json': {
            schema: TriggerInvocationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id: triggerId, invocationId } = c.req.valid('param');

    logger.debug({ triggerId, invocationId }, 'Getting trigger invocation');

    const invocation = await getTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger invocation not found',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      tenantId: _tid,
      projectId: _pid,
      agentId: _aid,
      ...invocationWithoutScopes
    } = invocation;

    return c.json({
      data: invocationWithoutScopes,
    });
  }
);

/**
 * Rerun Trigger
 * Re-executes a trigger with the provided user message (from a previous trace).
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/rerun',
    summary: 'Rerun Trigger',
    operationId: 'rerun-trigger',
    tags: ['Triggers'],
    permission: requireProjectPermission('use'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userMessage: z.string().describe('The user message to send to the agent'),
              messageParts: z
                .array(PartSchema)
                .optional()
                .describe('Optional structured message parts (from original trace)'),
              runAsUserId: z
                .string()
                .optional()
                .describe('Specific associated user to rerun this trigger as'),
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Trigger rerun accepted and dispatched',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationId: z.string(),
              conversationId: z.string(),
            }),
          },
        },
      },
      409: errorSchemaFactory('conflict', 'Trigger is disabled'),
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const resolvedRef = c.get('resolvedRef');
    const { tenantId, projectId, agentId, id: triggerId } = c.req.valid('param');
    const {
      userMessage,
      messageParts: rawMessageParts,
      runAsUserId: requestedRunAsUserId,
    } = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    logger.info({ triggerId }, 'Rerunning trigger');

    const trigger = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    if (!trigger.enabled) {
      throw createApiError({
        code: 'conflict',
        message: 'Trigger is disabled',
      });
    }

    const triggerUserIds = await getEffectiveTriggerUserIds({
      db,
      tenantId,
      projectId,
      agentId,
      triggerId,
      legacyRunAsUserId: trigger.runAsUserId,
    });

    let runAsUserId: string | undefined;
    if (triggerUserIds.length > 0) {
      if (requestedRunAsUserId) {
        if (!triggerUserIds.includes(requestedRunAsUserId)) {
          throw createApiError({
            code: 'bad_request',
            message: 'runAsUserId is not associated with this trigger',
          });
        }
        runAsUserId = requestedRunAsUserId;
      } else if (triggerUserIds.length > 1) {
        throw createApiError({
          code: 'bad_request',
          message: 'Multi-user trigger requires runAsUserId for rerun',
        });
      } else {
        runAsUserId = triggerUserIds[0];
      }
    } else if (requestedRunAsUserId) {
      throw createApiError({
        code: 'bad_request',
        message: 'runAsUserId is not associated with this trigger',
      });
    }

    const callerCanUse = await canUseProjectStrict({ userId: callerId, tenantId, projectId });
    if (!callerCanUse) {
      throw createApiError({
        code: 'forbidden',
        message: 'You no longer have permission to use this project',
      });
    }

    validateRunNowDelegation({
      runAsUserId,
      callerId,
      tenantRole,
    });

    const messageParts = rawMessageParts ?? [{ kind: 'text' as const, text: userMessage }];

    let invocationId: string;
    let conversationId: string;
    try {
      ({ invocationId, conversationId } = await dispatchExecution({
        tenantId,
        projectId,
        agentId,
        triggerId,
        resolvedRef,
        payload: { _rerun: true },
        transformedPayload: undefined,
        messageParts,
        userMessageText: userMessage,
        runAsUserId,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { err: errorMessage, errorStack, triggerId },
        'Failed to dispatch trigger rerun execution'
      );
      throw createApiError({
        code: 'internal_server_error',
        message: `Something went wrong. Please contact support.`,
      });
    }

    logger.info({ triggerId, invocationId, conversationId }, 'Trigger rerun dispatched');

    return c.json({ success: true, invocationId, conversationId }, 202);
  }
);

export default app;
