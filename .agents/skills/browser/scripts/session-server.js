#!/usr/bin/env node
// session-server.js
// Persistent Playwright browser daemon. Launched by lib/session.js startSession().
// Keeps a headless Chromium running via browserType.launchServer() so scripts
// can connect via WebSocket without relaunching the browser each time.

const fs = require('fs');
const path = require('path');

// Ensure we resolve modules from the skill directory
process.chdir(path.join(__dirname, '..'));

const SESSION_FILE = process.env.PW_SESSION_FILE || '/tmp/playwright-session.json';
const IDLE_TIMEOUT_MS = parseInt(process.env.PW_SESSION_IDLE_TIMEOUT || '600000', 10); // 10 min
const IDLE_CHECK_INTERVAL_MS = 60000; // check every 60s
const HEADLESS = process.env.PW_SESSION_HEADLESS !== 'false';

let browserServer = null;
let idleCheckTimer = null;
let shuttingDown = false;

/**
 * Write session file atomically (write to .tmp then rename).
 */
function writeSessionFile(wsEndpoint) {
  let playwrightVersion = 'unknown';
  try {
    const pwPkg = require('playwright/package.json');
    playwrightVersion = pwPkg.version;
  } catch {}

  const data = {
    wsEndpoint,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    headless: HEADLESS,
    playwrightVersion,
  };

  const tmpFile = SESSION_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, SESSION_FILE);
}

/**
 * Clean up: close browser server and remove session file.
 */
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (idleCheckTimer) {
    clearInterval(idleCheckTimer);
    idleCheckTimer = null;
  }

  if (browserServer) {
    try {
      await browserServer.close();
    } catch {}
    browserServer = null;
  }

  try {
    if (fs.existsSync(SESSION_FILE)) {
      // Only remove if it's our session file (check PID)
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (data.pid === process.pid) {
        fs.unlinkSync(SESSION_FILE);
      }
    }
  } catch {}

  process.exit(0);
}

/**
 * Check if the session has been idle too long.
 * Uses the session file's mtime as a heartbeat — clients touch it on connect.
 */
function checkIdleTimeout() {
  try {
    const stat = fs.statSync(SESSION_FILE);
    const idleMs = Date.now() - stat.mtimeMs;
    if (idleMs > IDLE_TIMEOUT_MS) {
      cleanup();
    }
  } catch {
    // Session file missing — shut down
    cleanup();
  }
}

async function main() {
  // Check no existing session
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      try {
        process.kill(data.pid, 0);
        // PID is alive — another session is running
        process.exit(1);
      } catch {
        // PID is dead — stale file, remove it
        fs.unlinkSync(SESSION_FILE);
      }
    }
  } catch {}

  const { chromium } = require('playwright');

  browserServer = await chromium.launchServer({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const wsEndpoint = browserServer.wsEndpoint();
  writeSessionFile(wsEndpoint);

  // Start idle timeout checker
  idleCheckTimer = setInterval(checkIdleTimeout, IDLE_CHECK_INTERVAL_MS);

  // Handle the browser server closing unexpectedly
  browserServer.on('close', () => {
    if (!shuttingDown) cleanup();
  });
}

// Signal handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('uncaughtException', (err) => {
  // Log to a temp file since stdout/stderr may be detached
  try {
    fs.appendFileSync(
      '/tmp/playwright-session-error.log',
      `[${new Date().toISOString()}] ${err.stack || err.message}\n`
    );
  } catch {}
  cleanup();
});

main().catch((err) => {
  try {
    fs.appendFileSync(
      '/tmp/playwright-session-error.log',
      `[${new Date().toISOString()}] startup: ${err.stack || err.message}\n`
    );
  } catch {}
  process.exit(1);
});
