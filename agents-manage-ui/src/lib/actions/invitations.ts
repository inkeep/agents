'use server';

import { makeManagementApiRequest } from '../api/api-config';
import { ApiError } from '../types/errors';

interface PendingInvitation {
  id: string;
  email: string;
  organizationId: string;
  organizationName: string | null;
  organizationSlug: string | null;
  role: string | null;
  status: string;
  expiresAt: number;
  inviterId: string;
}

export async function getPendingInvitations(email: string): Promise<PendingInvitation[]> {
  try {
    return await makeManagementApiRequest<PendingInvitation[]>(
      `api/invitations/pending?email=${encodeURIComponent(email)}`
    );
  } catch {
    return [];
  }
}

export interface InvitationVerification {
  valid: boolean;
  email: string;
  organizationName: string | null;
  organizationId: string;
  role: string;
  expiresAt: string;
}

interface InvitationVerificationError {
  valid: false;
  error: string;
}

export type InvitationVerificationResult = InvitationVerification | InvitationVerificationError;

/**
 * Server action to verify an invitation (unauthenticated)
 * Used by the accept-invitation page to pre-populate signup forms
 */
export async function verifyInvitation(
  invitationId: string,
  email: string
): Promise<InvitationVerificationResult> {
  try {
    const result = await makeManagementApiRequest<InvitationVerification>(
      `api/invitations/verify?id=${encodeURIComponent(invitationId)}&email=${encodeURIComponent(email)}`
    );
    return result;
  } catch (error) {
    console.error('[verifyInvitation] Error:', error);
    const message = error instanceof ApiError ? error.message : 'Failed to validate invitation';
    return {
      valid: false,
      error: message,
    };
  }
}
