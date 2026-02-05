/**
 * Script to create test users for development/testing.
 *
 * Usage: pnpm db:auth:create-test-users
 *
 * Creates multiple test users with different roles:
 * - admin2@test.com (admin role)
 * - member1@test.com (member role)
 * - member2@test.com (member role)
 *
 * All test users have password: testpass123
 */

import { loadEnvironmentFiles } from '../env';

loadEnvironmentFiles();

import { addUserToOrganization, upsertOrganization } from '../data-access/runtime/organizations';
import { getUserByEmail } from '../data-access/runtime/users';
import { createAgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { createAuth } from './auth';
import { OrgRoles } from './authz/config';

const TENANT_ID = process.env.TENANT_ID || 'default';
const TEST_PASSWORD = 'testpass123';

interface TestUser {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

const TEST_USERS: TestUser[] = [
  { email: 'admin2@test.com', name: 'Admin Two', role: 'admin' },
  { email: 'member1@test.com', name: 'Member One', role: 'member' },
  { email: 'member2@test.com', name: 'Member Two', role: 'member' },
];

async function createTestUsers() {
  console.log('🧪 Creating test users for development...\n');

  const dbClient = createAgentsRunDatabaseClient();

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    console.error('❌ BETTER_AUTH_SECRET is required');
    process.exit(1);
  }

  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const auth = createAuth({
    baseURL: apiUrl,
    secret: authSecret,
    dbClient,
  });

  // Ensure organization exists
  console.log(`📦 Ensuring organization exists: ${TENANT_ID}`);
  await upsertOrganization(dbClient)({
    organizationId: TENANT_ID,
    name: TENANT_ID,
    slug: TENANT_ID,
    logo: null,
    metadata: null,
  });

  console.log('\n👥 Creating test users:\n');
  console.log('┌────────────────────────┬────────────────┬──────────┐');
  console.log('│ Email                  │ Password       │ Role     │');
  console.log('├────────────────────────┼────────────────┼──────────┤');

  for (const testUser of TEST_USERS) {
    let user = await getUserByEmail(dbClient)(testUser.email);

    if (user) {
      console.log(`│ ${testUser.email.padEnd(22)} │ (exists)       │ ${testUser.role.padEnd(8)} │`);
    } else {
      try {
        await auth.api.signUpEmail({
          body: {
            email: testUser.email,
            password: TEST_PASSWORD,
            name: testUser.name,
          },
        });

        user = await getUserByEmail(dbClient)(testUser.email);

        if (user) {
          await addUserToOrganization(dbClient)({
            userId: user.id,
            organizationId: TENANT_ID,
            role: testUser.role === 'admin' ? OrgRoles.ADMIN : OrgRoles.MEMBER,
          });

          console.log(
            `│ ${testUser.email.padEnd(22)} │ ${TEST_PASSWORD.padEnd(14)} │ ${testUser.role.padEnd(8)} │`
          );
        }
      } catch {
        console.log(
          `│ ${testUser.email.padEnd(22)} │ FAILED         │ ${testUser.role.padEnd(8)} │`
        );
      }
    }
  }

  console.log('└────────────────────────┴────────────────┴──────────┘');

  console.log('\n✅ Test users created!');
  console.log('\nRole permissions:');
  console.log('  • admin  → Can install Slack workspace, configure agents');
  console.log('  • member → Can only link account and use agents');
  console.log('');

  process.exit(0);
}

createTestUsers().catch((error) => {
  console.error('\n❌ Failed to create test users:', error);
  process.exit(1);
});
