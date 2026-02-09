/**
 * Standalone initialization script for creating the default organization and admin user.
 * This script is designed to run during setup/migration, NOT at server startup.
 *
 * Uses upsertOrganization to create org with TENANT_ID as the actual organization ID,
 * and Better Auth's API for user creation.
 *
 * Usage: pnpm db:auth:init
 *
 * Required environment variables:
 * - INKEEP_AGENTS_RUN_DATABASE_URL: PostgreSQL connection string
 * - TENANT_ID: Organization/tenant ID (defaults to 'default') - this becomes the org ID
 * - INKEEP_AGENTS_MANAGE_UI_USERNAME: Admin email address
 * - INKEEP_AGENTS_MANAGE_UI_PASSWORD: Admin password (min 8 chars)
 * - BETTER_AUTH_SECRET: Secret for Better Auth
 *
 * Optional environment variables:
 * - INKEEP_AGENTS_API_URL: API URL for Better Auth (defaults to http://localhost:3002)
 */

import { loadEnvironmentFiles } from '../env';

loadEnvironmentFiles();

import { addUserToOrganization, upsertOrganization } from '../data-access/runtime/organizations';
import { getUserByEmail } from '../data-access/runtime/users';
import { createAgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { createAuth } from './auth';
import { syncOrgMemberToSpiceDb } from './authz';
import { OrgRoles } from './authz/types';
import { writeSpiceDbSchema } from './spicedb-schema';

const TENANT_ID = process.env.TENANT_ID || 'default';

async function init() {
  console.log('🚀 Initializing database with default organization and user...\n');

  // Step 0: Write SpiceDB schema (must happen before any SpiceDB operations)
  console.log('📜 Writing SpiceDB schema...');
  try {
    await writeSpiceDbSchema();
    console.log('   ✅ SpiceDB schema applied');
  } catch (error) {
    console.error('   ❌ Failed to write SpiceDB schema:', error);
    console.error('   Make sure SpiceDB is running (docker-compose.dbs.yml)');
    process.exit(1);
  }

  const dbClient = createAgentsRunDatabaseClient();

  // 1. Check required environment variables
  const username = process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME;
  const password = process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD;
  const authSecret = process.env.BETTER_AUTH_SECRET;

  if (!username || !password) {
    console.error(
      '❌ INKEEP_AGENTS_MANAGE_UI_USERNAME and INKEEP_AGENTS_MANAGE_UI_PASSWORD are required'
    );
    console.error('   These credentials are used to create the initial admin user.');
    process.exit(1);
  }

  if (!authSecret) {
    console.error('❌ BETTER_AUTH_SECRET is required');
    console.error('   This secret is used to sign authentication tokens.');
    process.exit(1);
  }

  // 2. Create the auth instance
  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const auth = createAuth({
    baseURL: apiUrl,
    secret: authSecret,
    dbClient,
  });

  // 3. Upsert organization - get existing or create new with TENANT_ID as the ID
  console.log(`📦 Checking/creating organization: ${TENANT_ID}`);
  const { created: orgCreated } = await upsertOrganization(dbClient)({
    organizationId: TENANT_ID,
    name: TENANT_ID,
    slug: TENANT_ID,
    logo: null,
    metadata: null,
  });

  if (orgCreated) {
    console.log(`   ✅ Organization created with ID: ${TENANT_ID}`);
  } else {
    console.log(`   ℹ️  Organization already exists: ${TENANT_ID}`);
  }

  // 4. Create admin user (required before adding to organization)
  console.log(`\n👤 Creating admin user: ${username}`);
  let user = await getUserByEmail(dbClient)(username);

  if (user) {
    console.log(`   ℹ️  User already exists: ${username}`);
  } else {
    // Create user via Better Auth
    console.log('   Creating user with Better Auth...');
    const result = await auth.api.signUpEmail({
      body: {
        email: username,
        password: password,
        name: username.split('@')[0],
      },
    });

    if (!result.user) {
      console.error('   ❌ Failed to create user: signUpEmail returned no user');
      process.exit(1);
    }

    // Refetch user from DB to ensure consistent type
    user = await getUserByEmail(dbClient)(username);

    if (!user) {
      console.error('   ❌ User was created but could not be retrieved from database');
      process.exit(1);
    }

    console.log(`   ✅ User created: ${user.email}`);
  }

  // 5. Add user to organization as admin
  console.log(`\n🔗 Adding user to organization...`);
  await addUserToOrganization(dbClient)({
    userId: user.id,
    organizationId: TENANT_ID,
    role: OrgRoles.ADMIN,
  });
  console.log(`   ✅ User ${user.email} added as ${OrgRoles.ADMIN}`);

  // 6. Sync to SpiceDB
  try {
    await syncOrgMemberToSpiceDb({
      tenantId: TENANT_ID,
      userId: user.id,
      role: OrgRoles.ADMIN, // User is admin via Better Auth
      action: 'add',
    });
    console.log('   ✅ Synced to SpiceDB');
  } catch (error) {
    console.error('❌ SpiceDB sync failed:', error);
  }

  console.log('\n================================================');
  console.log('✅ Initialization complete!');
  console.log('================================================');
  console.log(`\nOrganization: ${TENANT_ID}`);
  console.log(`Admin user:   ${username}`);
  console.log('\nYou can now log in with these credentials.\n');

  process.exit(0);
}

init().catch((error) => {
  console.error('\n❌ Initialization failed:', error);
  process.exit(1);
});
