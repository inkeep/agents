#!/usr/bin/env tsx

/**
 * OAuth Client Setup
 *
 * Creates an OAuth 2.1 client for the copilot Chrome extension.
 * Persists client_id and client_secret to .env so re-runs are idempotent.
 *
 * Usage: pnpm setup-oauth-client
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ENV_PATH = join(ROOT_DIR, '.env');

function getEnvVar(key: string): string | undefined {
  if (!existsSync(ENV_PATH)) return undefined;
  const content = readFileSync(ENV_PATH, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1]?.trim();
}

function setEnvVar(key: string, value: string): void {
  if (!existsSync(ENV_PATH)) {
    writeFileSync(ENV_PATH, `${key}=${value}\n`);
    return;
  }

  const content = readFileSync(ENV_PATH, 'utf-8');
  const regex = new RegExp(`^#?\\s*${key}=.*$`, 'm');

  if (regex.test(content)) {
    writeFileSync(ENV_PATH, content.replace(regex, `${key}=${value}`));
  } else {
    appendFileSync(ENV_PATH, `\n${key}=${value}`);
  }
}

async function main() {
  const printOnly = process.argv.includes('--print-only');

  console.log('\n=== OAuth Client Setup ===\n');

  if (printOnly) {
    console.log('⚠️  --print-only: values will be printed to stdout, not written to .env.');
    console.log('   Each run creates a NEW OAuth client — save the output.\n');
  } else {
    const existingClientId = getEnvVar('COPILOT_OAUTH_CLIENT_ID');
    const existingClientSecret = getEnvVar('COPILOT_OAUTH_CLIENT_SECRET');

    if (existingClientId && existingClientSecret) {
      console.log(`ℹ️  OAuth client already configured:`);
      console.log(`   client_id: ${existingClientId}`);
      console.log(`   client_secret: ${existingClientSecret.slice(0, 8)}...`);
      console.log(
        `\n   To recreate, remove COPILOT_OAUTH_CLIENT_ID and COPILOT_OAUTH_CLIENT_SECRET from .env\n`
      );
      process.exit(0);
    }
  }

  const { loadEnvironmentFiles } = await import('../packages/agents-core/src/env');
  loadEnvironmentFiles();

  const { createAgentsRunDatabaseClient } = await import(
    '../packages/agents-core/src/db/runtime/runtime-client'
  );
  const { createAuth } = await import('../packages/agents-core/src/auth/auth');

  const dbClient = createAgentsRunDatabaseClient();
  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const authSecret = process.env.BETTER_AUTH_SECRET;

  if (!authSecret) {
    console.error('❌ BETTER_AUTH_SECRET is required in .env');
    process.exit(1);
  }

  const auth = createAuth({
    baseURL: apiUrl,
    secret: authSecret,
    dbClient,
  });

  console.log('📦 Creating OAuth client...');

  const redirectUris = [
    'http://localhost:3100/auth/callback',
    'https://copilot.inkeep.com/auth/callback',
  ];

  const client = await auth.api.adminCreateOAuthClient({
    headers: new Headers(),
    body: {
      redirect_uris: redirectUris,
      client_secret_expires_at: 0,
      skip_consent: true,
      enable_end_session: true,
    },
  });

  const clientId = (client as Record<string, string>).client_id;
  const clientSecret = (client as Record<string, string>).client_secret;

  if (!clientId || !clientSecret) {
    console.error('❌ Failed to create OAuth client — no client_id/client_secret returned');
    console.error('   Response:', JSON.stringify(client, null, 2));
    process.exit(1);
  }

  if (printOnly) {
    console.log('   ✅ OAuth client created');
    console.log(`   redirect_uris: ${redirectUris.join(', ')}`);
    console.log(`   skip_consent:  true\n`);
    console.log('   COPILOT_OAUTH_CLIENT_ID and COPILOT_OAUTH_CLIENT_SECRET:\n');
    console.log(`   COPILOT_OAUTH_CLIENT_ID=${clientId}`);
    console.log(`   COPILOT_OAUTH_CLIENT_SECRET=${clientSecret}`);
    console.log(`\n   Store these in your secret manager. They are shown only once.\n`);
    process.exit(0);
  }

  setEnvVar('COPILOT_OAUTH_CLIENT_ID', clientId);
  setEnvVar('COPILOT_OAUTH_CLIENT_SECRET', clientSecret);

  console.log('   ✅ OAuth client created');
  console.log(`   client_id:     ${clientId}`);
  console.log(`   client_secret: ${clientSecret.slice(0, 8)}...`);
  console.log(`   redirect_uris: ${redirectUris.join(', ')}`);
  console.log(`   skip_consent:  true`);
  console.log(`\n   Saved to .env as COPILOT_OAUTH_CLIENT_ID and COPILOT_OAUTH_CLIENT_SECRET`);
  console.log('   Use these values in your Chrome extension config.\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
