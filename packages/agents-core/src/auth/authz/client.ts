/**
 * SpiceDB Client Wrapper
 *
 * Provides a singleton SpiceDB client and helper functions for common operations.
 */

import { v1 } from '@authzed/authzed-node';
import { getSpiceDbConfig } from './config';

// Import enums from v1 namespace
const { RelationshipUpdate_Operation, CheckPermissionResponse_Permissionship } = v1;

type ZedClientInterface = ReturnType<typeof v1.NewClient>;

let client: ZedClientInterface | null = null;

/**
 * Get the SpiceDB client singleton.
 * Creates a new client on first call.
 */
export function getSpiceClient(): ZedClientInterface {
  if (!client) {
    const config = getSpiceDbConfig();
    client = v1.NewClient(
      config.token,
      config.endpoint,
      config.tlsEnabled
        ? v1.ClientSecurity.SECURE
        : v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
    );
  }
  return client;
}

/**
 * Reset the client (useful for testing)
 */
export function resetSpiceClient(): void {
  client = null;
}

// Re-export enums for use in other modules
export const RelationshipOperation = RelationshipUpdate_Operation;
export const Permissionship = CheckPermissionResponse_Permissionship;

// Re-export v1 for access to types
export { v1 };

/**
 * Check if a subject has a permission on a resource.
 */
export async function checkPermission(params: {
  resourceType: string;
  resourceId: string;
  permission: string;
  subjectType: string;
  subjectId: string;
}): Promise<boolean> {
  const spice = getSpiceClient();

  const response = await spice.promises.checkPermission({
    resource: { objectType: params.resourceType, objectId: params.resourceId },
    permission: params.permission,
    subject: {
      object: { objectType: params.subjectType, objectId: params.subjectId },
      optionalRelation: '',
    },
    consistency: {
      requirement: {
        oneofKind: 'fullyConsistent',
        fullyConsistent: true,
      },
    },
    context: undefined,
    withTracing: false,
  });

  return response.permissionship === CheckPermissionResponse_Permissionship.HAS_PERMISSION;
}

/**
 * Check multiple permissions on a resource in a single request.
 * More efficient than multiple checkPermission calls.
 *
 * @returns Record mapping permission names to boolean results
 */
export async function checkBulkPermissions(params: {
  resourceType: string;
  resourceId: string;
  permissions: string[];
  subjectType: string;
  subjectId: string;
}): Promise<Record<string, boolean>> {
  const spice = getSpiceClient();

  // Build the bulk check request items
  const items = params.permissions.map((permission) =>
    v1.CheckBulkPermissionsRequestItem.create({
      resource: v1.ObjectReference.create({
        objectType: params.resourceType,
        objectId: params.resourceId,
      }),
      permission,
      subject: v1.SubjectReference.create({
        object: v1.ObjectReference.create({
          objectType: params.subjectType,
          objectId: params.subjectId,
        }),
      }),
    })
  );

  const response = await spice.promises.checkBulkPermissions(
    v1.CheckBulkPermissionsRequest.create({
      items,
      consistency: {
        requirement: {
          oneofKind: 'fullyConsistent',
          fullyConsistent: true,
        },
      },
    })
  );

  // Map results back to permission names
  const result: Record<string, boolean> = {};
  for (let i = 0; i < params.permissions.length; i++) {
    const permission = params.permissions[i];
    const pair = response.pairs[i];

    // Check if the response indicates permission
    if (pair.response.oneofKind === 'item') {
      result[permission] =
        pair.response.item.permissionship === CheckPermissionResponse_Permissionship.HAS_PERMISSION;
    } else {
      // Error case - treat as no permission
      result[permission] = false;
    }
  }

  return result;
}

/**
 * Find all resources of a type that a subject has a permission on.
 */
export async function lookupResources(params: {
  resourceType: string;
  permission: string;
  subjectType: string;
  subjectId: string;
}): Promise<string[]> {
  const spice = getSpiceClient();

  const responses = await spice.promises.lookupResources({
    resourceObjectType: params.resourceType,
    permission: params.permission,
    subject: {
      object: { objectType: params.subjectType, objectId: params.subjectId },
      optionalRelation: '',
    },
    consistency: {
      requirement: {
        oneofKind: 'fullyConsistent',
        fullyConsistent: true,
      },
    },
    context: undefined,
    optionalLimit: 0,
    optionalCursor: undefined,
  });

  return responses.map((item: { resourceObjectId: string }) => item.resourceObjectId);
}

/**
 * Write a relationship to SpiceDB.
 */
export async function writeRelationship(params: {
  resourceType: string;
  resourceId: string;
  relation: string;
  subjectType: string;
  subjectId: string;
}): Promise<void> {
  const spice = getSpiceClient();

  await spice.promises.writeRelationships({
    updates: [
      {
        operation: RelationshipUpdate_Operation.TOUCH, // TOUCH = upsert, idempotent and safe for retries
        relationship: {
          resource: { objectType: params.resourceType, objectId: params.resourceId },
          relation: params.relation,
          subject: {
            object: { objectType: params.subjectType, objectId: params.subjectId },
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
 * Delete a relationship from SpiceDB.
 */
export async function deleteRelationship(params: {
  resourceType: string;
  resourceId: string;
  relation: string;
  subjectType: string;
  subjectId: string;
}): Promise<void> {
  const spice = getSpiceClient();

  await spice.promises.deleteRelationships({
    relationshipFilter: {
      resourceType: params.resourceType,
      optionalResourceId: params.resourceId,
      optionalResourceIdPrefix: '',
      optionalRelation: params.relation,
      optionalSubjectFilter: {
        subjectType: params.subjectType,
        optionalSubjectId: params.subjectId,
        optionalRelation: undefined,
      },
    },
    optionalPreconditions: [],
    optionalLimit: 0,
    optionalAllowPartialDeletions: false,
    optionalTransactionMetadata: undefined,
  });
}

/**
 * Read relationships for a resource to list subjects with access.
 * Optionally filter by subject type and ID.
 */
export async function readRelationships(params: {
  resourceType: string;
  resourceId?: string;
  relation?: string;
  subjectType?: string;
  subjectId?: string;
}): Promise<
  Array<{ resourceId: string; subjectType: string; subjectId: string; relation: string }>
> {
  const spice = getSpiceClient();

  const responses = await spice.promises.readRelationships({
    relationshipFilter: {
      resourceType: params.resourceType,
      optionalResourceId: params.resourceId || '',
      optionalResourceIdPrefix: '',
      optionalRelation: params.relation || '',
      optionalSubjectFilter:
        params.subjectType || params.subjectId
          ? {
              subjectType: params.subjectType || '',
              optionalSubjectId: params.subjectId || '',
              optionalRelation: undefined,
            }
          : undefined,
    },
    consistency: {
      requirement: {
        oneofKind: 'fullyConsistent',
        fullyConsistent: true,
      },
    },
    optionalLimit: 0,
    optionalCursor: undefined,
  });

  return responses.map((item: v1.ReadRelationshipsResponse) => ({
    resourceId: item.relationship?.resource?.objectId || '',
    subjectType: item.relationship?.subject?.object?.objectType || '',
    subjectId: item.relationship?.subject?.object?.objectId || '',
    relation: item.relationship?.relation || '',
  }));
}
