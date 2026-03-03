import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import * as runtimeSchema from '../../db/runtime/runtime-schema';
import { getOrganizationMemberByUserId } from '../runtime/users';

describe('getOrganizationMemberByUserId', () => {
  let db: AgentsRunDatabaseClient;
  let pglite: PGlite;

  const ORG_A = 'org-a';
  const ORG_B = 'org-b';
  const USER_IN_A = 'user-in-a';
  const USER_IN_B = 'user-in-b';

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema: runtimeSchema }) as unknown as AgentsRunDatabaseClient;

    const isInPackageDir = process.cwd().includes('agents-core');
    const migrationsPath = isInPackageDir
      ? './drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(drizzle(pglite), {
      migrationsFolder: migrationsPath,
    });
  });

  beforeEach(async () => {
    await db.delete(runtimeSchema.member);
    await db.delete(runtimeSchema.user);
    await db.delete(runtimeSchema.organization);

    await db.insert(runtimeSchema.organization).values([
      { id: ORG_A, name: 'Org A', slug: 'org-a', createdAt: new Date() },
      { id: ORG_B, name: 'Org B', slug: 'org-b', createdAt: new Date() },
    ]);

    await db.insert(runtimeSchema.user).values([
      { id: USER_IN_A, name: 'User A', email: 'a@test.com', emailVerified: true },
      { id: USER_IN_B, name: 'User B', email: 'b@test.com', emailVerified: true },
    ]);

    await db.insert(runtimeSchema.member).values([
      {
        id: 'member-a',
        organizationId: ORG_A,
        userId: USER_IN_A,
        role: 'member',
        createdAt: new Date(),
      },
      {
        id: 'member-b',
        organizationId: ORG_B,
        userId: USER_IN_B,
        role: 'admin',
        createdAt: new Date(),
      },
    ]);
  });

  it('should return the member when user belongs to the organization', async () => {
    const result = await getOrganizationMemberByUserId(db)(ORG_A, USER_IN_A);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(USER_IN_A);
    expect(result!.email).toBe('a@test.com');
    expect(result!.role).toBe('member');
    expect(result!.memberId).toBe('member-a');
  });

  it('should return null when user exists but is not in the organization', async () => {
    const result = await getOrganizationMemberByUserId(db)(ORG_A, USER_IN_B);

    expect(result).toBeNull();
  });

  it('should return null when user does not exist', async () => {
    const result = await getOrganizationMemberByUserId(db)(ORG_A, 'nonexistent-user');

    expect(result).toBeNull();
  });

  it('should return null when organization does not exist', async () => {
    const result = await getOrganizationMemberByUserId(db)('nonexistent-org', USER_IN_A);

    expect(result).toBeNull();
  });

  it('should return the correct role for the membership', async () => {
    const result = await getOrganizationMemberByUserId(db)(ORG_B, USER_IN_B);

    expect(result).not.toBeNull();
    expect(result!.role).toBe('admin');
    expect(result!.memberId).toBe('member-b');
  });
});
