// session.js
// Session persistence utilities for the Playwright browser skill.
// Manages a long-running headless Chromium that scripts connect to via WebSocket.

const fs = require('fs');
const path = require('path');

const SESSION_FILE = process.env.PW_SESSION_FILE || '/tmp/playwright-session.json';
const DEFAULT_IDLE_TIMEOUT_MS = 600000; // 10 minutes
const DEFAULT_START_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Check if a process is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and validate the session file.
 * Returns session info if the file exists and the PID is alive.
 * Cleans up stale files automatically.
 *
 * @returns {{ wsEndpoint: string, pid: number, startedAt: string, headless: boolean, playwrightVersion: string } | null}
 */
function getActiveSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (!data.wsEndpoint || !data.pid) return null;
    if (!isProcessAlive(data.pid)) {
      cleanupStaleSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Remove a stale session file.
 */
function cleanupStaleSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch {}
  try {
    const stateFile = SESSION_FILE.replace('.json', '-state.json');
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  } catch {}
}

const SESSION_STATE_FILE = SESSION_FILE.replace('.json', '-state.json');

/**
 * Connect to an active session's browser.
 * Creates a fresh context each time (chromium.connect() scopes are isolated),
 * but restores cookies/localStorage from the session state file if it exists.
 * Touches session file mtime to reset idle timeout.
 *
 * @param {{ wsEndpoint: string, pid: number }} sessionInfo
 * @param {Object} [options]
 * @returns {Promise<{ browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page, saveState: () => Promise<void> }>}
 */
async function connectToSession(sessionInfo, options = {}) {
  const { chromium } = require('playwright');

  // Touch session file mtime to signal activity for idle timeout
  try {
    const now = new Date();
    fs.utimesSync(SESSION_FILE, now, now);
  } catch {}

  let browser;
  try {
    browser = await chromium.connect(sessionInfo.wsEndpoint, { timeout: 5000 });
  } catch (err) {
    cleanupStaleSession();
    throw new Error(`Failed to connect to session (PID ${sessionInfo.pid}): ${err.message}`);
  }

  // Build context options
  const helpers = require('./helpers');
  const envHeaders = helpers.getExtraHeadersFromEnv();
  const contextOptions = {
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  };
  if (envHeaders && Object.keys(envHeaders).length > 0) {
    contextOptions.extraHTTPHeaders = envHeaders;
  }

  // Restore state from previous session script if available
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      contextOptions.storageState = SESSION_STATE_FILE;
    }
  } catch {}

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Navigate to last URL if state was restored
  let lastUrl = null;
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      lastUrl = state._lastUrl;
    }
  } catch {}
  if (lastUrl && lastUrl !== 'about:blank') {
    try {
      await page.goto(lastUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch {}
  }

  /**
   * Save current state (cookies, localStorage, current URL) for next connection.
   * Call this before disconnecting to persist state.
   */
  async function saveState() {
    try {
      const state = await context.storageState();
      state._lastUrl = page.url();
      fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state));
    } catch {}
  }

  return { browser, context, page, saveState };
}

/**
 * Start a new session server as a detached daemon.
 * Waits for the session file to appear.
 *
 * @param {Object} [options]
 * @param {boolean} [options.headless=true]
 * @param {string} [options.preset]
 * @param {number} [options.timeout=15000]
 * @returns {Promise<{ wsEndpoint: string, pid: number }>}
 */
async function startSession(options = {}) {
  const { spawn } = require('child_process');

  // Check for existing session
  const existing = getActiveSession();
  if (existing) {
    throw new Error(
      `Session already running (PID ${existing.pid}, started ${existing.startedAt}).\n` +
        'Stop it first with: node run.js --session stop'
    );
  }

  // Clean up any stale session file
  cleanupStaleSession();

  const serverScript = path.join(__dirname, '..', 'scripts', 'session-server.js');
  const env = {
    ...process.env,
    PW_SESSION_FILE: SESSION_FILE,
    PW_SESSION_HEADLESS: options.headless !== false ? 'true' : 'false',
    PW_SESSION_PRESET: options.preset || '',
  };

  const child = spawn(process.execPath, [serverScript], {
    detached: true,
    stdio: 'ignore',
    env,
    cwd: path.join(__dirname, '..'),
  });
  child.unref();

  // Poll for session file to appear
  const timeout = options.timeout || DEFAULT_START_TIMEOUT_MS;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 200));
    const session = getActiveSession();
    if (session) return session;
  }

  throw new Error('Session server did not start within timeout. Check Playwright installation.');
}

/**
 * Stop the running session.
 * Sends SIGTERM to the session PID and removes the session file.
 *
 * @returns {Promise<boolean>} true if stopped, false if no active session
 */
async function stopSession() {
  const session = getActiveSession();
  if (!session) {
    cleanupStaleSession(); // clean up orphaned file if any
    return false;
  }

  try {
    process.kill(session.pid, 'SIGTERM');
  } catch {}

  // Wait briefly for process to exit
  const start = Date.now();
  while (Date.now() - start < 3000) {
    if (!isProcessAlive(session.pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // Force kill if still alive
  if (isProcessAlive(session.pid)) {
    try {
      process.kill(session.pid, 'SIGKILL');
    } catch {}
  }

  cleanupStaleSession();
  return true;
}

/**
 * Get session status information.
 *
 * @returns {{ active: boolean, wsEndpoint?: string, pid?: number, startedAt?: string, uptime?: string, headless?: boolean }}
 */
function getSessionStatus() {
  const session = getActiveSession();
  if (!session) {
    return { active: false };
  }

  const uptimeMs = Date.now() - new Date(session.startedAt).getTime();
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const min = Math.floor(uptimeSec / 60);
  const sec = uptimeSec % 60;
  const uptime = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

  return {
    active: true,
    wsEndpoint: session.wsEndpoint,
    pid: session.pid,
    startedAt: session.startedAt,
    uptime,
    headless: session.headless,
  };
}

module.exports = {
  SESSION_FILE,
  isProcessAlive,
  getActiveSession,
  cleanupStaleSession,
  connectToSession,
  startSession,
  stopSession,
  getSessionStatus,
};
