/**
 * SpiceDB Sync Utilities
 *
 * Functions for syncing data between better-auth and SpiceDB.
 */

import { deleteRelationship, getSpiceClient, readRelationships, writeRelationship } from './client';
import {
  isAuthzEnabled,
  type OrgRole,
  type ProjectRole,
  SpiceDbRelations,
  SpiceDbResourceTypes,
} from './config';

// Constants for relationship operations
const RELATIONSHIP_OPERATION_CREATE = 1;
const RELATIONSHIP_OPERATION_TOUCH = 2;
const RELATIONSHIP_OPERATION_DELETE = 3;

/**
 * Sync a user's org membership to SpiceDB.
 * Call when: user joins org, role changes, user leaves org.
 */
export async function syncOrgMemberToSpiceDb(params: {
  tenantId: string;
  userId: string;
  role: OrgRole;
  action: 'add' | 'remove';
}): Promise<void> {
  if (!isAuthzEnabled()) return;

  if (params.action === 'add') {
    await writeRelationship({
      resourceType: SpiceDbResourceTypes.ORGANIZATION,
      resourceId: params.tenantId,
      relation: params.role,
      subjectType: SpiceDbResourceTypes.USER,
      subjectId: params.userId,
    });
  } else {
    await deleteRelationship({
      resourceType: SpiceDbResourceTypes.ORGANIZATION,
      resourceId: params.tenantId,
      relation: params.role,
      subjectType: SpiceDbResourceTypes.USER,
      subjectId: params.userId,
    });
  }
}

/**
 * Sync a new project to SpiceDB.
 * Links project to org and grants creator project_admin role.
 * Call when: project is created.
 */
export async function syncProjectToSpiceDb(params: {
  tenantId: string;
  projectId: string;
  creatorUserId: string;
}): Promise<void> {
  if (!isAuthzEnabled()) return;

  const spice = getSpiceClient();

  await spice.promises.writeRelationships({
    updates: [
      // Link project to organization
      {
        operation: RELATIONSHIP_OPERATION_CREATE,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: params.projectId,
          },
          relation: SpiceDbRelations.ORGANIZATION,
          subject: {
            object: {
              objectType: SpiceDbResourceTypes.ORGANIZATION,
              objectId: params.tenantId,
            },
            optionalRelation: '',
          },
          optionalCaveat: undefined,
        },
      },
      // Grant creator project_admin role
      {
        operation: RELATIONSHIP_OPERATION_CREATE,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: params.projectId,
          },
          relation: SpiceDbRelations.PROJECT_ADMIN,
          subject: {
            object: {
              objectType: SpiceDbResourceTypes.USER,
              objectId: params.creatorUserId,
            },
            optionalRelation: '',
          },
          optionalCaveat: undefined,
        },
      },
    ],
    optionalPreconditions: [],
    optionalTransactionMetadata: undefined,
  });
}

/**
 * Grant project access to a user.
 */
export async function grantProjectAccess(params: {
  projectId: string;
  userId: string;
  role: ProjectRole;
}): Promise<void> {
  if (!isAuthzEnabled()) {
    throw new Error('Authorization is not enabled');
  }

  await writeRelationship({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    relation: params.role,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Revoke project access from a user.
 */
export async function revokeProjectAccess(params: {
  projectId: string;
  userId: string;
  role: ProjectRole;
}): Promise<void> {
  if (!isAuthzEnabled()) {
    throw new Error('Authorization is not enabled');
  }

  await deleteRelationship({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
    relation: params.role,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Change a user's project role.
 * Removes the old role and adds the new one atomically in a single transaction.
 */
export async function changeProjectRole(params: {
  projectId: string;
  userId: string;
  oldRole: ProjectRole;
  newRole: ProjectRole;
}): Promise<void> {
  if (!isAuthzEnabled()) {
    throw new Error('Authorization is not enabled');
  }

  // Skip if roles are the same
  if (params.oldRole === params.newRole) {
    return;
  }

  const spice = getSpiceClient();

  // Atomic batch: DELETE old role + TOUCH new role
  await spice.promises.writeRelationships({
    updates: [
      // Delete old role
      {
        operation: RELATIONSHIP_OPERATION_DELETE,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: params.projectId,
          },
          relation: params.oldRole,
          subject: {
            object: {
              objectType: SpiceDbResourceTypes.USER,
              objectId: params.userId,
            },
            optionalRelation: '',
          },
          optionalCaveat: undefined,
        },
      },
      // Add new role (TOUCH = upsert, safe if already exists)
      {
        operation: RELATIONSHIP_OPERATION_TOUCH,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: params.projectId,
          },
          relation: params.newRole,
          subject: {
            object: {
              objectType: SpiceDbResourceTypes.USER,
              objectId: params.userId,
            },
            optionalRelation: '',
          },
          optionalCaveat: undefined,
        },
      },
    ],
    optionalPreconditions: [],
    optionalTransactionMetadata: undefined,
  });
}

/**
 * Remove a project from SpiceDB.
 * Call when: project is deleted.
 */
export async function removeProjectFromSpiceDb(params: { projectId: string }): Promise<void> {
  if (!isAuthzEnabled()) return;

  const spice = getSpiceClient();

  // Delete all relationships for this project
  await spice.promises.deleteRelationships({
    relationshipFilter: {
      resourceType: SpiceDbResourceTypes.PROJECT,
      optionalResourceId: params.projectId,
      optionalResourceIdPrefix: '',
      optionalRelation: '',
    },
    optionalPreconditions: [],
    optionalLimit: 0,
    optionalAllowPartialDeletions: false,
    optionalTransactionMetadata: undefined,
  });
}

/**
 * List all explicit project members from SpiceDB.
 * Returns users with project_admin, project_member, or project_viewer roles.
 */
export async function listProjectMembers(params: {
  projectId: string;
}): Promise<Array<{ userId: string; role: ProjectRole }>> {
  if (!isAuthzEnabled()) {
    return [];
  }

  const relationships = await readRelationships({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: params.projectId,
  });

  // Filter to only user subjects with project roles
  return relationships
    .filter(
      (rel) =>
        rel.subjectType === SpiceDbResourceTypes.USER &&
        (rel.relation === SpiceDbRelations.PROJECT_ADMIN ||
          rel.relation === SpiceDbRelations.PROJECT_MEMBER ||
          rel.relation === SpiceDbRelations.PROJECT_VIEWER)
    )
    .map((rel) => ({
      userId: rel.subjectId,
      role: rel.relation as ProjectRole,
    }));
}
