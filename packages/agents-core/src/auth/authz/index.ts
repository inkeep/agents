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
export {
  getSpiceDbConfig,
  isAuthzEnabled,
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
} from './config';

// Permission checks
export {
  canEditProject,
  canUseProject,
  canViewProject,
  listAccessibleProjectIds,
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
