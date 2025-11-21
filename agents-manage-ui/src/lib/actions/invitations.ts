'use server';

import { makeManagementApiRequest } from "../api/api-config";

export interface PendingInvitation {
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

