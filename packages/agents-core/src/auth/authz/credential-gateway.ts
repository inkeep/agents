import {
  checkPermission,
  deleteRelationship,
  getSpiceClient,
  RelationshipOperation,
  writeRelationship,
} from './client';
import { type SpiceDbCredentialReferenceId, toSpiceDbCredentialReferenceId } from './config';
import { SpiceDbRelations, SpiceDbResourceTypes } from './types';

/**
 * Grant an app permission to read a credential.
 *
 * Requires the full credential scope (tenantId + projectId + credentialReferenceId)
 * because credential_reference IDs are only unique within a project; the SpiceDB
 * object ID is constructed via {@link toSpiceDbCredentialReferenceId}.
 */
export async function grantAppCredentialAccess(params: {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
  appId: string;
}): Promise<void> {
  await writeRelationship({
    resourceType: SpiceDbResourceTypes.CREDENTIAL_REFERENCE,
    resourceId: toSpiceDbCredentialReferenceId(
      params.tenantId,
      params.projectId,
      params.credentialReferenceId
    ),
    relation: SpiceDbRelations.APP_READER,
    subjectType: SpiceDbResourceTypes.APP,
    subjectId: params.appId,
  });
}

/**
 * Revoke an app's permission to read a credential.
 */
export async function revokeAppCredentialAccess(params: {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
  appId: string;
}): Promise<void> {
  await deleteRelationship({
    resourceType: SpiceDbResourceTypes.CREDENTIAL_REFERENCE,
    resourceId: toSpiceDbCredentialReferenceId(
      params.tenantId,
      params.projectId,
      params.credentialReferenceId
    ),
    relation: SpiceDbRelations.APP_READER,
    subjectType: SpiceDbResourceTypes.APP,
    subjectId: params.appId,
  });
}

/**
 * Check whether an app has permission to read a credential.
 */
export async function canAppReadCredential(params: {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
  appId: string;
}): Promise<boolean> {
  return checkPermission({
    resourceType: SpiceDbResourceTypes.CREDENTIAL_REFERENCE,
    resourceId: toSpiceDbCredentialReferenceId(
      params.tenantId,
      params.projectId,
      params.credentialReferenceId
    ),
    permission: 'read',
    subjectType: SpiceDbResourceTypes.APP,
    subjectId: params.appId,
  });
}

/**
 * Atomically reconcile the credential an app is granted read access to.
 *
 * One call covers all transitions:
 *   - prior=∅, next=∅              → no-op
 *   - prior=∅, next=Y              → TOUCH new
 *   - prior=X, next=∅              → DELETE old  (fixes the "user cleared the credential" case)
 *   - prior=X, next=X              → idempotent TOUCH (collapsed, safe no-op in practice)
 *   - prior=X, next=Y (X≠Y)        → DELETE old + TOUCH new in a single writeRelationships batch
 *
 * All mutations are issued via `WriteRelationships.updates[]`, so any transition
 * involving both a delete and a write is observed atomically by readers (one
 * zedtoken, no window where neither the old nor the new tuple is valid).
 *
 * Mirrors the pattern used by `changeOrgRole` / `changeProjectRole` in sync.ts.
 */
export async function rewriteAppCredentialAccess(params: {
  tenantId: string;
  projectId: string;
  priorCredentialReferenceId?: string;
  nextCredentialReferenceId?: string;
  appId: string;
}): Promise<void> {
  const { priorCredentialReferenceId, nextCredentialReferenceId, tenantId, projectId, appId } =
    params;

  if (!priorCredentialReferenceId && !nextCredentialReferenceId) {
    return;
  }

  const spice = getSpiceClient();
  const updates: Parameters<typeof spice.promises.writeRelationships>[0]['updates'] = [];

  if (priorCredentialReferenceId && priorCredentialReferenceId !== nextCredentialReferenceId) {
    const priorId: SpiceDbCredentialReferenceId = toSpiceDbCredentialReferenceId(
      tenantId,
      projectId,
      priorCredentialReferenceId
    );
    updates.push({
      operation: RelationshipOperation.DELETE,
      relationship: {
        resource: {
          objectType: SpiceDbResourceTypes.CREDENTIAL_REFERENCE,
          objectId: priorId,
        },
        relation: SpiceDbRelations.APP_READER,
        subject: {
          object: { objectType: SpiceDbResourceTypes.APP, objectId: appId },
          optionalRelation: '',
        },
        optionalCaveat: undefined,
      },
    });
  }

  if (nextCredentialReferenceId) {
    const nextId: SpiceDbCredentialReferenceId = toSpiceDbCredentialReferenceId(
      tenantId,
      projectId,
      nextCredentialReferenceId
    );
    updates.push({
      operation: RelationshipOperation.TOUCH,
      relationship: {
        resource: {
          objectType: SpiceDbResourceTypes.CREDENTIAL_REFERENCE,
          objectId: nextId,
        },
        relation: SpiceDbRelations.APP_READER,
        subject: {
          object: { objectType: SpiceDbResourceTypes.APP, objectId: appId },
          optionalRelation: '',
        },
        optionalCaveat: undefined,
      },
    });
  }

  if (updates.length === 0) {
    return;
  }

  await spice.promises.writeRelationships({
    updates,
    optionalPreconditions: [],
    optionalTransactionMetadata: undefined,
  });
}
