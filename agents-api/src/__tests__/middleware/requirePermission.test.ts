import { OrgRoles } from '@inkeep/agents-core';
import { adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { afterEach, describe, expect, it } from 'vitest';
import { requirePermission } from '../../middleware/requirePermission';

// --- Source-of-truth guard: the role->permission decisions must not silently change. ---
describe('access-control role decisions (no-degradation guard)', () => {
  it('admin/owner can create+delete projects; member cannot', () => {
    expect(adminRole.authorize({ project: ['create'] }).success).toBe(true);
    expect(adminRole.authorize({ project: ['delete'] }).success).toBe(true);
    expect(ownerRole.authorize({ project: ['create'] }).success).toBe(true);
    expect(memberRole.authorize({ project: ['create'] }).success).toBe(false);
    expect(memberRole.authorize({ project: ['delete'] }).success).toBe(false);
  });
});

// --- Middleware wiring: it authorizes from the resolved tenantRole, session-independent. ---
function mockContext(vars: Record<string, unknown>) {
  return {
    get: (k: string) => vars[k],
    req: { path: '/manage/tenants/default/project-full' },
  } as never;
}

async function run(
  tenantRole: unknown,
  userId: unknown = 'u1'
): Promise<{ nexted: boolean; threw: boolean }> {
  const mw = requirePermission({ project: ['create'] });
  let nexted = false;
  let threw = false;
  try {
    await mw(mockContext({ auth: {}, userId, tenantId: 'default', tenantRole }), async () => {
      nexted = true;
    });
  } catch {
    threw = true;
  }
  return { nexted, threw };
}

describe('requirePermission (session-independent, OAuth-JWT safe)', () => {
  const prev = process.env.ENVIRONMENT;
  afterEach(() => {
    process.env.ENVIRONMENT = prev;
  });

  it('allows when the resolved role grants the permission (admin)', async () => {
    process.env.ENVIRONMENT = 'development';
    const { nexted, threw } = await run(OrgRoles.ADMIN);
    expect(nexted).toBe(true);
    expect(threw).toBe(false);
  });

  it('denies when the resolved role lacks the permission (member) — fail-closed', async () => {
    process.env.ENVIRONMENT = 'development';
    const { nexted, threw } = await run(OrgRoles.MEMBER);
    expect(nexted).toBe(false);
    expect(threw).toBe(true);
  });

  it('denies on a missing role — fail-closed', async () => {
    process.env.ENVIRONMENT = 'development';
    const { nexted, threw } = await run(undefined);
    expect(nexted).toBe(false);
    expect(threw).toBe(true);
  });

  it('denies on an unknown role — fail-closed', async () => {
    process.env.ENVIRONMENT = 'development';
    const { nexted, threw } = await run('some-unknown-role');
    expect(nexted).toBe(false);
    expect(threw).toBe(true);
  });

  it('bypasses the role check for the system user (scope enforced upstream)', async () => {
    process.env.ENVIRONMENT = 'development';
    // No tenantRole granted, but a system principal proceeds — tenant-access middleware
    // has already scoped it.
    const { nexted, threw } = await run(undefined, 'system');
    expect(nexted).toBe(true);
    expect(threw).toBe(false);
  });

  it('bypasses the role check for API-key principals (apikey: prefix)', async () => {
    process.env.ENVIRONMENT = 'development';
    const { nexted, threw } = await run(undefined, 'apikey:abc123');
    expect(nexted).toBe(true);
    expect(threw).toBe(false);
  });
});
