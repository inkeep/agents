import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddScheduledTriggerUserRequestSchema,
  addConversationIdToInvocation,
  cancelPendingInvocationsForTrigger,
  canUseProjectStrict,
  commonGetErrorResponses,
  computeNextRunAt,
  createApiError,
  createScheduledTrigger,
  createScheduledTriggerInvocation,
  createScheduledTriggerUser,
  DateTimeFilterQueryParamsSchema,
  deleteScheduledTrigger,
  deleteScheduledTriggerUser,
  generateId,
  getProjectScopedRef,
  getScheduledTriggerById,
  getScheduledTriggerInvocationById,
  getScheduledTriggerRunInfoBatch,
  getScheduledTriggerUserCount,
  getScheduledTriggerUsers,
  getScheduledTriggerUsersBatch,
  getWaitUntil,
  interpolateTemplate,
  listScheduledTriggerInvocationsPaginated,
  listScheduledTriggersPaginated,
  listUpcomingInvocationsForAgentPaginated,
  markScheduledTriggerInvocationCancelled,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  type OrgRole,
  OrgRoles,
  PaginationQueryParamsSchema,
  type Part,
  resolveRef,
  ScheduledTriggerApiInsertSchema,
  ScheduledTriggerApiUpdateSchema,
  ScheduledTriggerInvocationListResponse,
  ScheduledTriggerInvocationResponse,
  ScheduledTriggerInvocationStatusEnum,
  ScheduledTriggerResponse,
  ScheduledTriggerUsersResponseSchema,
  ScheduledTriggerWithRunInfoListResponse,
  SetScheduledTriggerUsersRequestSchema,
  setScheduledTriggerUsers,
  TenantProjectAgentParamsSchema,
  updateScheduledTrigger,
  updateScheduledTriggerInvocationStatus,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { CronExpressionParser } from 'cron-parser';
import { manageDbClient } from '../../../data/db';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';
import { onTriggerUpdated } from '../../run/services/ScheduledTriggerService';
import { buildTimezoneHeaders, executeAgentAsync } from '../../run/services/TriggerService';

export {
  assertCanMutateTrigger,
  validateRunAsUserId,
  validateRunAsUserIds,
} from './triggerHelpers';

import {
  assertCanMutateTrigger,
  validateRunAsUserId,
  validateRunAsUserIds,
} from './triggerHelpers';

const logger = getLogger('scheduled-triggers');

function validateRunNowDelegation(params: {
  runAsUserIds: (string | null)[];
  callerId: string;
  tenantRole: OrgRole;
}): void {
  const { runAsUserIds, callerId, tenantRole } = params;
  const hasOtherUser = runAsUserIds.some((uid) => uid !== null && uid !== callerId);
  if (!hasOtherUser) return;
  const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
  if (!isAdmin) {
    throw createApiError({
      code: 'forbidden',
      message: 'Only org admins or owners can run triggers configured to run as a different user.',
    });
  }
}

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const ScheduledTriggerIdParamsSchema = TenantProjectAgentParamsSchema.extend({
  id: z.string().describe('Scheduled Trigger ID'),
});

/**
 * List Scheduled Triggers for an Agent
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Scheduled Triggers',
    operationId: 'list-scheduled-triggers',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of scheduled triggers retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerWithRunInfoListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const { data, pagination } = await listScheduledTriggersPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });

    // Fetch run info for all triggers in a single batch query
    const triggerIds = data.map((trigger) => ({
      agentId,
      triggerId: trigger.id,
    }));

    const [runInfoMap, usersBatchMap] = await Promise.all([
      getScheduledTriggerRunInfoBatch(runDbClient)({
        scopes: { tenantId, projectId },
        triggerIds,
      }),
      getScheduledTriggerUsersBatch(runDbClient)({
        tenantId,
        scheduledTriggerIds: data.map((t) => t.id),
      }),
    ]);

    const dataWithRunInfo = data.map((trigger) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = trigger;
      const runInfo = runInfoMap.get(trigger.id) || {
        lastRunAt: null,
        lastRunStatus: null,
        lastRunConversationIds: [],
        nextRunAt: null,
        lastRunSummary: null,
      };
      const triggerUserIds = usersBatchMap.get(trigger.id) ?? [];
      const userCount = triggerUserIds.length;

      // Calculate nextRunAt if it's null and trigger is enabled
      if (!runInfo.nextRunAt && trigger.enabled) {
        if (trigger.runAt) {
          // One-time trigger - use runAt if it's in the future
          const runAtDate = new Date(trigger.runAt);
          if (runAtDate > new Date()) {
            runInfo.nextRunAt = trigger.runAt;
          }
        } else if (trigger.cronExpression) {
          // Cron trigger - calculate next execution time
          try {
            const baseDate = new Date();
            const interval = CronExpressionParser.parse(trigger.cronExpression, {
              currentDate: baseDate,
              tz: trigger.cronTimezone || 'UTC',
            });
            const nextDate = interval.next();
            runInfo.nextRunAt = nextDate.toISOString();
          } catch (error) {
            logger.warn(
              { triggerId: trigger.id, cronExpression: trigger.cronExpression, error },
              'Failed to calculate nextRunAt from cron expression'
            );
          }
        }
      }

      return {
        ...rest,
        ...runInfo,
        runAsUserIds: triggerUserIds,
        userCount,
      };
    });

    return c.json({
      data: dataWithRunInfo,
      pagination,
    });
  }
);

// Query params for upcoming runs (across all triggers)
const UpcomingRunsQueryParamsSchema = PaginationQueryParamsSchema.extend({
  includeRunning: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true')
    .describe('Include currently running invocations in results'),
}).openapi('UpcomingRunsQueryParams');

/**
 * List Upcoming Runs Across All Scheduled Triggers
 * Dashboard endpoint to view all pending/running invocations for an agent
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/upcoming-runs',
    summary: 'List Upcoming Runs',
    operationId: 'list-upcoming-scheduled-runs',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
      query: UpcomingRunsQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of upcoming scheduled runs retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit, includeRunning } = c.req.valid('query');

    logger.info(
      { tenantId, projectId, agentId, includeRunning, page, limit },
      'Listing upcoming scheduled runs across all triggers'
    );

    const result = await listUpcomingInvocationsForAgentPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
      includeRunning: includeRunning ?? true,
    });

    logger.info(
      { count: result.data.length, total: result.pagination.total, tenantId, projectId, agentId },
      'Upcoming runs query result'
    );

    const dataWithoutScopes = result.data.map((invocation) => {
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
 * Get Scheduled Trigger by ID
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Scheduled Trigger',
    operationId: 'get-scheduled-trigger-by-id',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Scheduled trigger found',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const trigger = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json({
      data: triggerWithoutScopes,
    });
  }
);

/**
 * Create Scheduled Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Scheduled Trigger',
    operationId: 'create-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ScheduledTriggerApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Scheduled trigger created successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');
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
      await validateRunAsUserId({
        runAsUserId,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id, runAsUserId, runAsUserIds },
      'Creating scheduled trigger'
    );

    const enabled = body.enabled ?? true;
    const nextRunAt = enabled
      ? computeNextRunAt({
          cronExpression: body.cronExpression,
          cronTimezone: body.cronTimezone,
          runAt: body.runAt,
        })
      : null;

    const trigger = await createScheduledTrigger(runDbClient)({
      ...body,
      id,
      tenantId,
      projectId,
      agentId,
      description: body.description ?? null,
      enabled,
      cronExpression: body.cronExpression ?? null,
      cronTimezone: body.cronTimezone ?? 'UTC',
      runAt: body.runAt ?? null,
      payload: body.payload ?? null,
      messageTemplate: body.messageTemplate ?? null,
      runAsUserId,
      createdBy: callerId || null,
      nextRunAt,
    });

    if (runAsUserIds && runAsUserIds.length > 0) {
      await setScheduledTriggerUsers(runDbClient)({
        tenantId,
        scheduledTriggerId: trigger.id,
        userIds: runAsUserIds,
      });
    } else if (runAsUserId) {
      await createScheduledTriggerUser(runDbClient)({
        tenantId,
        scheduledTriggerId: trigger.id,
        userId: runAsUserId,
      });
    }

    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json(
      {
        data: triggerWithoutScopes,
      },
      201
    );
  }
);

/**
 * Update Scheduled Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Scheduled Trigger',
    operationId: 'update-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ScheduledTriggerApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Scheduled trigger updated successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    const runAsUserIds = body.runAsUserIds;

    // Check if any update fields were actually provided
    const hasUpdateFields =
      body.name !== undefined ||
      body.description !== undefined ||
      body.enabled !== undefined ||
      body.cronExpression !== undefined ||
      body.cronTimezone !== undefined ||
      body.runAt !== undefined ||
      body.ref !== undefined ||
      body.payload !== undefined ||
      body.messageTemplate !== undefined ||
      body.maxRetries !== undefined ||
      body.retryDelaySeconds !== undefined ||
      body.timeoutSeconds !== undefined ||
      body.runAsUserId !== undefined ||
      runAsUserIds !== undefined ||
      body.dispatchDelayMs !== undefined;

    if (!hasUpdateFields) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

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
    } else if (runAsUserId) {
      await validateRunAsUserId({
        runAsUserId,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id, runAsUserId, runAsUserIds },
      'Updating scheduled trigger'
    );

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    assertCanMutateTrigger({ trigger: existing, callerId, tenantRole });

    // Validate merged state for schedule fields to prevent database corruption
    const merged = {
      cronExpression:
        body.cronExpression !== undefined ? body.cronExpression : existing.cronExpression,
      runAt: body.runAt !== undefined ? body.runAt : existing.runAt,
    };

    // Check mutual exclusivity: cannot have both cronExpression AND runAt
    if (merged.cronExpression && merged.runAt) {
      throw createApiError({
        code: 'bad_request',
        message: 'Cannot have both cronExpression and runAt. Please provide only one.',
      });
    }

    // Check at least one is present: must have either cronExpression OR runAt
    if (!merged.cronExpression && !merged.runAt) {
      throw createApiError({
        code: 'bad_request',
        message: 'Either cronExpression or runAt must be provided.',
      });
    }

    // Determine if schedule changed (affects workflow timing)
    const scheduleChanged =
      body.cronExpression !== undefined ||
      body.cronTimezone !== undefined ||
      body.runAt !== undefined;

    const previousEnabled = existing.enabled;

    // For retry settings: if provided, validate; if null/undefined, keep existing or use default
    const resolveRetryValue = (
      bodyValue: number | null | undefined,
      existingValue: number | null,
      defaultValue: number
    ): number => {
      if (typeof bodyValue === 'number' && !Number.isNaN(bodyValue)) {
        return bodyValue;
      }
      if (bodyValue === undefined) {
        // Not provided in update - keep existing or use default
        return existingValue ?? defaultValue;
      }
      // Explicitly null - use default
      return defaultValue;
    };

    const mergedEnabled = body.enabled !== undefined ? body.enabled : existing.enabled;
    const enabledChanged = body.enabled !== undefined && body.enabled !== existing.enabled;

    let nextRunAt: string | null | undefined;
    if (!mergedEnabled) {
      nextRunAt = null;
    } else if (scheduleChanged || enabledChanged) {
      const mergedCron =
        body.cronExpression !== undefined ? body.cronExpression : existing.cronExpression;
      const mergedTimezone =
        body.cronTimezone !== undefined ? body.cronTimezone : existing.cronTimezone;
      const mergedRunAt = body.runAt !== undefined ? body.runAt : existing.runAt;
      nextRunAt = computeNextRunAt({
        cronExpression: mergedCron,
        cronTimezone: mergedTimezone,
        runAt: mergedRunAt,
      });
    }

    const updatedTrigger = await updateScheduledTrigger(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
      data: {
        ...body,
        maxRetries: resolveRetryValue(body.maxRetries, existing.maxRetries, 3),
        retryDelaySeconds: resolveRetryValue(
          body.retryDelaySeconds,
          existing.retryDelaySeconds,
          60
        ),
        timeoutSeconds: resolveRetryValue(body.timeoutSeconds, existing.timeoutSeconds, 300),
        runAsUserId,
        ...(nextRunAt !== undefined ? { nextRunAt } : {}),
      },
    });

    if (runAsUserIds) {
      await setScheduledTriggerUsers(runDbClient)({
        tenantId,
        scheduledTriggerId: id,
        userIds: runAsUserIds,
      });
    }

    // Handle workflow lifecycle changes
    try {
      await onTriggerUpdated({
        trigger: updatedTrigger,
        previousEnabled,
        scheduleChanged,
      });
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, agentId, scheduledTriggerId: id },
        'Failed to update workflow for scheduled trigger'
      );
    }

    const {
      tenantId: _tid,
      projectId: _pid,
      agentId: _aid,
      ...triggerWithoutScopes
    } = updatedTrigger;

    return c.json({
      data: triggerWithoutScopes,
    });
  }
);

/**
 * Delete Scheduled Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Scheduled Trigger',
    operationId: 'delete-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Scheduled trigger deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id },
      'Deleting scheduled trigger'
    );

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    assertCanMutateTrigger({ trigger: existing, callerId, tenantRole });

    // Cancel any pending invocations before deleting the trigger
    const cancelledCount = await cancelPendingInvocationsForTrigger(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { tenantId, projectId, agentId, scheduledTriggerId: id, cancelledCount },
        'Cancelled pending invocations before deleting scheduled trigger'
      );
    }

    await deleteScheduledTrigger(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    return c.body(null, 204);
  }
);

const ScheduledTriggerUserIdParamsSchema = ScheduledTriggerIdParamsSchema.extend({
  userId: z.string().describe('User ID'),
});

/**
 * List Scheduled Trigger Users
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/users',
    summary: 'List Scheduled Trigger Users',
    operationId: 'list-scheduled-trigger-users',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
    },
    responses: {
      200: {
        description: 'List of users associated with this trigger',
        content: {
          'application/json': {
            schema: ScheduledTriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Scheduled trigger not found' });
    }

    const rows = await getScheduledTriggerUsers(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
    });
    return c.json({ data: rows.map((r) => r.userId) });
  }
);

/**
 * Set/Replace Scheduled Trigger Users (PUT)
 */
app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{id}/users',
    summary: 'Set Scheduled Trigger Users',
    operationId: 'set-scheduled-trigger-users',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SetScheduledTriggerUsersRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger users replaced successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Scheduled trigger not found' });
    }

    assertCanMutateTrigger({ trigger: existing, callerId, tenantRole });

    if (userIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds: userIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }

    await setScheduledTriggerUsers(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
      userIds,
    });

    if (userIds.length === 0) {
      await updateScheduledTrigger(runDbClient)({
        scopes: { tenantId, projectId, agentId },
        scheduledTriggerId: id,
        data: { enabled: false },
      });
    }

    return c.json({ data: userIds });
  }
);

/**
 * Add Single User to Scheduled Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/users',
    summary: 'Add User to Scheduled Trigger',
    operationId: 'add-scheduled-trigger-user',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AddScheduledTriggerUserRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'User added to trigger successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerUsersResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const { userId } = c.req.valid('json');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Scheduled trigger not found' });
    }

    assertCanMutateTrigger({ trigger: existing, callerId, tenantRole });
    await validateRunAsUserIds({
      runAsUserIds: [userId],
      callerId,
      tenantId,
      projectId,
      tenantRole,
    });

    await createScheduledTriggerUser(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
      userId,
    });

    const rows = await getScheduledTriggerUsers(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
    });
    return c.json({ data: rows.map((r) => r.userId) }, 201);
  }
);

/**
 * Remove User from Scheduled Trigger
 */
app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}/users/{userId}',
    summary: 'Remove User from Scheduled Trigger',
    operationId: 'remove-scheduled-trigger-user',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerUserIdParamsSchema,
    },
    responses: {
      204: {
        description: 'User removed from trigger successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id, userId } = c.req.valid('param');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({ code: 'unauthorized', message: 'Missing tenant role' });
    }

    const existing = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({ code: 'not_found', message: 'Scheduled trigger not found' });
    }

    const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
    if (userId !== callerId && !isAdmin) {
      throw createApiError({
        code: 'forbidden',
        message: 'Only admins can remove other users from a trigger. You can only remove yourself.',
      });
    }

    await deleteScheduledTriggerUser(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
      userId,
    });

    const remainingCount = await getScheduledTriggerUserCount(runDbClient)({
      tenantId,
      scheduledTriggerId: id,
    });

    if (remainingCount === 0) {
      await updateScheduledTrigger(runDbClient)({
        scopes: { tenantId, projectId, agentId },
        scheduledTriggerId: id,
        data: { enabled: false },
      });
    }

    return c.body(null, 204);
  }
);

// Query params for invocation filtering (extends base pagination with status/date filters)
const ScheduledTriggerInvocationQueryParamsSchema = PaginationQueryParamsSchema.merge(
  DateTimeFilterQueryParamsSchema
)
  .extend({
    status: ScheduledTriggerInvocationStatusEnum.optional().describe('Filter by invocation status'),
  })
  .openapi('ScheduledTriggerInvocationQueryParams');

/**
 * List Scheduled Trigger Invocations
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/invocations',
    summary: 'List Scheduled Trigger Invocations',
    operationId: 'list-scheduled-trigger-invocations',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
      query: ScheduledTriggerInvocationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of scheduled trigger invocations retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id: scheduledTriggerId } = c.req.valid('param');
    const { page, limit, status, from, to } = c.req.valid('query');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, status, from, to },
      'Listing scheduled trigger invocations'
    );

    const { data, pagination } = await listScheduledTriggerInvocationsPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      pagination: { page, limit },
      filters: {
        status,
        from,
        to,
      },
    });

    const dataWithoutScopes = data.map((invocation) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = invocation;
      return rest;
    });

    return c.json({
      data: dataWithoutScopes,
      pagination,
    });
  }
);

/**
 * Get Scheduled Trigger Invocation by ID
 */
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/invocations/{invocationId}',
    summary: 'Get Scheduled Trigger Invocation',
    operationId: 'get-scheduled-trigger-invocation-by-id',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('view'),
    request: {
      params: ScheduledTriggerIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation found',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Getting scheduled trigger invocation'
    );

    const invocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger invocation not found',
      });
    }

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
 * Cancel Scheduled Trigger Invocation
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/invocations/{invocationId}/cancel',
    summary: 'Cancel Scheduled Trigger Invocation',
    operationId: 'cancel-scheduled-trigger-invocation',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation cancelled successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationId: z.string(),
              previousStatus: z.string().optional(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Cancelling scheduled trigger invocation'
    );

    // Get the invocation
    const invocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Invocation not found',
      });
    }

    // Check if invocation can be cancelled
    if (invocation.status === 'completed' || invocation.status === 'failed') {
      throw createApiError({
        code: 'bad_request',
        message: `Cannot cancel invocation with status: ${invocation.status}`,
      });
    }

    if (invocation.status === 'cancelled') {
      return c.json({
        success: true,
        invocationId,
        previousStatus: 'cancelled',
      });
    }

    const previousStatus = invocation.status;

    // Mark as cancelled
    await markScheduledTriggerInvocationCancelled(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    logger.info(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId, previousStatus },
      'Scheduled trigger invocation cancelled'
    );

    return c.json({
      success: true,
      invocationId,
      previousStatus,
    });
  }
);

/**
 * Rerun Scheduled Trigger Invocation
 * Creates a new invocation and executes it immediately (manual rerun of a past run)
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/invocations/{invocationId}/rerun',
    summary: 'Rerun Scheduled Trigger Invocation',
    operationId: 'rerun-scheduled-trigger-invocation',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID to rerun'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation rerun initiated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              newInvocationId: z.string(),
              originalInvocationId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Rerunning scheduled trigger invocation'
    );

    // Get the original invocation to verify it exists
    const originalInvocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!originalInvocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Invocation not found',
      });
    }

    // Only allow rerun of completed, failed, or cancelled invocations
    if (originalInvocation.status === 'pending' || originalInvocation.status === 'running') {
      throw createApiError({
        code: 'bad_request',
        message: `Cannot rerun invocation with status: ${originalInvocation.status}. Wait for it to complete or cancel it first.`,
      });
    }

    const trigger = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    const rerunRunAsUserId = originalInvocation.runAsUserId ?? trigger.runAsUserId;

    validateRunNowDelegation({
      runAsUserIds: [rerunRunAsUserId],
      callerId,
      tenantRole,
    });

    const { maxRetries, retryDelaySeconds, timeoutSeconds } = trigger;

    if (!trigger.ref) {
      throw createApiError({
        code: 'bad_request',
        message: 'Scheduled trigger has no ref configured',
      });
    }

    const rerunProjectScopedRef = getProjectScopedRef(tenantId, projectId, trigger.ref);
    const resolvedRef = await resolveRef(manageDbClient)(rerunProjectScopedRef);

    if (!resolvedRef) {
      throw createApiError({
        code: 'bad_request',
        message: `Failed to resolve ref '${trigger.ref}' for project ${projectId}. The branch may have been deleted.`,
      });
    }

    const newInvocationId = generateId();

    await createScheduledTriggerInvocation(runDbClient)({
      id: newInvocationId,
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      ref: resolvedRef,
      status: 'pending',
      scheduledFor: new Date().toISOString(),
      idempotencyKey: `manual-rerun-${invocationId}-${Date.now()}`,
      attemptNumber: 1,
      runAsUserId: rerunRunAsUserId,
    });

    logger.info(
      {
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        originalInvocationId: invocationId,
        newInvocationId,
        maxRetries,
        retryDelaySeconds,
        timeoutSeconds,
        runAsUserId: rerunRunAsUserId,
      },
      'Created new invocation for manual rerun with retry support'
    );

    const scopes = { tenantId, projectId, agentId };

    // Execute in background (fire-and-forget) with retry support
    // On Vercel, use waitUntil to ensure completion after response is sent
    const rerunExecutionPromise = (async () => {
      try {
        await markScheduledTriggerInvocationRunning(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: newInvocationId,
        });

        // Build message from template
        const effectivePayload = trigger.payload ?? {};
        const userMessage = trigger.messageTemplate
          ? interpolateTemplate(trigger.messageTemplate, effectivePayload)
          : JSON.stringify(effectivePayload);

        const messageParts: Part[] = [];
        if (trigger.messageTemplate) {
          messageParts.push({ kind: 'text', text: userMessage });
        }
        messageParts.push({
          kind: 'data',
          data: effectivePayload,
          metadata: { source: 'scheduled-trigger', triggerId: scheduledTriggerId },
        });

        if (rerunRunAsUserId) {
          const canUse = await canUseProjectStrict({
            userId: rerunRunAsUserId,
            tenantId,
            projectId,
          });
          if (!canUse) {
            throw new Error(
              `User ${rerunRunAsUserId} no longer has access to project ${projectId}`
            );
          }
        }

        // Execute with retries (same logic as workflow)
        const maxAttempts = maxRetries + 1;
        let attemptNumber = 1;
        let lastError: string | null = null;

        // Helper to execute with timeout
        const executeWithTimeout = async (conversationId: string): Promise<void> => {
          const timeoutMs = timeoutSeconds * 1000;
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Execution timed out after ${timeoutSeconds}s`)),
              timeoutMs
            );
          });

          await Promise.race([
            executeAgentAsync({
              tenantId,
              projectId,
              agentId,
              triggerId: scheduledTriggerId,
              invocationId: newInvocationId,
              conversationId,
              userMessage,
              messageParts,
              resolvedRef,
              runAsUserId: rerunRunAsUserId ?? undefined,
              forwardedHeaders: buildTimezoneHeaders(trigger.cronTimezone),
              invocationType: 'scheduled_trigger',
            }),
            timeoutPromise,
          ]);
        };

        while (attemptNumber <= maxAttempts) {
          const conversationId = generateId();
          let success = false;

          try {
            await executeWithTimeout(conversationId);
            success = true;
          } catch (execErr) {
            lastError = execErr instanceof Error ? execErr.message : String(execErr);
            logger.error(
              { invocationId: newInvocationId, attemptNumber, error: lastError },
              'Manual rerun failed with error'
            );
          }

          // Always save conversation ID after each attempt (even on failure)
          await addConversationIdToInvocation(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId: newInvocationId,
            conversationId,
          }).catch((err) => {
            logger.error(
              {
                invocationId: newInvocationId,
                error: err instanceof Error ? err.message : String(err),
              },
              'Failed to save conversation ID'
            );
          });

          if (success) {
            await markScheduledTriggerInvocationCompleted(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
            });
            logger.info(
              { invocationId: newInvocationId, conversationId, attemptNumber },
              'Manual rerun completed'
            );
            lastError = null;
            break;
          }

          // Retry logic
          if (attemptNumber < maxAttempts) {
            // Increment attempt number in DB
            await updateScheduledTriggerInvocationStatus(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
              data: {
                attemptNumber: attemptNumber + 1,
                status: 'running',
              },
            }).catch((err) => {
              logger.error(
                {
                  invocationId: newInvocationId,
                  error: err instanceof Error ? err.message : String(err),
                },
                'Failed to update invocation attempt number'
              );
            });

            attemptNumber++;
            const jitter = Math.random() * 0.3;
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelaySeconds * 1000 * (1 + jitter))
            );
          } else {
            break;
          }
        }

        // Mark as failed if all retries exhausted
        if (lastError) {
          await markScheduledTriggerInvocationFailed(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId: newInvocationId,
          }).catch((err) => {
            logger.error(
              {
                invocationId: newInvocationId,
                error: err instanceof Error ? err.message : String(err),
              },
              'Failed to mark invocation as failed after retries exhausted'
            );
          });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ invocationId: newInvocationId, error }, 'Manual rerun setup failed');

        await markScheduledTriggerInvocationFailed(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: newInvocationId,
        }).catch((err) => {
          logger.error(
            {
              invocationId: newInvocationId,
              error: err instanceof Error ? err.message : String(err),
            },
            'Failed to mark invocation as failed in error handler'
          );
        });
      }
    })();

    // Use waitUntil on Vercel to prevent execution context from being killed
    const waitUntil = await getWaitUntil();
    if (waitUntil) {
      waitUntil(rerunExecutionPromise);
    } else {
      // For local/non-Vercel: fire-and-forget with error logging
      rerunExecutionPromise.catch((error) => {
        logger.error(
          {
            invocationId: newInvocationId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Background rerun execution failed (no waitUntil available)'
        );
      });
    }

    return c.json({
      success: true,
      newInvocationId,
      originalInvocationId: invocationId,
    });
  }
);

/**
 * Run Scheduled Trigger Now
 * Creates a new invocation and executes it immediately (manual trigger).
 * Supports multi-user fan-out: if the trigger has associated users, creates one invocation per user.
 */
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/run',
    summary: 'Run Scheduled Trigger Now',
    operationId: 'run-scheduled-trigger-now',
    tags: ['Scheduled Triggers'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ScheduledTriggerIdParamsSchema,
      query: z.object({
        userId: z.string().optional().describe('Target a specific user for the manual run'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger run initiated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationIds: z.array(z.string()),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id: scheduledTriggerId } = c.req.valid('param');
    const { userId: targetUserId } = c.req.valid('query');
    const callerId = c.get('userId') ?? '';
    const tenantRole = c.get('tenantRole') as OrgRole;
    if (!tenantRole) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing tenant role',
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, targetUserId },
      'Running scheduled trigger now'
    );

    const trigger = await getScheduledTriggerById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    const triggerUsers = await getScheduledTriggerUsers(runDbClient)({
      tenantId,
      scheduledTriggerId,
    });
    const triggerUserIds = triggerUsers.map((u) => u.userId);

    let runAsUserIds: (string | null)[];

    if (triggerUserIds.length > 0) {
      if (targetUserId) {
        if (!triggerUserIds.includes(targetUserId)) {
          throw createApiError({
            code: 'bad_request',
            message: `User ${targetUserId} is not associated with this trigger`,
          });
        }
        runAsUserIds = [targetUserId];
      } else {
        runAsUserIds = triggerUserIds;
      }
    } else {
      runAsUserIds = [trigger.runAsUserId];
    }

    validateRunNowDelegation({
      runAsUserIds,
      callerId,
      tenantRole,
    });

    const maxRetries = trigger.maxRetries ?? 1;
    const retryDelaySeconds = trigger.retryDelaySeconds ?? 60;
    const timeoutSeconds = trigger.timeoutSeconds ?? 780;

    if (!trigger.ref) {
      throw createApiError({
        code: 'bad_request',
        message: 'Scheduled trigger has no ref configured',
      });
    }

    const projectScopedRef = getProjectScopedRef(tenantId, projectId, trigger.ref);
    const resolvedRef = await resolveRef(manageDbClient)(projectScopedRef);

    if (!resolvedRef) {
      throw createApiError({
        code: 'bad_request',
        message: `Failed to resolve ref '${trigger.ref}' for project ${projectId}. The branch may have been deleted.`,
      });
    }

    const scopes = { tenantId, projectId, agentId };
    const timestamp = Date.now();
    const scheduledFor = new Date().toISOString();
    const invocationIds: string[] = [];

    for (const runAsUserId of runAsUserIds) {
      const invocationId = generateId();
      invocationIds.push(invocationId);

      await createScheduledTriggerInvocation(runDbClient)({
        id: invocationId,
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        ref: resolvedRef,
        status: 'pending',
        scheduledFor,
        idempotencyKey: `manual-run-${scheduledTriggerId}-${runAsUserId ?? 'none'}-${timestamp}`,
        attemptNumber: 1,
        runAsUserId,
      });

      logger.info(
        {
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          invocationId,
          maxRetries,
          retryDelaySeconds,
          runAsUserId,
        },
        'Created new invocation for manual run'
      );

      const executionPromise = (async () => {
        try {
          await markScheduledTriggerInvocationRunning(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId,
          });

          const effectivePayload = trigger.payload ?? {};
          const userMessage = trigger.messageTemplate
            ? interpolateTemplate(trigger.messageTemplate, effectivePayload)
            : JSON.stringify(effectivePayload);

          const messageParts: Part[] = [];
          if (trigger.messageTemplate) {
            messageParts.push({ kind: 'text', text: userMessage });
          }
          messageParts.push({
            kind: 'data',
            data: effectivePayload,
            metadata: { source: 'scheduled-trigger', triggerId: scheduledTriggerId },
          });

          if (runAsUserId) {
            const canUse = await canUseProjectStrict({
              userId: runAsUserId,
              tenantId,
              projectId,
            });
            if (!canUse) {
              throw new Error(`User ${runAsUserId} no longer has access to project ${projectId}`);
            }
          }

          const maxAttempts = maxRetries + 1;
          let attemptNumber = 1;
          let lastError: string | null = null;

          const executeWithTimeout = async (conversationId: string): Promise<void> => {
            const timeoutMs = timeoutSeconds * 1000;
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(
                () => reject(new Error(`Execution timed out after ${timeoutSeconds}s`)),
                timeoutMs
              );
            });

            await Promise.race([
              executeAgentAsync({
                tenantId,
                projectId,
                agentId,
                triggerId: scheduledTriggerId,
                invocationId,
                conversationId,
                userMessage,
                messageParts,
                resolvedRef,
                runAsUserId: runAsUserId ?? undefined,
                forwardedHeaders: buildTimezoneHeaders(trigger.cronTimezone),
                invocationType: 'scheduled_trigger',
              }),
              timeoutPromise,
            ]);
          };

          while (attemptNumber <= maxAttempts) {
            const conversationId = generateId();
            let success = false;

            try {
              await executeWithTimeout(conversationId);
              success = true;
            } catch (execErr) {
              lastError = execErr instanceof Error ? execErr.message : String(execErr);
              logger.error(
                { invocationId, attemptNumber, error: lastError },
                'Manual run failed with error'
              );
            }

            await addConversationIdToInvocation(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId,
              conversationId,
            }).catch((err) => {
              logger.error(
                { invocationId, error: err instanceof Error ? err.message : String(err) },
                'Failed to save conversation ID'
              );
            });

            if (success) {
              await markScheduledTriggerInvocationCompleted(runDbClient)({
                scopes,
                scheduledTriggerId,
                invocationId,
              });
              logger.info({ invocationId, conversationId, attemptNumber }, 'Manual run completed');
              lastError = null;
              break;
            }

            if (attemptNumber < maxAttempts) {
              await updateScheduledTriggerInvocationStatus(runDbClient)({
                scopes,
                scheduledTriggerId,
                invocationId,
                data: {
                  attemptNumber: attemptNumber + 1,
                  status: 'running',
                },
              }).catch((err) => {
                logger.error(
                  {
                    invocationId,
                    error: err instanceof Error ? err.message : String(err),
                  },
                  'Failed to update invocation attempt number'
                );
              });

              attemptNumber++;
              const jitter = Math.random() * 0.3;
              await new Promise((resolve) =>
                setTimeout(resolve, retryDelaySeconds * 1000 * (1 + jitter))
              );
            } else {
              break;
            }
          }

          if (lastError) {
            await markScheduledTriggerInvocationFailed(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId,
            }).catch((err) => {
              logger.error(
                {
                  invocationId,
                  error: err instanceof Error ? err.message : String(err),
                },
                'Failed to mark invocation as failed after retries exhausted'
              );
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          logger.error({ invocationId, error }, 'Manual run setup failed');

          await markScheduledTriggerInvocationFailed(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId,
          }).catch((err) => {
            logger.error(
              {
                invocationId,
                error: err instanceof Error ? err.message : String(err),
              },
              'Failed to mark invocation as failed in error handler'
            );
          });
        }
      })();

      const waitUntil = await getWaitUntil();
      if (waitUntil) {
        waitUntil(executionPromise);
      } else {
        executionPromise.catch((error) => {
          logger.error(
            {
              invocationId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Background execution failed (no waitUntil available)'
          );
        });
      }
    }

    return c.json({
      success: true,
      invocationIds,
    });
  }
);

export default app;
