import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWriteRelationships = vi.fn();
vi.mock('../client', async () => {
  const actual = await vi.importActual<typeof import('../client')>('../client');
  return {
    ...actual,
    writeRelationship: vi.fn(),
    deleteRelationship: vi.fn(),
    checkPermission: vi.fn(),
    getSpiceClient: vi.fn(() => ({
      promises: {
        writeRelationships: mockWriteRelationships,
      },
    })),
  };
});

import {
  checkPermission,
  deleteRelationship,
  RelationshipOperation,
  writeRelationship,
} from '../client';
import {
  canAppReadCredential,
  grantAppCredentialAccess,
  revokeAppCredentialAccess,
  rewriteAppCredentialAccess,
} from '../credential-gateway';

const mockWriteRelationship = vi.mocked(writeRelationship);
const mockDeleteRelationship = vi.mocked(deleteRelationship);
const mockCheckPermission = vi.mocked(checkPermission);

const SCOPE = {
  tenantId: 'tenant_abc',
  projectId: 'proj_main',
};

// Expected composite SpiceDB object ID for the credential reference used across tests.
const EXPECTED_CRED_OBJECT_ID = `${SCOPE.tenantId}/${SCOPE.projectId}/cred_456`;

describe('credential-gateway authz helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('grantAppCredentialAccess', () => {
    it('writes the tuple against the tenant+project-scoped credential ID', async () => {
      mockWriteRelationship.mockResolvedValue(undefined);

      await grantAppCredentialAccess({
        ...SCOPE,
        credentialReferenceId: 'cred_456',
        appId: 'app_123',
      });

      expect(mockWriteRelationship).toHaveBeenCalledWith({
        resourceType: 'credential_reference',
        resourceId: EXPECTED_CRED_OBJECT_ID,
        relation: 'app_reader',
        subjectType: 'app',
        subjectId: 'app_123',
      });
    });
  });

  describe('revokeAppCredentialAccess', () => {
    it('deletes the tuple against the tenant+project-scoped credential ID', async () => {
      mockDeleteRelationship.mockResolvedValue(undefined);

      await revokeAppCredentialAccess({
        ...SCOPE,
        credentialReferenceId: 'cred_456',
        appId: 'app_123',
      });

      expect(mockDeleteRelationship).toHaveBeenCalledWith({
        resourceType: 'credential_reference',
        resourceId: EXPECTED_CRED_OBJECT_ID,
        relation: 'app_reader',
        subjectType: 'app',
        subjectId: 'app_123',
      });
    });
  });

  describe('canAppReadCredential', () => {
    it('checks read permission against the tenant+project-scoped credential ID', async () => {
      mockCheckPermission.mockResolvedValue(true);

      const result = await canAppReadCredential({
        ...SCOPE,
        credentialReferenceId: 'cred_456',
        appId: 'app_123',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).toHaveBeenCalledWith({
        resourceType: 'credential_reference',
        resourceId: EXPECTED_CRED_OBJECT_ID,
        permission: 'read',
        subjectType: 'app',
        subjectId: 'app_123',
      });
    });

    it('returns false when the tuple does not exist', async () => {
      mockCheckPermission.mockResolvedValue(false);

      const result = await canAppReadCredential({
        ...SCOPE,
        credentialReferenceId: 'cred_456',
        appId: 'app_123',
      });

      expect(result).toBe(false);
    });

    it('does not confuse identical credential slugs across different tenants', async () => {
      mockCheckPermission.mockResolvedValue(false);

      await canAppReadCredential({
        tenantId: 'tenant_a',
        projectId: 'proj_main',
        credentialReferenceId: 'cred_shared',
        appId: 'app_a',
      });
      await canAppReadCredential({
        tenantId: 'tenant_b',
        projectId: 'proj_main',
        credentialReferenceId: 'cred_shared',
        appId: 'app_b',
      });

      const [firstCall, secondCall] = mockCheckPermission.mock.calls;
      expect(firstCall[0].resourceId).toBe('tenant_a/proj_main/cred_shared');
      expect(secondCall[0].resourceId).toBe('tenant_b/proj_main/cred_shared');
      expect(firstCall[0].resourceId).not.toBe(secondCall[0].resourceId);
    });
  });

  describe('rewriteAppCredentialAccess', () => {
    it('TOUCHes the next tuple when there is no prior credential', async () => {
      mockWriteRelationships.mockResolvedValue(undefined);

      await rewriteAppCredentialAccess({
        ...SCOPE,
        nextCredentialReferenceId: 'cred_new',
        appId: 'app_123',
      });

      expect(mockWriteRelationships).toHaveBeenCalledTimes(1);
      const [payload] = mockWriteRelationships.mock.calls[0];
      expect(payload.updates).toHaveLength(1);
      expect(payload.updates[0].operation).toBe(RelationshipOperation.TOUCH);
      expect(payload.updates[0].relationship.resource.objectId).toBe(
        `${SCOPE.tenantId}/${SCOPE.projectId}/cred_new`
      );
      expect(payload.updates[0].relationship.subject.object.objectId).toBe('app_123');
    });

    it('atomically DELETEs the prior and TOUCHes the next in a single writeRelationships', async () => {
      mockWriteRelationships.mockResolvedValue(undefined);

      await rewriteAppCredentialAccess({
        ...SCOPE,
        priorCredentialReferenceId: 'cred_old',
        nextCredentialReferenceId: 'cred_new',
        appId: 'app_123',
      });

      expect(mockWriteRelationships).toHaveBeenCalledTimes(1);
      const [payload] = mockWriteRelationships.mock.calls[0];
      expect(payload.updates).toHaveLength(2);

      expect(payload.updates[0].operation).toBe(RelationshipOperation.DELETE);
      expect(payload.updates[0].relationship.resource.objectId).toBe(
        `${SCOPE.tenantId}/${SCOPE.projectId}/cred_old`
      );

      expect(payload.updates[1].operation).toBe(RelationshipOperation.TOUCH);
      expect(payload.updates[1].relationship.resource.objectId).toBe(
        `${SCOPE.tenantId}/${SCOPE.projectId}/cred_new`
      );
    });

    it('skips the DELETE when prior equals next (no-op swap, just idempotent TOUCH)', async () => {
      mockWriteRelationships.mockResolvedValue(undefined);

      await rewriteAppCredentialAccess({
        ...SCOPE,
        priorCredentialReferenceId: 'cred_same',
        nextCredentialReferenceId: 'cred_same',
        appId: 'app_123',
      });

      const [payload] = mockWriteRelationships.mock.calls[0];
      expect(payload.updates).toHaveLength(1);
      expect(payload.updates[0].operation).toBe(RelationshipOperation.TOUCH);
    });

    it('DELETEs the prior tuple when next is undefined (credential cleared)', async () => {
      mockWriteRelationships.mockResolvedValue(undefined);

      await rewriteAppCredentialAccess({
        ...SCOPE,
        priorCredentialReferenceId: 'cred_old',
        // nextCredentialReferenceId omitted -> user cleared the credential
        appId: 'app_123',
      });

      expect(mockWriteRelationships).toHaveBeenCalledTimes(1);
      const [payload] = mockWriteRelationships.mock.calls[0];
      expect(payload.updates).toHaveLength(1);
      expect(payload.updates[0].operation).toBe(RelationshipOperation.DELETE);
      expect(payload.updates[0].relationship.resource.objectId).toBe(
        `${SCOPE.tenantId}/${SCOPE.projectId}/cred_old`
      );
    });

    it('is a no-op when both prior and next are undefined', async () => {
      await rewriteAppCredentialAccess({
        ...SCOPE,
        appId: 'app_123',
      });

      expect(mockWriteRelationships).not.toHaveBeenCalled();
    });
  });
});
