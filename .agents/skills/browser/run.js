#!/usr/bin/env node
/**
 * Universal Playwright Executor for Claude Code
 *
 * Executes Playwright automation code from:
 * - File path: node run.js script.js
 * - Inline code: node run.js 'await page.goto("...")'
 * - Stdin: cat script.js | node run.js
 *
 * Ensures proper module resolution by running from skill directory.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Change to skill directory for proper module resolution
process.chdir(__dirname);

/**
 * Check if Playwright is installed
 */
function checkPlaywrightInstalled() {
  try {
    require.resolve('playwright');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Install Playwright if missing
 */
function installPlaywright() {
  console.log('Playwright not found. Installing...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    execSync('npx playwright install chromium', { stdio: 'inherit', cwd: __dirname });
    console.log('Playwright installed successfully');
    return true;
  } catch (e) {
    console.error('Failed to install Playwright:', e.message);
    console.error('Please run manually: cd', __dirname, '&& npm run setup');
    return false;
  }
}

/**
 * Parse flags from argv. Returns { flags, codeArgs }.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { connect: false, session: null, headless: true, preset: null };
  const codeArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--connect') {
      flags.connect = true;
    } else if (arg === '--session') {
      flags.session = args[++i] || 'auto';
    } else if (arg === '--headless') {
      flags.headless = args[++i] !== 'false';
    } else if (arg === '--preset') {
      flags.preset = args[++i];
    } else {
      codeArgs.push(arg);
    }
  }

  return { flags, codeArgs };
}

/**
 * Get code to execute from various sources
 */
function getCodeToExecute(codeArgs) {
  // Case 1: File path provided
  if (codeArgs.length > 0 && fs.existsSync(codeArgs[0])) {
    const filePath = path.resolve(codeArgs[0]);
    console.log(`Executing file: ${filePath}`);
    return fs.readFileSync(filePath, 'utf8');
  }

  // Case 2: Inline code provided as argument
  if (codeArgs.length > 0) {
    console.log('Executing inline code');
    return codeArgs.join(' ');
  }

  // Case 3: Code from stdin
  if (!process.stdin.isTTY) {
    console.log('Reading from stdin');
    return fs.readFileSync(0, 'utf8');
  }

  // No input
  console.error('No code to execute');
  console.error('Usage:');
  console.error('  node run.js script.js              # Execute file (headless)');
  console.error("  node run.js --connect script.js     # Execute file (user's Chrome)");
  console.error('  node run.js "code here"             # Execute inline');
  console.error('  cat script.js | node run.js         # Execute from stdin');
  console.error('');
  console.error('Session management:');
  console.error('  node run.js --session start         # Start persistent browser');
  console.error('  node run.js --session stop          # Stop persistent browser');
  console.error('  node run.js --session status        # Check session status');
  process.exit(1);
}

/**
 * Clean up old temporary execution files from previous runs
 */
function cleanupOldTempFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    const tempFiles = files.filter((f) => f.startsWith('.temp-execution-') && f.endsWith('.js'));

    if (tempFiles.length > 0) {
      tempFiles.forEach((file) => {
        const filePath = path.join(__dirname, file);
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore errors - file might be in use or already deleted
        }
      });
    }
  } catch (e) {
    // Ignore directory read errors
  }
}

/**
 * Wrap code in async IIFE if not already wrapped.
 * @param {string} code - Raw user code
 * @param {{ connect?: boolean }} options - Wrapping options
 */
function wrapCodeIfNeeded(code, options = {}) {
  // Check if code already has require() and async structure
  const hasRequire = code.includes('require(');
  const hasAsyncIIFE = code.includes('(async () => {') || code.includes('(async()=>{');

  // If it's already a complete script, return as-is
  if (hasRequire && hasAsyncIIFE) {
    return code;
  }

  // Session mode: connect to running browser server
  if (options.session && !hasRequire) {
    return `
const { chromium, firefox, webkit, devices } = require('playwright');
const helpers = require('./lib/helpers');
const session = require('./lib/session');

const __extraHeaders = helpers.getExtraHeadersFromEnv();

function getContextOptionsWithHeaders(options = {}) {
  if (!__extraHeaders) return options;
  return {
    ...options,
    extraHTTPHeaders: {
      ...__extraHeaders,
      ...(options.extraHTTPHeaders || {})
    }
  };
}

(async () => {
  try {
    const sessionInfo = session.getActiveSession();
    if (!sessionInfo) {
      throw new Error('Session is no longer active. Run: node run.js --session start');
    }
    const sessionConn = await session.connectToSession(sessionInfo);
    const { browser, context, page, saveState } = sessionConn;
    console.log('Connected to session (PID ' + sessionInfo.pid + ')\\n');

    ${code}

    // Save state (cookies, localStorage, current URL) for next connection
    await saveState();
  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
})();
`;
  }

  // --connect mode: wrap with local browser connection
  if (options.connect && !hasRequire) {
    return `
const helpers = require('./lib/helpers');
const { connectToLocalBrowser, getConnectedPage, extractAuthState } = require('./lib/local-browser');

(async () => {
  let connection;
  try {
    console.log('Connecting to Chrome via Playwright MCP Bridge extension...');
    connection = await connectToLocalBrowser();
    const { browser, context, page } = connection;
    console.log('Connected to Chrome. Page ready.\\n');

    ${code}

  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) await connection.close();
  }
})();
`;
  }

  // If it's just Playwright commands, wrap in full template
  if (!hasRequire) {
    return `
const { chromium, firefox, webkit, devices } = require('playwright');
const helpers = require('./lib/helpers');

// Extra headers from environment variables (if configured)
const __extraHeaders = helpers.getExtraHeadersFromEnv();

/**
 * Utility to merge environment headers into context options.
 * Use when creating contexts with raw Playwright API instead of helpers.createContext().
 * @param {Object} options - Context options
 * @returns {Object} Options with extraHTTPHeaders merged in
 */
function getContextOptionsWithHeaders(options = {}) {
  if (!__extraHeaders) return options;
  return {
    ...options,
    extraHTTPHeaders: {
      ...__extraHeaders,
      ...(options.extraHTTPHeaders || {})
    }
  };
}

(async () => {
  try {
    ${code}
  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
`;
  }

  // If has require but no async wrapper
  if (!hasAsyncIIFE) {
    return `
(async () => {
  try {
    ${code}
  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
`;
  }

  return code;
}

/**
 * Main execution
 */
async function main() {
  const { flags, codeArgs } = parseArgs();

  // Handle session management commands (no code execution needed)
  if (flags.session === 'start' || flags.session === 'stop' || flags.session === 'status') {
    if (!checkPlaywrightInstalled()) {
      const installed = installPlaywright();
      if (!installed) process.exit(1);
    }

    const session = require('./lib/session');

    if (flags.session === 'start') {
      try {
        const result = await session.startSession({
          headless: flags.headless,
          preset: flags.preset,
        });
        console.log('Session started.');
        console.log(`  PID: ${result.pid}`);
        console.log(`  Endpoint: ${result.wsEndpoint}`);
        console.log('\nRun scripts normally — they will auto-connect to this session.');
        console.log('Stop with: node run.js --session stop');
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
      return;
    }

    if (flags.session === 'stop') {
      const stopped = await session.stopSession();
      console.log(stopped ? 'Session stopped.' : 'No active session found.');
      return;
    }

    if (flags.session === 'status') {
      const status = session.getSessionStatus();
      if (status.active) {
        console.log('Session active:');
        console.log(`  PID: ${status.pid}`);
        console.log(`  Endpoint: ${status.wsEndpoint}`);
        console.log(`  Started: ${status.startedAt}`);
        console.log(`  Uptime: ${status.uptime}`);
        console.log(`  Headless: ${status.headless}`);
      } else {
        console.log('No active session.');
      }
      return;
    }
  }

  // Detect execution mode
  let useSession = false;
  if (!flags.connect) {
    const session = require('./lib/session');
    const activeSession = session.getActiveSession();
    if (activeSession) {
      useSession = true;
    }
  }

  console.log(
    flags.connect
      ? 'Playwright Skill - Local Browser Connector\n'
      : useSession
        ? 'Playwright Skill - Session Mode\n'
        : 'Playwright Skill - Universal Executor\n'
  );

  // Clean up old temp files from previous runs
  cleanupOldTempFiles();

  // Check Playwright installation
  if (!checkPlaywrightInstalled()) {
    const installed = installPlaywright();
    if (!installed) {
      process.exit(1);
    }
  }

  // Get code to execute
  const rawCode = getCodeToExecute(codeArgs);
  const code = wrapCodeIfNeeded(rawCode, { connect: flags.connect, session: useSession });

  // Create temporary file for execution
  const tempFile = path.join(__dirname, `.temp-execution-${Date.now()}.js`);

  try {
    // Write code to temp file
    fs.writeFileSync(tempFile, code, 'utf8');

    // Execute the code
    console.log('Starting automation...\n');
    require(tempFile);

    // Note: Temp file will be cleaned up on next run
    // This allows long-running async operations to complete safely
  } catch (error) {
    console.error('Execution failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
