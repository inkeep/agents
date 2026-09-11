import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';
import * as authSchema from '../auth-schema';

vi.mock('../authz/sync', () => ({
  grantProjectAccess: vi.fn().mockResolvedValue(undefined),
  syncOrgMemberToSpiceDb: vi.fn().mockResolvedValue(undefined),
}));

const BASE_URL = 'http://localhost:3002';
const INVITEE_EMAIL = 'invitee@example.com';
const INVITATION_ID = 'inv-opaque-id-0000000000000000';

function makeAuth() {
  return createAuth({
    baseURL: BASE_URL,
    secret: 'test-secret-test-secret-test-secret',
    dbClient: testRunDbClient,
    disablePasswordCompromiseCheck: true,
  });
}

async function signUp(auth: ReturnType<typeof createAuth>, email: string) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'A-sufficiently-long-password-1!',
        name: 'Invitee',
      }),
    })
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token');
  return cookie;
}

async function seedPendingInvitation() {
  const now = new Date();
  await testRunDbClient.insert(authSchema.user).values({
    id: 'inviter-user',
    name: 'Inviter',
    email: 'inviter@example.com',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await testRunDbClient.insert(authSchema.organization).values({
    id: 'acme',
    name: 'Acme',
    slug: 'acme',
    createdAt: now,
  });
  await testRunDbClient.insert(authSchema.member).values({
    id: 'inviter-membership',
    organizationId: 'acme',
    userId: 'inviter-user',
    role: 'admin',
    createdAt: now,
  });
  await testRunDbClient.insert(authSchema.invitation).values({
    id: INVITATION_ID,
    organizationId: 'acme',
    email: INVITEE_EMAIL,
    role: 'member',
    status: 'pending',
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    inviterId: 'inviter-user',
  });
  return INVITATION_ID;
}

function postInvitationAction({
  auth,
  action,
  invitationId,
  cookie,
}: {
  auth: ReturnType<typeof createAuth>;
  action: 'accept-invitation' | 'reject-invitation';
  invitationId: string;
  cookie: string;
}) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/organization/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ invitationId }),
    })
  );
}

describe('emailed invitation flow for accounts without a verified email', () => {
  it('sign-up via the invite link produces an unverified account', async () => {
    const auth = makeAuth();
    const cookie = await signUp(auth, INVITEE_EMAIL);
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { emailVerified: boolean } } | null;
    expect(body).not.toBeNull();
    expect(body?.user.emailVerified).toBe(false);
  });

  it('lets the invitee load the invitation the accept page fetches', async () => {
    const auth = makeAuth();
    const cookie = await signUp(auth, INVITEE_EMAIL);
    const invitationId = await seedPendingInvitation();

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/organization/get-invitation?id=${invitationId}`, {
        headers: { cookie },
      })
    );
    const body = (await response.json()) as { id?: string; message?: string };

    expect(body.message).toBeUndefined();
    expect(response.status).toBe(200);
    expect(body.id).toBe(invitationId);
  });

  it('lets the invitee accept the invitation', async () => {
    const auth = makeAuth();
    const cookie = await signUp(auth, INVITEE_EMAIL);
    const invitationId = await seedPendingInvitation();

    const response = await postInvitationAction({
      auth,
      action: 'accept-invitation',
      invitationId,
      cookie,
    });
    const body = (await response.json()) as { message?: string };

    expect(body.message).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('lets the invitee reject the invitation', async () => {
    const auth = makeAuth();
    const cookie = await signUp(auth, INVITEE_EMAIL);
    const invitationId = await seedPendingInvitation();

    const response = await postInvitationAction({
      auth,
      action: 'reject-invitation',
      invitationId,
      cookie,
    });
    const body = (await response.json()) as { message?: string };

    expect(body.message).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('still refuses a session whose email does not match the invitation', async () => {
    const auth = makeAuth();
    const cookie = await signUp(auth, 'someone-else@example.com');
    const invitationId = await seedPendingInvitation();

    const getResponse = await auth.handler(
      new Request(`${BASE_URL}/api/auth/organization/get-invitation?id=${invitationId}`, {
        headers: { cookie },
      })
    );
    expect(getResponse.status).not.toBe(200);

    const acceptResponse = await postInvitationAction({
      auth,
      action: 'accept-invitation',
      invitationId,
      cookie,
    });
    expect(acceptResponse.status).not.toBe(200);

    const rejectResponse = await postInvitationAction({
      auth,
      action: 'reject-invitation',
      invitationId,
      cookie,
    });
    expect(rejectResponse.status).not.toBe(200);

    const row = await testRunDbClient.query.invitation.findFirst({
      where: eq(authSchema.invitation.id, invitationId),
    });
    expect(row?.status).toBe('pending');
  });
});
