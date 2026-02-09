/**
 * SpiceDB Permission Check Functions
 *
 * High-level functions for checking project-level permissions.
 */

import { checkPermission, lookupResources } from './client';
import { type OrgRole, OrgRoles, SpiceDbProjectPermissions, SpiceDbResourceTypes } from './types';

/**
 * Check if a user can view a project.
 *
 * - If authz is disabled: returns true (current behavior)
 * - If user is org owner/admin: returns true (bypass)
 * - Otherwise: checks SpiceDB
 */
export async function canViewProject(params: {
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  const isAdmin = params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN;

  // Bypass SpiceDB check if authz disabled or user is admin
  if (isAdmin) {
    return true;
  }

  // Check SpiceDB for non-admin users
  return checkPermission({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    permission: SpiceDbProjectPermissions.VIEW,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Check if a user can use a project (invoke agents, create API keys, view traces).
 *
 * - If authz is disabled: returns true (current behavior)
 * - If user is org owner/admin: returns true (bypass)
 * - Otherwise: checks SpiceDB for use permission
 */
export async function canUseProject(params: {
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  const isAdmin = params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN;

  // Bypass SpiceDB check if authz disabled or user is admin
  if (isAdmin) {
    return true;
  }

  // Check SpiceDB for non-admin users
  return checkPermission({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    permission: SpiceDbProjectPermissions.USE,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Check if a user can use a project - always checks SpiceDB.
 *
 * Use this when orgRole is not available (e.g., run-api from JWT).
 */
export async function canUseProjectStrict(params: {
  userId: string;
  projectId: string;
}): Promise<boolean> {
  // System users and API key users bypass project access checks
  const bypassCheck = params.userId === 'system' || params.userId.startsWith('apikey:');
  if (bypassCheck) {
    return true;
  }
  return checkPermission({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    permission: SpiceDbProjectPermissions.USE,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Check if a user can edit a project (modify configurations).
 *
 * - If authz is disabled: only org owner/admin can edit
 * - If user is org owner/admin: returns true (bypass)
 * - Otherwise: checks SpiceDB for edit permission
 */
export async function canEditProject(params: {
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  const isAdmin = params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN;

  // Admins always have full access
  if (isAdmin) {
    return true;
  }

  // Check SpiceDB for non-admin users
  return checkPermission({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    permission: SpiceDbProjectPermissions.EDIT,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Get list of accessible project IDs for a user.
 *
 * - If authz is disabled: returns 'all' (no filtering needed)
 * - If user is org owner/admin: returns 'all' (no filtering needed)
 * - Otherwise: uses SpiceDB LookupResources
 */
export async function listAccessibleProjectIds(params: {
  userId: string;
  orgRole: OrgRole;
}): Promise<string[] | 'all'> {
  const isAdmin = params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN;

  if (isAdmin) {
    return 'all';
  }

  // Use SpiceDB LookupResources for non-admin users
  return lookupResources({
    resourceType: SpiceDbResourceTypes.PROJECT,
    permission: SpiceDbProjectPermissions.VIEW,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Get list of usable project IDs for a user - always checks SpiceDB.
 */
export async function listUsableProjectIds(params: { userId: string }): Promise<string[]> {
  return lookupResources({
    resourceType: SpiceDbResourceTypes.PROJECT,
    permission: SpiceDbProjectPermissions.USE,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}
