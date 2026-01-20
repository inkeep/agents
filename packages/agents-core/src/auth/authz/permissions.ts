/**
 * SpiceDB Permission Check Functions
 *
 * High-level functions for checking project-level permissions.
 */

import { checkPermission, lookupResources } from './client';
import {
  isAuthzEnabled,
  type OrgRole,
  OrgRoles,
  SpiceDbProjectPermissions,
  SpiceDbResourceTypes,
} from './config';

/**
 * Check if a user can view a project.
 *
 * - If authz is disabled: returns true (current behavior)
 * - If user is org owner/admin: returns true (bypass)
 * - Otherwise: checks SpiceDB
 */
export async function canViewProject(params: {
  tenantId: string;
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  // Authz disabled (globally or for this tenant) = current behavior (all org members see all)
  if (!isAuthzEnabled(params.tenantId)) {
    return true;
  }

  // Org owner/admin bypass
  if (params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN) {
    return true;
  }

  // Check SpiceDB
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
  tenantId: string;
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  // Authz disabled (globally or for this tenant) = current behavior (all org members can use)
  if (!isAuthzEnabled(params.tenantId)) {
    return true;
  }

  // Org owner/admin bypass
  if (params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN) {
    return true;
  }

  // Check SpiceDB
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
  tenantId: string;
  userId: string;
  projectId: string;
  orgRole: OrgRole;
}): Promise<boolean> {
  // Authz disabled (globally or for this tenant) = only org owner/admin can edit
  if (!isAuthzEnabled(params.tenantId)) {
    return params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN;
  }

  // Org owner/admin bypass
  if (params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN) {
    return true;
  }

  // Check SpiceDB
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
  tenantId: string;
  userId: string;
  orgRole: OrgRole;
}): Promise<string[] | 'all'> {
  // Authz disabled (globally or for this tenant) = current behavior (all)
  if (!isAuthzEnabled(params.tenantId)) {
    return 'all';
  }

  // Org owner/admin sees all
  if (params.orgRole === OrgRoles.OWNER || params.orgRole === OrgRoles.ADMIN) {
    return 'all';
  }

  // Use SpiceDB LookupResources
  return lookupResources({
    resourceType: SpiceDbResourceTypes.PROJECT,
    permission: SpiceDbProjectPermissions.VIEW,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}
