import {
  canUseProjectStrict,
  createApiError,
  getUserById,
  type OrgRole,
  OrgRoles,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';

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

  const targetUser = await getUserById(runDbClient)(runAsUserId);
  if (!targetUser) {
    throw createApiError({
      code: 'bad_request',
      message: `User ${runAsUserId} does not exist`,
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

  const targetCanUse = await canUseProjectStrict({
    userId: runAsUserId,
    tenantId,
    projectId,
  });

  if (!targetCanUse) {
    throw createApiError({
      code: 'bad_request',
      message: `User ${runAsUserId} does not have 'use' permission on this project`,
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
