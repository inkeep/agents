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
  fromSpiceDbProjectId,
  getSpiceDbConfig,
  type SpiceDbCredentialReferenceId,
  type SpiceDbProjectId,
  toSpiceDbCredentialReferenceId,
  toSpiceDbProjectId,
} from './config';

// Credential gateway helpers
export {
  canAppReadCredential,
  grantAppCredentialAccess,
  revokeAppCredentialAccess,
  rewriteAppCredentialAccess,
} from './credential-gateway';

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
  type SpiceDbCredentialReferencePermission,
  SpiceDbCredentialReferencePermissions,
  type SpiceDbOrgPermission,
  SpiceDbOrgPermissions,
  type SpiceDbProjectPermission,
  SpiceDbProjectPermissions,
  SpiceDbRelations,
  SpiceDbResourceTypes,
} from './types';
