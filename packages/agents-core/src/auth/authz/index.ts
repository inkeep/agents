/**
 * SpiceDB Authorization Module
 *
 * Exports for project-level access control using SpiceDB.
 */

// Client
export {
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
  type ProjectRole,
  SpiceDbPermissions,
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
  changeProjectRole,
  grantProjectAccess,
  listProjectMembers,
  removeProjectFromSpiceDb,
  revokeProjectAccess,
  syncOrgMemberToSpiceDb,
  syncProjectToSpiceDb,
} from './sync';
