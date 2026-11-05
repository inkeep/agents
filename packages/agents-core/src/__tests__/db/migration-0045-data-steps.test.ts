import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as authSchema from '../../auth/auth-schema';
import { testRunDbClient } from '../setup';

const MIGRATION = join(__dirname, '../../../drizzle/runtime/0045_complex_phantom_reporter.sql');

function migrationStatement(marker: string) {
  const statements = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint');
  const statement = statements.find((candidate) => candidate.trimStart().startsWith(marker));
  if (!statement) throw new Error(`Statement starting with ${marker} not found in migration 0045`);
  return statement;
}

const rekeyBlock = () => migrationStatement('DO $$');
const orphanCleanup = () => migrationStatement('DELETE FROM "account"');

function idToken(claims: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

async function seedAccount(
  id: string,
  providerId: string,
  accountId: string,
  token: string | null
) {
  const now = new Date();
  await testRunDbClient.insert(authSchema.user).values({
    id: `user-${id}`,
    name: 'Jane Doe',
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await testRunDbClient.insert(authSchema.account).values({
    id,
    accountId,
    providerId,
    userId: `user-${id}`,
    idToken: token,
    createdAt: now,
    updatedAt: now,
  });
}

const seedMicrosoftAccount = (id: string, accountId: string, token: string | null) =>
  seedAccount(id, 'microsoft', accountId, token);

async function accountIdOf(id: string) {
  const [row] = await testRunDbClient
    .select({ accountId: authSchema.account.accountId })
    .from(authSchema.account)
    .where(eq(authSchema.account.id, id));
  return row?.accountId;
}

describe('migration 0045 Microsoft oid rekey', () => {
  beforeEach(async () => {
    await testRunDbClient.delete(authSchema.account);
    await testRunDbClient.delete(authSchema.ssoProvider);
    await testRunDbClient.delete(authSchema.user);
  });

  it('rekeys accounts with a decodable oid and leaves malformed or missing tokens on sub without failing', async () => {
    await seedMicrosoftAccount('with-oid', 'sub-1', idToken({ sub: 'sub-1', oid: 'oid-1' }));
    await seedMicrosoftAccount('malformed', 'sub-2', 'not-a-jwt.%%%.x');
    await seedMicrosoftAccount('no-oid', 'sub-3', idToken({ sub: 'sub-3' }));
    await seedMicrosoftAccount('no-token', 'sub-4', null);

    await testRunDbClient.execute(sql.raw(rekeyBlock()));

    expect(await accountIdOf('with-oid')).toBe('oid-1');
    expect(await accountIdOf('malformed')).toBe('sub-2');
    expect(await accountIdOf('no-oid')).toBe('sub-3');
    expect(await accountIdOf('no-token')).toBe('sub-4');
  });

  it('is safe to run twice', async () => {
    await seedMicrosoftAccount('with-oid', 'sub-1', idToken({ sub: 'sub-1', oid: 'oid-1' }));

    await testRunDbClient.execute(sql.raw(rekeyBlock()));
    await testRunDbClient.execute(sql.raw(rekeyBlock()));

    expect(await accountIdOf('with-oid')).toBe('oid-1');
  });
});

describe('migration 0045 orphaned SSO account cleanup', () => {
  beforeEach(async () => {
    await testRunDbClient.delete(authSchema.account);
    await testRunDbClient.delete(authSchema.ssoProvider);
    await testRunDbClient.delete(authSchema.user);
  });

  it('deletes only accounts whose provider is neither built in nor a configured SSO provider', async () => {
    await seedAccount('password', 'credential', 'user-password', null);
    await seedAccount('google', 'google', 'google-sub', null);
    await seedAccount('microsoft', 'microsoft', 'entra-oid', null);
    await seedAccount('live-sso', 'example-org-abc123', 'idp-sub-1', null);
    await seedAccount('deleted-sso', 'example-org-gone99', 'idp-sub-2', null);
    await testRunDbClient.insert(authSchema.ssoProvider).values({
      id: 'sso-row',
      issuer: 'https://idp.example.com',
      userId: 'user-live-sso',
      providerId: 'example-org-abc123',
      domain: 'example.com',
    });

    await testRunDbClient.execute(sql.raw(orphanCleanup()));

    const remaining = await testRunDbClient
      .select({ id: authSchema.account.id })
      .from(authSchema.account);
    expect(remaining.map((row) => row.id).sort()).toEqual([
      'google',
      'live-sso',
      'microsoft',
      'password',
    ]);
  });
});
