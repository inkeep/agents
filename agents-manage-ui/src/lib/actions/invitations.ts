'use server';

import type { MethodOption } from '@inkeep/agents-core/auth/auth-types';
import type { OrgRole, ProjectRole } from '@inkeep/agents-core/client-exports';
import { makeManagementApiRequest } from '../api/api-config';
import { ApiError } from '../types/errors';

export interface InviteMemberInput {
  emails: string[];
  role: OrgRole;
  organizationId: string;
  assignments?: Array<{ projectId: string; projectRole: ProjectRole }>;
}

export interface InviteMemberResult {
  email: string;
  status: 'success' | 'error';
  id?: string;
  error?: string;
  compensated?: boolean;
}

export async function inviteMembers(
  input: InviteMemberInput
): Promise<{ success: true; results: InviteMemberResult[] } | { success: false; error: string }> {
  try {
    const response = await makeManagementApiRequest<{ data: InviteMemberResult[] }>(
      'api/invitations',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return { success: true, results: response.data };
  } catch (error) {
    console.error('[inviteMembers] Error:', error);
    const message = error instanceof ApiError ? error.message : 'Failed to invite members';
    return { success: false, error: message };
  }
}

export async function getInvitationEmailStatus(
  invitationId: string
): Promise<{ emailSent: boolean; error?: string }> {
  try {
    return await makeManagementApiRequest<{ emailSent: boolean; error?: string }>(
      `api/invitations/${encodeURIComponent(invitationId)}/email-status`
    );
  } catch {
    return { emailSent: false };
  }
}

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

export type PendingInvitationsResult =
  | { success: true; invitations: PendingInvitation[] }
  | { success: false; error: string };

export async function getPendingInvitations(email: string): Promise<PendingInvitationsResult> {
  try {
    const invitations = await makeManagementApiRequest<PendingInvitation[]>(
      `api/invitations/pending?email=${encodeURIComponent(email)}`
    );
    return { success: true, invitations };
  } catch (error) {
    console.error('[getPendingInvitations] Error:', error);
    const message = error instanceof ApiError ? error.message : 'Failed to load invitations';
    return { success: false, error: message };
  }
}

export interface InvitationVerification {
  valid: boolean;
  email: string;
  organizationName: string | null;
  organizationId: string;
  role: string;
  expiresAt: string;
  authMethod: string | null;
  allowedAuthMethods?: MethodOption[];
  userExists?: boolean;
  seatLimitReached?: string | null;
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
    const message = error instanceof ApiError ? error.message : 'Failed to validate invitation';
    return {
      valid: false,
      error: message,
    };
  }
}
