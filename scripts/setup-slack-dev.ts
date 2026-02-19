#!/usr/bin/env tsx

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT_DIR, 'packages/agents-work-apps/src/slack/slack-app-manifest.json');
const ENV_PATH = join(ROOT_DIR, '.env');

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function generateDevManifest(devName: string): Record<string, unknown> {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest at ${MANIFEST_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Remove the _readme section
  delete manifest._readme;

  // Set dev display name
  manifest.display_information = {
    ...manifest.display_information,
    name: `Inkeep Dev - ${devName}`,
  };

  // Enable socket mode
  manifest.settings = {
    ...manifest.settings,
    socket_mode_enabled: true,
  };

  // Remove request_url from event_subscriptions (not needed in Socket Mode)
  if (manifest.settings.event_subscriptions) {
    const { request_url: _eventUrl, ...rest } = manifest.settings.event_subscriptions;
    manifest.settings.event_subscriptions = rest;
  }

  // Remove request_url from interactivity (not needed in Socket Mode)
  if (manifest.settings.interactivity) {
    const { request_url: _interactivityUrl, ...rest } = manifest.settings.interactivity;
    manifest.settings.interactivity = rest;
  }

  // Remove url from slash commands (not needed in Socket Mode)
  if (manifest.features?.slash_commands) {
    manifest.features.slash_commands = manifest.features.slash_commands.map(
      (cmd: Record<string, unknown>) => {
        const { url: _url, ...rest } = cmd;
        return rest;
      }
    );
  }

  // Remove placeholder redirect URLs that won't work locally
  if (manifest.oauth_config?.redirect_urls) {
    manifest.oauth_config.redirect_urls = manifest.oauth_config.redirect_urls.filter(
      (url: string) => !url.includes('<YOUR_API_DOMAIN>')
    );
  }

  return manifest;
}

function setEnvVar(envPath: string, key: string, value: string): void {
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${key}=${value}\n`);
    return;
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const regex = new RegExp(`^#?\\s*${key}=`);
  const existingIndex = lines.findIndex((line) => regex.test(line));

  if (existingIndex !== -1) {
    lines[existingIndex] = `${key}=${value}`;
    writeFileSync(envPath, lines.join('\n'));
  } else {
    appendFileSync(envPath, `\n${key}=${value}`);
  }
}

async function main(): Promise<void> {
  console.log('\n=== Slack Socket Mode Dev App Setup ===\n');

  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found at: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  // Step 1: Get developer name
  const devName = await prompt('Your name (for the app display name): ');
  if (!devName) {
    console.error('Name is required.');
    process.exit(1);
  }

  // Step 2: Generate dev manifest
  const devManifest = generateDevManifest(devName);
  const manifestJson = JSON.stringify(devManifest, null, 2);

  console.log('\n--- Dev Manifest (copy this) ---\n');
  console.log(manifestJson);
  console.log('\n--- End Manifest ---\n');

  // Step 3: Guide through Slack app creation
  console.log('Steps to create your dev Slack app:\n');
  console.log('  1. Go to https://api.slack.com/apps');
  console.log('  2. Click "Create New App" -> "From an app manifest"');
  console.log('  3. Select your workspace');
  console.log('  4. Paste the manifest JSON above (replace the YAML/JSON content)');
  console.log('  5. Click "Create"\n');

  await prompt('Press Enter when your app is created...');

  // Step 4: Generate App-Level Token
  console.log('\nGenerate an App-Level Token:\n');
  console.log('  1. In your app settings, go to "Basic Information"');
  console.log('  2. Scroll to "App-Level Tokens"');
  console.log('  3. Click "Generate Token and Scopes"');
  console.log('  4. Name it "socket-mode" and add the "connections:write" scope');
  console.log('  5. Click "Generate"\n');

  const appToken = await prompt('Paste your App-Level Token (xapp-...): ');
  if (!appToken.startsWith('xapp-')) {
    console.error('Invalid App-Level Token. It should start with "xapp-".');
    process.exit(1);
  }

  // Step 5: Install app to workspace
  console.log('\nInstall the app to your workspace:\n');
  console.log('  1. Go to "Install App" in the sidebar');
  console.log('  2. Click "Install to Workspace"');
  console.log('  3. Review and allow the permissions');
  console.log('  4. Copy the "Bot User OAuth Token" (xoxb-...)\n');

  const botToken = await prompt('Paste your Bot User OAuth Token (xoxb-...): ');
  if (!botToken.startsWith('xoxb-')) {
    console.error('Invalid Bot Token. It should start with "xoxb-".');
    process.exit(1);
  }

  // Step 6: Write to .env
  console.log('\nWriting tokens to .env...');

  setEnvVar(ENV_PATH, 'SLACK_APP_TOKEN', appToken);
  setEnvVar(ENV_PATH, 'SLACK_BOT_TOKEN', botToken);
  setEnvVar(ENV_PATH, 'SLACK_SOCKET_MODE', 'true');

  console.log('\nSetup complete! Your .env file has been updated with:');
  console.log(`  SLACK_APP_TOKEN=${appToken.slice(0, 10)}...`);
  console.log(`  SLACK_BOT_TOKEN=${botToken.slice(0, 10)}...`);
  console.log('  SLACK_SOCKET_MODE=true');
  console.log('\nRun "pnpm dev" to start the dev server with Socket Mode enabled.');
  console.log('Try @mentioning your dev bot in a Slack channel to test.\n');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
