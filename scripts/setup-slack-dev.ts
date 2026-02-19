#!/usr/bin/env tsx

/**
 * Slack Dev App Setup
 *
 * Fully automated setup for local Slack development with Socket Mode.
 * First run: 2 pastes (config refresh token + app-level token).
 * Re-runs: 0 pastes (everything persisted in .slack-dev.json).
 */

import * as crypto from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT_DIR, 'packages/agents-work-apps/src/slack/slack-app-manifest.json');
const ENV_PATH = join(ROOT_DIR, '.env');
const DEV_CONFIG_PATH = join(ROOT_DIR, '.slack-dev.json');

const OAUTH_REDIRECT_PORT = 38745;
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}/slack/oauth_redirect`;

// ---------------------------------------------------------------------------
// ANSI colors — no dependencies, respects NO_COLOR (https://no-color.org/)
// ---------------------------------------------------------------------------

const noColor = 'NO_COLOR' in process.env;

const esc = (code: string) => (noColor ? '' : code);

const c = {
  reset: esc('\x1b[0m'),
  bold: esc('\x1b[1m'),
  dim: esc('\x1b[2m'),
  green: esc('\x1b[32m'),
  yellow: esc('\x1b[33m'),
  blue: esc('\x1b[34m'),
  magenta: esc('\x1b[35m'),
  cyan: esc('\x1b[36m'),
  red: esc('\x1b[31m'),
  white: esc('\x1b[37m'),
  bgGreen: esc('\x1b[42m'),
  bgRed: esc('\x1b[41m'),
  bgBlue: esc('\x1b[44m'),
  bgYellow: esc('\x1b[43m'),
};

const fmt = {
  heading: (s: string) => `${c.bold}${c.magenta}${s}${c.reset}`,
  step: (n: number, s: string) => `${c.bold}${c.cyan}[${n}/4]${c.reset} ${c.bold}${s}${c.reset}`,
  ok: (s: string) => `${c.green}${s}${c.reset}`,
  warn: (s: string) => `${c.yellow}${s}${c.reset}`,
  err: (s: string) => `${c.red}${s}${c.reset}`,
  info: (s: string) => `${c.dim}${s}${c.reset}`,
  label: (s: string) => `${c.bold}${s}${c.reset}`,
  url: (s: string) => `${c.blue}${c.bold}${s}${c.reset}`,
  input: (s: string) => `${c.yellow}${c.bold}${s}${c.reset}`,
  value: (s: string) => `${c.cyan}${s}${c.reset}`,
  success: (s: string) => `\n${c.bgGreen}${c.bold}${c.white} ${s} ${c.reset}`,
  fail: (s: string) => `${c.bgRed}${c.bold}${c.white} ${s} ${c.reset}`,
};

// 200 short nouns (3-7 chars). Two-noun combos give 40,000 possibilities,
// keeping collision probability under ~12% at 100 installations.
// prettier-ignore
const NOUNS = [
  'ace',
  'ant',
  'ape',
  'arc',
  'ark',
  'ash',
  'axe',
  'bay',
  'bee',
  'birch',
  'blade',
  'bolt',
  'bone',
  'bow',
  'brook',
  'bud',
  'cape',
  'cedar',
  'cliff',
  'cloud',
  'coal',
  'cob',
  'cod',
  'cone',
  'colt',
  'coral',
  'cork',
  'cove',
  'crane',
  'creek',
  'crow',
  'cube',
  'dart',
  'dawn',
  'deer',
  'den',
  'dew',
  'dock',
  'dove',
  'drift',
  'drum',
  'dune',
  'dusk',
  'eagle',
  'edge',
  'elk',
  'elm',
  'ember',
  'fawn',
  'fern',
  'finch',
  'fir',
  'fjord',
  'flame',
  'flint',
  'fog',
  'forge',
  'fox',
  'frost',
  'gale',
  'gate',
  'gem',
  'glen',
  'glow',
  'goat',
  'grove',
  'gull',
  'hare',
  'hawk',
  'hazel',
  'hedge',
  'heron',
  'hill',
  'hive',
  'holly',
  'horn',
  'hull',
  'ice',
  'iris',
  'isle',
  'ivy',
  'jade',
  'jar',
  'jay',
  'jet',
  'keel',
  'kelp',
  'kite',
  'knoll',
  'lake',
  'lark',
  'lava',
  'leaf',
  'ledge',
  'lily',
  'lime',
  'lynx',
  'maple',
  'marsh',
  'mesa',
  'mink',
  'mint',
  'mist',
  'moon',
  'moss',
  'moth',
  'mule',
  'nest',
  'newt',
  'node',
  'oak',
  'oat',
  'onyx',
  'orbit',
  'orca',
  'ore',
  'otter',
  'owl',
  'palm',
  'path',
  'peak',
  'pearl',
  'pear',
  'petal',
  'pier',
  'pike',
  'pine',
  'plum',
  'pond',
  'pulse',
  'quail',
  'rain',
  'ram',
  'rapid',
  'raven',
  'ray',
  'reed',
  'reef',
  'ridge',
  'rift',
  'robin',
  'root',
  'rose',
  'ruby',
  'rush',
  'sage',
  'sail',
  'sand',
  'seal',
  'seed',
  'shell',
  'shoal',
  'shore',
  'sleet',
  'slope',
  'snail',
  'snow',
  'spark',
  'spike',
  'spire',
  'star',
  'steel',
  'stem',
  'stone',
  'stork',
  'storm',
  'sun',
  'surf',
  'swan',
  'teal',
  'thorn',
  'tide',
  'tiger',
  'trail',
  'trout',
  'tulip',
  'vale',
  'vine',
  'viper',
  'void',
  'wave',
  'well',
  'whale',
  'willow',
  'wind',
  'wolf',
  'wren',
  'yew',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateDevId(): string {
  const a = NOUNS[crypto.randomInt(NOUNS.length)];
  let b = NOUNS[crypto.randomInt(NOUNS.length)];
  while (b === a) {
    b = NOUNS[crypto.randomInt(NOUNS.length)];
  }
  return `${a}-${b}`;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(fmt.input(`  > ${question}`), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

function generateDevManifest(devId: string): Record<string, unknown> {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  delete manifest._readme;

  manifest.display_information = {
    ...manifest.display_information,
    name: `Inkeep Dev ${devId}`,
  };

  if (manifest.features?.bot_user) {
    manifest.features.bot_user = {
      ...manifest.features.bot_user,
      display_name: `inkeep-${devId}`,
    };
  }

  manifest.settings = {
    ...manifest.settings,
    socket_mode_enabled: true,
  };

  if (manifest.settings.event_subscriptions) {
    const { request_url: _eventUrl, ...rest } = manifest.settings.event_subscriptions;
    manifest.settings.event_subscriptions = rest;
  }

  if (manifest.settings.interactivity) {
    const { request_url: _interactivityUrl, ...rest } = manifest.settings.interactivity;
    manifest.settings.interactivity = rest;
  }

  if (manifest.features?.slash_commands) {
    manifest.features.slash_commands = manifest.features.slash_commands.map(
      (cmd: Record<string, unknown>) => {
        const { url: _url, ...rest } = cmd;
        return rest;
      }
    );
  }

  if (manifest.oauth_config?.redirect_urls) {
    manifest.oauth_config.redirect_urls = [
      'https://api.nango.dev/oauth/callback',
      OAUTH_REDIRECT_URI,
    ];
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

function loadDevConfig(): Record<string, string> {
  if (!existsSync(DEV_CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DEV_CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveDevConfig(config: Record<string, string>): void {
  writeFileSync(DEV_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Slack API helpers
// ---------------------------------------------------------------------------

async function rotateConfigToken(
  refreshToken: string
): Promise<{ token: string; refreshToken: string }> {
  const res = await fetch('https://slack.com/api/tooling.tokens.rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Token rotation failed: ${data.error}`);
  }

  return { token: data.token, refreshToken: data.refresh_token };
}

async function createApp(
  configToken: string,
  manifest: Record<string, unknown>
): Promise<{
  appId: string;
  credentials: { client_id: string; client_secret: string; signing_secret: string };
}> {
  const res = await fetch('https://slack.com/api/apps.manifest.create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${configToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ manifest }),
  });

  const data = await res.json();

  if (!data.ok) {
    if (data.error === 'invalid_auth' || data.error === 'token_expired') {
      throw new Error('Config token expired or invalid. Delete .slack-dev.json and re-run.');
    }
    const details = data.errors
      ? '\n' + data.errors.map((e: { message: string }) => `  - ${e.message}`).join('\n')
      : '';
    throw new Error(`apps.manifest.create failed: ${data.error}${details}`);
  }

  return { appId: data.app_id, credentials: data.credentials };
}

async function updateApp(
  configToken: string,
  appId: string,
  manifest: Record<string, unknown>
): Promise<void> {
  const res = await fetch('https://slack.com/api/apps.manifest.update', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${configToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ app_id: appId, manifest }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(
      `apps.manifest.update failed: ${data.error}. If the app was deleted, remove .slack-dev.json and re-run.`
    );
  }
}

async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{ botToken: string; teamId: string; teamName: string }> {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`OAuth token exchange failed: ${data.error}`);
  }

  return {
    botToken: data.access_token,
    teamId: data.team?.id,
    teamName: data.team?.name,
  };
}

/**
 * Spins up a temporary HTTP server to capture the OAuth callback,
 * opens the browser to the Slack OAuth consent page, and waits
 * for the redirect. Returns the bot token.
 */
function installViaOAuth(
  clientId: string,
  clientSecret: string
): Promise<{ botToken: string; teamId: string; teamName: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth timed out after 120 seconds.'));
    }, 120_000);

    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${OAUTH_REDIRECT_PORT}`);

      if (url.pathname !== '/slack/oauth_redirect') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>OAuth failed.</h2><p>Check the terminal for details.</p>');
        clearTimeout(timeout);
        server.close();
        reject(new Error(`OAuth error: ${error || 'no code returned'}`));
        return;
      }

      try {
        const result = await exchangeOAuthCode(clientId, clientSecret, code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<h2>Installed to ${result.teamName}!</h2><p>You can close this tab and return to the terminal.</p>`
        );
        clearTimeout(timeout);
        server.close();
        resolve(result);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>OAuth token exchange failed.</h2><p>Check the terminal.</p>');
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_REDIRECT_PORT, async () => {
      const botScopes = [
        'app_mentions:read',
        'channels:history',
        'channels:read',
        'chat:write',
        'chat:write.public',
        'commands',
        'groups:history',
        'groups:read',
        'im:history',
        'im:read',
        'im:write',
        'team:read',
        'users:read',
        'users:read.email',
      ].join(',');

      const authUrl = new URL('https://slack.com/oauth/v2/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('scope', botScopes);
      authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);

      console.log(`  ${fmt.info('Opening browser for Slack OAuth...')}`);
      await openBrowser(authUrl.toString());
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n${fmt.heading('=== Slack Dev App Setup ===')}\n`);
  console.log(
    `  ${fmt.dim('This script creates a personal Slack app for local Socket Mode development.')}`
  );
  console.log(
    `  ${fmt.dim('All credentials are saved to')} ${fmt.info('.slack-dev.json')} ${fmt.dim('(git-ignored) so re-runs skip completed steps.')}\n`
  );

  if (!existsSync(MANIFEST_PATH)) {
    console.error(fmt.err(`Manifest not found at: ${MANIFEST_PATH}`));
    process.exit(1);
  }

  const devConfig = loadDevConfig();
  const devId = devConfig.devId || generateDevId();
  devConfig.devId = devId;

  console.log(`  ${fmt.label('App name:')}  ${fmt.value(`Inkeep Dev ${devId}`)}`);
  console.log(`  ${fmt.label('Bot name:')}  ${fmt.value(`@inkeep-${devId}`)}\n`);

  // ---- Step 1: Config token (refresh-only — derive access token) ----------
  let configToken: string | null = null;

  if (devConfig.configRefreshToken) {
    process.stdout.write(`${fmt.info('Refreshing config token...')} `);
    try {
      const rotated = await rotateConfigToken(devConfig.configRefreshToken);
      configToken = rotated.token;
      devConfig.configRefreshToken = rotated.refreshToken;
      saveDevConfig(devConfig);
      console.log(fmt.ok('ok'));
    } catch {
      console.log(fmt.warn('expired — need a new one.'));
      devConfig.configRefreshToken = '';
    }
  }

  if (!configToken) {
    console.log(fmt.step(1, 'Slack App Configuration Token (one-time)\n'));
    await openBrowser('https://api.slack.com/apps');
    console.log(`  ${fmt.info('Browser opened to')} ${fmt.url('https://api.slack.com/apps')}`);
    console.log(`  ${fmt.info('Scroll to "Your App Configuration Tokens" → Generate Token')}`);
    console.log(
      `  ${fmt.warn('You will see TWO tokens. Only copy the REFRESH TOKEN (ignore the access token).')}\n`
    );

    const refreshToken = await prompt('Paste the Refresh Token (starts with xoxe-): ');

    if (!refreshToken) {
      console.error(fmt.err('Refresh token is required.'));
      process.exit(1);
    }

    process.stdout.write(`  ${fmt.info('Exchanging for access token...')} `);
    const rotated = await rotateConfigToken(refreshToken);
    configToken = rotated.token;
    devConfig.configRefreshToken = rotated.refreshToken;
    saveDevConfig(devConfig);
    console.log(fmt.ok('ok'));
  }

  // ---- Step 2: Create or update the Slack app ----------------------------
  const devManifest = generateDevManifest(devId);

  if (devConfig.appId) {
    process.stdout.write(`${fmt.info(`Updating app ${devConfig.appId}...`)} `);
    await updateApp(configToken, devConfig.appId, devManifest);
    console.log(fmt.ok('ok'));
  } else {
    console.log(`\n${fmt.step(2, 'Creating Slack app')}\n`);
    process.stdout.write(`  ${fmt.info('Calling apps.manifest.create...')} `);
    const { appId, credentials } = await createApp(configToken, devManifest);
    console.log(fmt.ok(`ok (${appId})`));

    devConfig.appId = appId;
    devConfig.clientId = credentials.client_id;
    devConfig.clientSecret = credentials.client_secret;
    devConfig.signingSecret = credentials.signing_secret;

    console.log(`  ${fmt.ok('Credentials saved automatically — no copy-paste needed.')}`);
  }

  saveDevConfig(devConfig);

  setEnvVar(ENV_PATH, 'SLACK_CLIENT_ID', devConfig.clientId);
  setEnvVar(ENV_PATH, 'SLACK_CLIENT_SECRET', devConfig.clientSecret);
  setEnvVar(ENV_PATH, 'SLACK_SIGNING_SECRET', devConfig.signingSecret);
  setEnvVar(ENV_PATH, 'SLACK_APP_URL', 'http://localhost:3002');

  // ---- Step 3: App-level token (only manual step — no API exists) --------
  if (!devConfig.appToken) {
    const appSettingsUrl = `https://api.slack.com/apps/${devConfig.appId}/general`;
    console.log(`\n${fmt.step(3, 'App-Level Token for Socket Mode')}\n`);
    console.log(`  ${fmt.warn('This is the only token Slack cannot generate via API.')}`);
    console.log(`  ${fmt.info('Browser opening to your app settings...')}`);
    console.log(`  ${fmt.info('→ Scroll to "App-Level Tokens"')}`);
    console.log(`  ${fmt.info('→ Click "Generate Token and Scopes"')}`);
    console.log(
      `  ${fmt.info('→ Name:')} ${fmt.value('"socket-mode"')}${fmt.info(', Scope:')} ${fmt.value('"connections:write"')}\n`
    );
    await openBrowser(appSettingsUrl);

    const appToken = await prompt('Paste the App-Level Token (starts with xapp-): ');
    if (!appToken.startsWith('xapp-')) {
      console.error(fmt.err('Invalid token. App-Level Tokens start with "xapp-".'));
      process.exit(1);
    }

    devConfig.appToken = appToken;
    saveDevConfig(devConfig);
    console.log(`  ${fmt.ok('Saved.')}`);
  }

  setEnvVar(ENV_PATH, 'SLACK_APP_TOKEN', devConfig.appToken);

  // ---- Step 4: OAuth install (automatic via temp server) -----------------
  if (!devConfig.botToken) {
    console.log(`\n${fmt.step(4, 'Install app to workspace')}\n`);
    console.log(`  ${fmt.info('Starting temporary OAuth server...')}`);
    const { botToken, teamId, teamName } = await installViaOAuth(
      devConfig.clientId,
      devConfig.clientSecret
    );
    console.log(`  ${fmt.ok(`Installed to "${teamName}" (${teamId})`)}`);

    devConfig.botToken = botToken;
    devConfig.teamId = teamId;
    devConfig.teamName = teamName;
    saveDevConfig(devConfig);
  }

  setEnvVar(ENV_PATH, 'SLACK_BOT_TOKEN', devConfig.botToken);

  // ---- Done --------------------------------------------------------------
  console.log(fmt.success('Setup complete!'));
  console.log('');
  console.log(`  ${fmt.label('App:')}        ${fmt.value(`Inkeep Dev ${devId}`)}`);
  console.log(`  ${fmt.label('Bot:')}        ${fmt.value(`@inkeep-${devId}`)}`);
  console.log(`  ${fmt.label('Workspace:')}  ${fmt.value(devConfig.teamName || 'unknown')}`);
  console.log(
    `  ${fmt.label('Config:')}     ${fmt.info('.slack-dev.json')} ${fmt.dim('(app ID, tokens, refresh token — enables zero-paste re-runs)')}`
  );
  console.log(
    `  ${fmt.label('Env:')}        ${fmt.info('.env')} ${fmt.dim('(SLACK_APP_TOKEN, SLACK_BOT_TOKEN, etc.)')}`
  );
  console.log('');
  console.log(`  Run ${fmt.value('pnpm dev')} to start with Socket Mode.`);
  console.log(`  To start fresh, delete ${fmt.info('.slack-dev.json')} and re-run this script.\n`);
}

main().catch((err) => {
  console.error(`\n${fmt.fail('Setup failed')} ${fmt.err(err.message || err)}`);
  process.exit(1);
});
