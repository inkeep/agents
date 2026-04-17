#!/usr/bin/env tsx

/**
 * Credential Gateway Client Setup
 *
 * Mints a confidential client_id and client_secret for the credential gateway
 * token-exchange endpoint. Persists both values to .env.
 *
 * Usage: pnpm setup-gateway-client [--print-only]
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

  console.log('\n=== Credential Gateway Client Setup ===\n');

  if (!printOnly) {
    const existingClientId = getEnvVar('COPILOT_GATEWAY_CLIENT_ID');
    const existingClientSecret = getEnvVar('COPILOT_GATEWAY_CLIENT_SECRET');

    if (existingClientId && existingClientSecret) {
      console.log('ℹ️  Gateway client already configured:');
      console.log(`   client_id: ${existingClientId}`);
      console.log(`   client_secret: ${existingClientSecret.slice(0, 8)}...`);
      console.log(
        '\n   To recreate, remove COPILOT_GATEWAY_CLIENT_ID and COPILOT_GATEWAY_CLIENT_SECRET from .env\n'
      );
      process.exit(0);
    }
  }

  const { generateApiKey } = await import('../packages/agents-core/src/utils/apiKeys');

  console.log('📦 Generating gateway client credentials...');

  const { publicId, key } = await generateApiKey();

  const clientId = `gw_${publicId}`;
  const clientSecret = key;

  if (printOnly) {
    console.log('⚠️  --print-only: values will be printed to stdout, not written to .env.\n');
    console.log(`   COPILOT_GATEWAY_CLIENT_ID=${clientId}`);
    console.log(`   COPILOT_GATEWAY_CLIENT_SECRET=${clientSecret}`);
    console.log('\n   Store these in your secret manager. They are shown only once.\n');
    process.exit(0);
  }

  setEnvVar('COPILOT_GATEWAY_CLIENT_ID', clientId);
  setEnvVar('COPILOT_GATEWAY_CLIENT_SECRET', clientSecret);

  console.log('   ✅ Gateway client created');
  console.log(`   client_id:     ${clientId}`);
  console.log(`   client_secret: ${clientSecret.slice(0, 8)}...`);
  console.log(
    '\n   Saved to .env as COPILOT_GATEWAY_CLIENT_ID and COPILOT_GATEWAY_CLIENT_SECRET\n'
  );

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
