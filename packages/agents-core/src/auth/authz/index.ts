/**
 * SpiceDB Authorization Module
 *
 * Exports for project-level access control using SpiceDB.
 */

// Client
export {
  checkBulkPermissions,
  checkPermission,
  deleteRelationship,
  getSpiceClient,
  lookupResources,
  readRelationships,
  resetSpiceClient,
  writeRelationship,
} from './client';
// Configuration
export { getSpiceDbConfig } from './config';
// Errors
export { SpiceDbError } from './errors';
// Permission checks
export {
  canEditProject,
  canUseProject,
  canUseProjectStrict,
  canViewProject,
  listAccessibleProjectIds,
  listUsableProjectIds,
} from './permissions';
// Sync utilities
export {
  changeOrgRole,
  changeProjectRole,
  grantProjectAccess,
  listProjectMembers,
  listUserProjectMembershipsInSpiceDb,
  removeProjectFromSpiceDb,
  revokeAllProjectMemberships,
  revokeProjectAccess,
  syncOrgMemberToSpiceDb,
  syncProjectToSpiceDb,
} from './sync';
export {
  type OrgRole,
  OrgRoles,
  type ProjectPermissionLevel,
  type ProjectPermissions,
  type ProjectRole,
  ProjectRoles,
  type SpiceDbOrgPermission,
  SpiceDbOrgPermissions,
  type SpiceDbProjectPermission,
  SpiceDbProjectPermissions,
  SpiceDbRelations,
  SpiceDbResourceTypes,
} from './types';
