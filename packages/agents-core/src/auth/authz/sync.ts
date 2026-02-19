/**
 * SpiceDB Sync Utilities
 *
 * Functions for syncing data between better-auth and SpiceDB.
 */

import {
  deleteRelationship,
  getSpiceClient,
  RelationshipOperation,
  readRelationships,
  writeRelationship,
} from './client';
import { fromSpiceDbProjectId, toSpiceDbProjectId } from './config';
import { type OrgRole, type ProjectRole, SpiceDbRelations, SpiceDbResourceTypes } from './types';

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
 * Change a user's organization role.
 * Removes the old role and adds the new one atomically in a single transaction.
 * Call when: user's org role is updated (e.g., member -> admin).
 */
export async function changeOrgRole(params: {
  tenantId: string;
  userId: string;
  oldRole: OrgRole;
  newRole: OrgRole;
}): Promise<void> {
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
        operation: RelationshipOperation.DELETE,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.ORGANIZATION,
            objectId: params.tenantId,
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
        operation: RelationshipOperation.TOUCH,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.ORGANIZATION,
            objectId: params.tenantId,
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
 * Sync a new project to SpiceDB.
 * Links project to org and grants creator project_admin role (if not already org admin/owner).
 * Call when: project is created.
 */
export async function syncProjectToSpiceDb(params: {
  tenantId: string;
  projectId: string;
  creatorUserId: string;
}): Promise<void> {
  const spice = getSpiceClient();

  // Check if user is org admin/owner (they already have full access via inheritance)
  const orgRoles = await readRelationships({
    resourceType: SpiceDbResourceTypes.ORGANIZATION,
    resourceId: params.tenantId,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.creatorUserId,
  });

  const isOrgAdminOrOwner = orgRoles.some(
    (r) => r.relation === SpiceDbRelations.ADMIN || r.relation === SpiceDbRelations.OWNER
  );

  const spiceProjectId = toSpiceDbProjectId(params.tenantId, params.projectId);

  const updates: Parameters<typeof spice.promises.writeRelationships>[0]['updates'] = [
    // Link project to organization
    {
      operation: RelationshipOperation.TOUCH,
      relationship: {
        resource: {
          objectType: SpiceDbResourceTypes.PROJECT,
          objectId: spiceProjectId,
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
  ];

  // Only grant project_admin if user is NOT org admin/owner
  if (!isOrgAdminOrOwner) {
    updates.push({
      operation: RelationshipOperation.TOUCH,
      relationship: {
        resource: {
          objectType: SpiceDbResourceTypes.PROJECT,
          objectId: spiceProjectId,
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
    });
  }

  await spice.promises.writeRelationships({
    updates,
    optionalPreconditions: [],
    optionalTransactionMetadata: undefined,
  });
}

/**
 * Grant project access to a user.
 */
export async function grantProjectAccess(params: {
  tenantId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}): Promise<void> {
  await writeRelationship({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: toSpiceDbProjectId(params.tenantId, params.projectId),
    relation: params.role,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });
}

/**
 * Revoke project access from a user.
 */
export async function revokeProjectAccess(params: {
  tenantId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}): Promise<void> {
  await deleteRelationship({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: toSpiceDbProjectId(params.tenantId, params.projectId),
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
  tenantId: string;
  projectId: string;
  userId: string;
  oldRole: ProjectRole;
  newRole: ProjectRole;
}): Promise<void> {
  // Skip if roles are the same
  if (params.oldRole === params.newRole) {
    return;
  }

  const spice = getSpiceClient();
  const spiceProjectId = toSpiceDbProjectId(params.tenantId, params.projectId);

  // Atomic batch: DELETE old role + TOUCH new role
  await spice.promises.writeRelationships({
    updates: [
      // Delete old role
      {
        operation: RelationshipOperation.DELETE,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: spiceProjectId,
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
        operation: RelationshipOperation.TOUCH,
        relationship: {
          resource: {
            objectType: SpiceDbResourceTypes.PROJECT,
            objectId: spiceProjectId,
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
export async function removeProjectFromSpiceDb(params: {
  tenantId: string;
  projectId: string;
}): Promise<void> {
  const spice = getSpiceClient();

  // Delete all relationships for this project (tenant-scoped ID prevents cross-tenant deletion)
  await spice.promises.deleteRelationships({
    relationshipFilter: {
      resourceType: SpiceDbResourceTypes.PROJECT,
      optionalResourceId: toSpiceDbProjectId(params.tenantId, params.projectId),
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
  tenantId: string;
  projectId: string;
}): Promise<Array<{ userId: string; role: ProjectRole }>> {
  const relationships = await readRelationships({
    resourceType: SpiceDbResourceTypes.PROJECT,
    resourceId: toSpiceDbProjectId(params.tenantId, params.projectId),
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

/**
 * List all project memberships for a specific user.
 * Returns projects where the user has explicit project_admin, project_member, or project_viewer roles.
 */
export async function listUserProjectMembershipsInSpiceDb(params: {
  tenantId: string;
  userId: string;
}): Promise<Array<{ projectId: string; role: ProjectRole }>> {
  // Read all project relationships where this user is the subject
  const relationships = await readRelationships({
    resourceType: SpiceDbResourceTypes.PROJECT,
    subjectType: SpiceDbResourceTypes.USER,
    subjectId: params.userId,
  });

  // Filter to only project roles within this tenant
  return relationships
    .filter(
      (rel) =>
        rel.relation === SpiceDbRelations.PROJECT_ADMIN ||
        rel.relation === SpiceDbRelations.PROJECT_MEMBER ||
        rel.relation === SpiceDbRelations.PROJECT_VIEWER
    )
    .flatMap((rel) => {
      try {
        const parsed = fromSpiceDbProjectId(rel.resourceId);
        if (parsed.tenantId !== params.tenantId) return [];
        return [{ projectId: parsed.projectId, role: rel.relation as ProjectRole }];
      } catch {
        return [];
      }
    });
}

/**
 * Revoke all project memberships for a user within a specific tenant.
 * Call when: user is removed from org, or promoted to org admin (inherited access makes explicit roles redundant).
 *
 * Uses efficient bulk delete with tenant-scoped prefix to prevent cross-tenant side effects.
 */
export async function revokeAllProjectMemberships(params: {
  tenantId: string;
  userId: string;
}): Promise<void> {
  const spice = getSpiceClient();

  // Efficiently delete project memberships for this user within this tenant.
  // Use the tenant prefix to scope deletions — prevents cross-tenant side effects.
  const tenantPrefix = `${params.tenantId}/`;

  // One call per project role type (project_admin, project_member, project_viewer)
  await Promise.all([
    spice.promises.deleteRelationships({
      relationshipFilter: {
        resourceType: SpiceDbResourceTypes.PROJECT,
        optionalResourceId: '',
        optionalResourceIdPrefix: tenantPrefix,
        optionalRelation: SpiceDbRelations.PROJECT_ADMIN,
        optionalSubjectFilter: {
          subjectType: SpiceDbResourceTypes.USER,
          optionalSubjectId: params.userId,
          optionalRelation: undefined,
        },
      },
      optionalPreconditions: [],
      optionalLimit: 0,
      optionalAllowPartialDeletions: false,
      optionalTransactionMetadata: undefined,
    }),
    spice.promises.deleteRelationships({
      relationshipFilter: {
        resourceType: SpiceDbResourceTypes.PROJECT,
        optionalResourceId: '',
        optionalResourceIdPrefix: tenantPrefix,
        optionalRelation: SpiceDbRelations.PROJECT_MEMBER,
        optionalSubjectFilter: {
          subjectType: SpiceDbResourceTypes.USER,
          optionalSubjectId: params.userId,
          optionalRelation: undefined,
        },
      },
      optionalPreconditions: [],
      optionalLimit: 0,
      optionalAllowPartialDeletions: false,
      optionalTransactionMetadata: undefined,
    }),
    spice.promises.deleteRelationships({
      relationshipFilter: {
        resourceType: SpiceDbResourceTypes.PROJECT,
        optionalResourceId: '',
        optionalResourceIdPrefix: tenantPrefix,
        optionalRelation: SpiceDbRelations.PROJECT_VIEWER,
        optionalSubjectFilter: {
          subjectType: SpiceDbResourceTypes.USER,
          optionalSubjectId: params.userId,
          optionalRelation: undefined,
        },
      },
      optionalPreconditions: [],
      optionalLimit: 0,
      optionalAllowPartialDeletions: false,
      optionalTransactionMetadata: undefined,
    }),
  ]);
}
