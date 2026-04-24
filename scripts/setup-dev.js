#!/usr/bin/env node

/**
 * Monorepo Contributor Setup Script
 *
 * Usage:
 *   pnpm setup-dev                       - Run full setup with local Docker databases
 *   pnpm setup-dev --skip-push           - Run setup without pushing a project
 *   pnpm setup-dev --isolated <name>     - Run setup with an isolated parallel environment
 *
 * The --isolated flag creates a separate Docker environment with dynamic port
 * allocation, allowing multiple dev environments to run in parallel with zero
 * port conflicts. After setup, use:
 *   source <(./scripts/isolated-env.sh env <name>)
 *   pnpm dev
 *
 * This replaces the old scripts/setup.sh and uses the same shared setup module
 * as the quickstart template (create-agents-template/scripts/setup.js).
 */

import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { styleText } from 'node:util';
import { runSetup } from '../packages/agents-core/dist/setup/index.js';

/**
 * Pre-flight validation of critical env vars. Runs before any expensive step
 * (Docker, migrations, installs) so a missing key fails in seconds instead of
 * after 8+ minutes of setup work. Only flags strictly-required vars.
 */
function validateEnvironmentEarly() {
  const parseEnvFile = (path) => {
    const vars = {};
    if (!existsSync(path)) return vars;
    let content;
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      // Permission denied / corrupted file - degrade gracefully and rely on process.env.
      return vars;
    }
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
    return vars;
  };

  const fromDotEnv = parseEnvFile('.env');
  const fromDotEnvLocal = parseEnvFile('.env.local');
  const resolve = (name) => process.env[name] ?? fromDotEnvLocal[name] ?? fromDotEnv[name] ?? '';

  const required = [
    {
      name: 'ANTHROPIC_API_KEY',
      hint: 'Get one at https://console.anthropic.com/',
    },
  ];

  const missing = required.filter(({ name }) => !resolve(name) || resolve(name).trim() === '');

  if (missing.length > 0) {
    console.log(styleText('red', '\n✗ Pre-flight check failed: missing required env vars\n'));
    for (const { name, hint } of missing) {
      console.log(`  ${styleText('red', '•')} ${styleText('bold', name)} — ${hint}`);
    }
    console.log(
      `\n${styleText('yellow', '→')} Copy ${styleText('cyan', '.env.example')} to ${styleText('cyan', '.env')} and fill in the values above, then re-run ${styleText('cyan', 'pnpm setup-dev')}.`
    );
    console.log(
      `  ${styleText('dim', 'Stopping now so you do not wait 8+ minutes for setup to fail at the end.')}\n`
    );
    process.exit(1);
  }

  console.log(styleText('green', '✓') + ' Pre-flight env check passed');
}

/**
 * Generate copilot JWT keypair and write to .env if not already configured.
 * This is monorepo-only — self-hosted/cloud setups don't get copilot auto-configured.
 */
function ensureCopilotKeys() {
  const envPath = '.env';
  if (!existsSync(envPath)) return;

  const envContent = readFileSync(envPath, 'utf-8');

  const hasKey =
    envContent.includes('INKEEP_COPILOT_JWT_PRIVATE_KEY=') &&
    !envContent.includes('# INKEEP_COPILOT_JWT_PRIVATE_KEY=') &&
    !!envContent.match(/INKEEP_COPILOT_JWT_PRIVATE_KEY=(.+)/)?.[1]?.trim();

  if (hasKey) {
    console.log(
      styleText('cyan', 'ℹ') + ' Copilot JWT keys already configured, skipping generation'
    );
    return;
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  const kid = `pg-${createHash('sha256').update(publicKey).digest('hex').substring(0, 12)}`;

  const lines = envContent.split('\n');
  const vars = [
    { name: 'INKEEP_COPILOT_JWT_PRIVATE_KEY', value: privateKeyBase64 },
    { name: 'INKEEP_COPILOT_JWT_KID', value: kid },
    { name: 'PUBLIC_INKEEP_COPILOT_APP_ID', value: 'app_copilot' },
  ];

  for (const { name, value } of vars) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`# ${name}=`) || lines[i].startsWith(`${name}=`)) {
        lines[i] = `${name}=${value}`;
        found = true;
      }
    }
    if (!found) {
      lines.push(`${name}=${value}`);
    }
    process.env[name] = value;
  }

  writeFileSync(envPath, lines.join('\n'));
  console.log(styleText('green', '✓') + ' Copilot JWT keys generated and added to .env');
}

/**
 * Create copilot app via the manage API after the copilot project is pushed.
 * Uses the API instead of direct DB calls. Idempotent — checks if app already exists.
 */
async function ensureCopilotApp(apiUrl) {
  const appId = process.env.PUBLIC_INKEEP_COPILOT_APP_ID;
  const privateKeyB64 = process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY;
  const kid = process.env.INKEEP_COPILOT_JWT_KID;
  const bypassSecret = process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;
  const tenantId = process.env.TENANT_ID || 'default';
  const projectId = 'copilot';

  if (!appId || !privateKeyB64 || !kid || !bypassSecret) {
    console.log(styleText('yellow', '⚠') + ' Skipping copilot app creation (missing env vars)');
    return;
  }

  // Check if app already exists by listing apps for the copilot project
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bypassSecret}`,
  };

  try {
    const listRes = await fetch(`${apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      headers,
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = listData?.data?.find((a) => a.id === appId);
      if (existing) {
        console.log(styleText('cyan', 'ℹ') + ` Copilot app already exists: ${appId}`);
        return;
      }
    }
  } catch {
    // List failed — try creating anyway
  }

  // Derive public key from private key
  const { createPrivateKey, createPublicKey } = await import('node:crypto');
  const privPem = Buffer.from(privateKeyB64, 'base64').toString('utf-8');
  const pubPem = createPublicKey(createPrivateKey(privPem)).export({
    type: 'spki',
    format: 'pem',
  });

  const body = {
    name: 'Copilot',
    description: 'Chat-to-edit copilot app for local development',
    type: 'web_client',
    defaultAgentId: 'chat-to-edit',
    config: {
      type: 'web_client',
      webClient: {
        allowedDomains: ['localhost', '127.0.0.1'],
        publicKeys: [
          {
            kid,
            publicKey: pubPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        allowAnonymous: false,
      },
    },
  };

  try {
    const res = await fetch(`${apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const createdId = data?.data?.app?.id;

      if (createdId && createdId !== appId) {
        // API auto-generated a different ID — update .env with the real ID
        const envContent = readFileSync('.env', 'utf-8');
        const updated = envContent.replace(
          /PUBLIC_INKEEP_COPILOT_APP_ID=.*/,
          `PUBLIC_INKEEP_COPILOT_APP_ID=${createdId}`
        );
        writeFileSync('.env', updated);
        process.env.PUBLIC_INKEEP_COPILOT_APP_ID = createdId;
        console.log(styleText('green', '✓') + ` Copilot app created: ${createdId} (updated .env)`);
      } else {
        console.log(styleText('green', '✓') + ` Copilot app created: ${createdId || appId}`);
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.log(
        styleText('yellow', '⚠') + ` Failed to create copilot app: ${res.status} ${errText}`
      );
    }
  } catch (error) {
    console.log(styleText('yellow', '⚠') + ` Failed to create copilot app: ${error.message}`);
  }
}

const skipPush = process.argv.includes('--skip-push');
const isolatedIdx = process.argv.indexOf('--isolated');
const isolatedName = isolatedIdx !== -1 ? process.argv[isolatedIdx + 1] : null;

if (isolatedIdx !== -1 && (!isolatedName || isolatedName.startsWith('-'))) {
  console.error('Error: --isolated requires a name argument (e.g., --isolated my-feature)');
  process.exit(1);
}

if (isolatedName && !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(isolatedName)) {
  console.error(
    'Error: environment name must be 1-63 lowercase alphanumeric chars, hyphens, or underscores (no dots, no uppercase)'
  );
  process.exit(1);
}

validateEnvironmentEarly();

if (isolatedName) {
  // Isolated mode: delegate Docker + migrations + auth to isolated-env.sh,
  // then run the remaining setup steps (secrets, project push) via runSetup.
  const scriptPath = new URL('./isolated-env.sh', import.meta.url).pathname;

  if (!existsSync(scriptPath)) {
    console.error(`Error: ${scriptPath} not found`);
    process.exit(1);
  }

  ensureCopilotKeys();

  console.log(styleText('bold', `\n=== Isolated Environment Setup: ${isolatedName} ===\n`));

  try {
    execSync(`bash "${scriptPath}" setup "${isolatedName}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    console.error(styleText('red', 'Failed to set up isolated environment.'));
    process.exit(1);
  }

  // Read the isolated env's ports and set env vars so runSetup's
  // remaining steps (secrets, project push) use the right databases.
  const stateFile = `.isolated-envs/${isolatedName}.json`;
  if (!existsSync(stateFile)) {
    console.error(`Error: state file ${stateFile} not found — isolated-env.sh may have failed`);
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch (e) {
    console.error(`Error: failed to parse ${stateFile}: ${e.message}`);
    process.exit(1);
  }

  const p = state.ports;
  process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL = `postgresql://appuser:password@localhost:${p.doltgres}/inkeep_agents`;
  process.env.INKEEP_AGENTS_RUN_DATABASE_URL = `postgresql://appuser:password@localhost:${p.postgres}/inkeep_agents`;
  process.env.SPICEDB_ENDPOINT = `localhost:${p.spicedb_grpc}`;

  const apiPort = p.agents_api || 3002;
  if (!p.agents_api) {
    console.warn(
      `${styleText('yellow', '⚠')} agents_api port missing from state file, falling back to 3002. Re-run setup to fix.`
    );
  }
  const apiUrl = `http://localhost:${apiPort}`;
  process.env.AGENTS_API_PORT = String(apiPort);
  process.env.INKEEP_AGENTS_API_URL = apiUrl;
  process.env.PUBLIC_INKEEP_AGENTS_API_URL = apiUrl;
  process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL = apiUrl;
  if (p.manage_ui) {
    process.env.MANAGE_UI_PORT = String(p.manage_ui);
  }
  if (p.mailpit_smtp) {
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = String(p.mailpit_smtp);
  }

  // Run remaining setup steps (secrets generation, project push) but skip
  // Docker startup + migrations + auth (already done by isolated-env.sh).
  // Using isCloud: false so database URL validation still runs against the
  // isolated env vars we just set above.
  await runSetup({
    dockerComposeFile: 'docker-compose.isolated.yml',
    manageMigrateCommand: 'true',
    runMigrateCommand: 'true',
    authInitCommand: 'true',
    pushProject: skipPush
      ? undefined
      : {
          projectPath: 'agents-cookbook/template-projects/activities-planner',
          configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
          apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
          apiUrl,
        },
    devApiCommand: 'pnpm turbo dev --filter @inkeep/agents-api',
    apiHealthUrl: `${apiUrl}/health`,
    isCloud: false,
    skipPush,
  });

  console.log(styleText('bold', `\n=== To use this environment ===`));
  console.log(`  source <(./scripts/isolated-env.sh env ${isolatedName})`);
  console.log(`  pnpm dev`);
  console.log(styleText('bold', `\n=== To tear down ===`));
  console.log(`  ./scripts/isolated-env.sh down ${isolatedName}\n`);
} else {
  // Default mode: standard setup with docker-compose.dbs.yml
  ensureCopilotKeys();

  await runSetup({
    dockerComposeFile: 'docker-compose.dbs.yml',
    manageMigrateCommand: 'pnpm db:manage:migrate',
    runMigrateCommand: 'pnpm db:run:migrate',
    authInitCommand: 'pnpm db:auth:init',
    pushProject: [
      {
        projectPath: 'agents-cookbook/template-projects/activities-planner',
        configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
        apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
      },
      {
        projectPath: 'agents-cookbook/template-projects/copilot',
        configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
        apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
      },
    ],
    afterPush: ensureCopilotApp,
    devApiCommand: 'pnpm turbo dev --filter @inkeep/agents-api',
    apiHealthUrl: 'http://localhost:3002/health',
    isCloud: false,
    skipPush,
  });
}
