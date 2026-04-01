import {
  canUseProjectStrict,
  createApiError,
  getOrganizationMemberByUserId,
  type OrgRole,
  OrgRoles,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { isEntityChanged } from '../../../utils/entityDiff';

const INVALID_RUN_AS_USER =
  'Invalid runAsUserId: user not found or does not have permission on this project';

export async function validateRunAsUserIds(params: {
  runAsUserIds: string[];
  callerId: string;
  tenantId: string;
  projectId: string;
  tenantRole: OrgRole;
}): Promise<void> {
  const { runAsUserIds, callerId, tenantId, projectId, tenantRole } = params;
  const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;

  for (const userId of runAsUserIds) {
    if (userId === 'system' || userId.startsWith('apikey:')) {
      throw createApiError({
        code: 'bad_request',
        message: 'runAsUserIds must contain real user IDs, not system identifiers',
      });
    }

    if (userId !== callerId && !isAdmin) {
      throw createApiError({
        code: 'forbidden',
        message:
          'Only org admins or owners can set runAsUserIds to include other users. Regular users can only include themselves.',
      });
    }

    const targetMember = await getOrganizationMemberByUserId(runDbClient)(tenantId, userId);
    if (!targetMember) {
      throw createApiError({
        code: 'bad_request',
        message: `Invalid runAsUserIds: user ${userId} not found or is not an organization member`,
      });
    }

    const targetCanUse = await canUseProjectStrict({
      userId,
      tenantId,
      projectId,
    });

    if (!targetCanUse) {
      throw createApiError({
        code: 'bad_request',
        message: `Invalid runAsUserIds: user ${userId} does not have permission on this project`,
      });
    }
  }
}

export async function validateRunAsUserId(params: {
  runAsUserId: string;
  callerId: string;
  tenantId: string;
  projectId: string;
  tenantRole: OrgRole;
}): Promise<void> {
  const { runAsUserId, callerId, tenantId, projectId, tenantRole } = params;

  if (runAsUserId === 'system' || runAsUserId.startsWith('apikey:')) {
    throw createApiError({
      code: 'bad_request',
      message: 'runAsUserId must be a real user ID, not a system identifier',
    });
  }

  const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;

  if (runAsUserId !== callerId && !isAdmin) {
    throw createApiError({
      code: 'forbidden',
      message:
        'Only org admins or owners can set runAsUserId to a different user. Regular users can only set runAsUserId to themselves.',
    });
  }

  const targetMember = await getOrganizationMemberByUserId(runDbClient)(tenantId, runAsUserId);
  if (!targetMember) {
    throw createApiError({
      code: 'bad_request',
      message: INVALID_RUN_AS_USER,
    });
  }

  const targetCanUse = await canUseProjectStrict({
    userId: runAsUserId,
    tenantId,
    projectId,
  });

  if (!targetCanUse) {
    throw createApiError({
      code: 'bad_request',
      message: INVALID_RUN_AS_USER,
    });
  }
}

/**
 * Check if a non-admin user is allowed to mutate a trigger.
 * Admins can mutate any trigger. Non-admins can only mutate triggers they created or that run as them.
 */
export function assertCanMutateTrigger(params: {
  trigger: { createdBy?: string | null; runAsUserId?: string | null };
  callerId: string;
  tenantRole: OrgRole;
}): void {
  const { trigger, callerId, tenantRole } = params;
  const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
  if (isAdmin) return;
  if (trigger.createdBy === callerId || trigger.runAsUserId === callerId) return;
  throw createApiError({
    code: 'forbidden',
    message: 'You can only modify triggers that you created or that are configured to run as you.',
  });
}

export async function validateTriggerPermissions(params: {
  triggerData: {
    runAsUserId?: string | null;
    runAsUserIds?: string[];
    createdBy?: string | null;
    [key: string]: unknown;
  };
  existing: { id: string; runAsUserId?: string | null; createdBy?: string | null } | undefined;
  callerId: string;
  tenantId: string;
  projectId: string;
  tenantRole: OrgRole;
}): Promise<void> {
  const { triggerData, existing, callerId, tenantId, projectId, tenantRole } = params;

  if (existing) {
    if (!isEntityChanged(triggerData, existing as Record<string, unknown>)) return;

    assertCanMutateTrigger({ trigger: existing, callerId, tenantRole });

    if (triggerData.runAsUserIds && triggerData.runAsUserIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds: triggerData.runAsUserIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    } else if (triggerData.runAsUserId !== existing.runAsUserId && triggerData.runAsUserId) {
      await validateRunAsUserId({
        runAsUserId: triggerData.runAsUserId,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }
  } else {
    if (triggerData.runAsUserIds && triggerData.runAsUserIds.length > 0) {
      await validateRunAsUserIds({
        runAsUserIds: triggerData.runAsUserIds,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    } else if (triggerData.runAsUserId) {
      await validateRunAsUserId({
        runAsUserId: triggerData.runAsUserId,
        callerId,
        tenantId,
        projectId,
        tenantRole,
      });
    }
    triggerData.createdBy = callerId;
  }
}
