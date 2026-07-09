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
 * - INKEEP_AGENTS_MANAGE_UI_PASSWORD: Admin password (min 15 chars, see password policy)
 * - BETTER_AUTH_SECRET: Secret for Better Auth
 *
 * Optional environment variables:
 * - INKEEP_AGENTS_API_URL: API URL for Better Auth (defaults to http://localhost:3002)
 * - INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET: When 'true' and the admin user
 *   already exists, re-sync the user's credential-account password from
 *   INKEEP_AGENTS_MANAGE_UI_PASSWORD. Intended for ephemeral CI envs where
 *   the secret may have rotated. Default-off so prod re-runs are safe.
 */

import { loadEnvironmentFiles } from '../env';

loadEnvironmentFiles();

import { hashPassword } from 'better-auth/crypto';
import { createApp, getAppById } from '../data-access/runtime/apps';
import { addUserToOrganization, upsertOrganization } from '../data-access/runtime/organizations';
import { getUserByEmail } from '../data-access/runtime/users';
import { createAgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import type { AppConfig, PublicKeyConfig } from '../types/utility';
import { createAuth } from './auth';
import { syncOrgMemberToSpiceDb } from './authz';
import { OrgRoles } from './authz/types';
import { validatePasswordPolicy } from './password-policy';
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

  const passwordViolations = validatePasswordPolicy(password, { userEmail: username });
  if (passwordViolations.length > 0) {
    console.error('❌ INKEEP_AGENTS_MANAGE_UI_PASSWORD does not meet the password policy:');
    for (const v of passwordViolations) {
      console.error(`   - ${v.message}`);
    }
    process.exit(1);
  }

  // 2. Create the auth instance.
  // disablePasswordCompromiseCheck: the haveIBeenPwned plugin calls the
  // external pwnedpasswords.com API during signUpEmail, so bootstrap fails
  // whenever that API is unreachable (CI network flake, offline dev,
  // firewalled self-hosted installs). Password strength is already enforced
  // locally by the validatePasswordPolicy pre-flight gate above.
  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const auth = createAuth({
    baseURL: apiUrl,
    secret: authSecret,
    dbClient,
    disablePasswordCompromiseCheck: true,
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
    if (process.env.INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET === 'true') {
      // Re-sync the credential-account password from the env value. Used by
      // ephemeral CI envs (e.g. per-PR Railway preview) where the env is
      // reused across runs but the secret may have rotated since the user
      // was first created. Default-off so production / self-hosted re-runs
      // of `pnpm db:auth:init` don't silently rotate the admin's password.
      //
      // Uses Better Auth's lower-level `hashPassword` directly rather than
      // `auth.$context.password.hash`, because the HIBP plugin wraps the
      // context-level hash to make a network call inside an endpoint
      // context — calling it from a script without an active endpoint
      // throws "No auth context found". The pre-flight policy gate above
      // (length/strength via validatePasswordPolicy) already runs.
      try {
        const ctx = await auth.$context;
        const hashedPassword = await hashPassword(password);
        await ctx.internalAdapter.updatePassword(user.id, hashedPassword);
        console.log(`   ✅ User exists; password re-synced from env`);
      } catch (error) {
        console.error(`   ❌ Failed to re-sync password for user ${user.id}:`, error);
        throw error;
      }
    } else {
      console.log(`   ℹ️  User already exists: ${username} — skipping creation and password update`);
    }
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

    // signUpEmail's autoSignIn issued a session no client holds; sign it out via Better Auth.
    if (result.token) {
      await auth.api.signOut({
        headers: new Headers({ authorization: `Bearer ${result.token}` }),
      });
    }

    console.log(`   ✅ User created: ${user.email}`);
  }

  // 5. Add user to organization as admin
  console.log(`\n🔗 Adding user to organization...`);
  await addUserToOrganization(dbClient)({
    userId: user.id,
    organizationId: TENANT_ID,
    role: OrgRoles.ADMIN,
    isServiceAccount: true,
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
    throw error;
  }

  // 7. Create global playground app (if configured)
  const playgroundAppId = process.env.INKEEP_PLAYGROUND_APP_ID || 'app_playground';
  const tempJwtPublicKeyB64 = process.env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY;

  console.log(`\n🎮 Checking/creating playground app: ${playgroundAppId}`);

  // Derive allowed domains from INKEEP_AGENTS_MANAGE_UI_URL
  let allowedDomains: string[] = ['localhost', '127.0.0.1'];
  const manageUiUrl = process.env.INKEEP_AGENTS_MANAGE_UI_URL;
  if (manageUiUrl) {
    try {
      const url = new URL(manageUiUrl);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        allowedDomains = ['localhost', '127.0.0.1'];
      } else {
        allowedDomains = [url.hostname];
      }
    } catch {
      console.log(
        `   ⚠️  Invalid INKEEP_AGENTS_MANAGE_UI_URL: ${manageUiUrl}, using localhost defaults`
      );
    }
  }
  console.log(`   📋 Playground allowed domains: ${JSON.stringify(allowedDomains)}`);

  const existingApp = await getAppById(dbClient)(playgroundAppId);

  if (existingApp) {
    console.log(`   ℹ️  Playground app already exists: ${playgroundAppId}`);
  } else {
    const publicKeys: PublicKeyConfig[] = [];

    if (tempJwtPublicKeyB64) {
      const { deriveKidFromPublicKey } = await import('../utils/jwt-helpers');
      const publicKeyPem = Buffer.from(tempJwtPublicKeyB64, 'base64').toString('utf-8');
      const kid = await deriveKidFromPublicKey(publicKeyPem);
      publicKeys.push({
        kid,
        publicKey: publicKeyPem,
        algorithm: 'RS256',
        addedAt: new Date().toISOString(),
      });
    } else {
      console.log(
        '   ⚠️  INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY not set — playground app created without auth keys'
      );
    }

    const config: AppConfig = {
      type: 'web_client',
      webClient: {
        allowedDomains,
        publicKeys,
        allowAnonymous: false,
      },
    };

    await createApp(dbClient)({
      id: playgroundAppId,
      tenantId: null,
      projectId: null,
      name: 'Playground',
      description: 'Global playground app for manage-ui',
      type: 'web_client',
      defaultAgentId: null,
      defaultProjectId: null,
      enabled: true,
      config,
    });

    console.log(
      `   ✅ Playground app created: ${playgroundAppId} (domains: ${JSON.stringify(allowedDomains)})`
    );
    if (publicKeys.length > 0) {
      console.log(`   ✅ RSA public key configured (kid: playground-rsa)`);
    }
  }

  console.log('\n================================================');
  console.log('✅ Initialization complete!');
  console.log('================================================');
  console.log(`\nOrganization: ${TENANT_ID}`);
  console.log(`Admin user:   ${username}`);
  console.log(`Playground:   ${playgroundAppId}`);
  console.log('\nYou can now log in with these credentials.\n');

  process.exit(0);
}

init().catch((error) => {
  console.error('\n❌ Initialization failed:', error);
  process.exit(1);
});
