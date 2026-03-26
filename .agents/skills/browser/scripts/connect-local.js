#!/usr/bin/env node
/**
 * Local Browser Connector — execute Playwright code against the user's running Chrome.
 *
 * Uses the Playwright MCP Bridge extension to connect via CDP relay.
 * Same input modes as run.js (file, inline, stdin) but connects to Chrome instead of launching.
 *
 * Usage:
 *   node scripts/connect-local.js script.js
 *   node scripts/connect-local.js --inline "await page.goto('https://example.com')"
 *   cat script.js | node scripts/connect-local.js
 */

const fs = require('fs');
const path = require('path');

// Resolve to skill root (one level up from scripts/)
const skillDir = path.resolve(__dirname, '..');
process.chdir(skillDir);

/**
 * Get code to execute from various sources (mirrors run.js logic)
 */
function getCodeToExecute() {
  const args = process.argv.slice(2);

  // Filter out flags
  const codeArgs = args.filter((a) => a !== '--inline');
  const isInline = args.includes('--inline');

  // Case 1: --inline flag with code
  if (isInline && codeArgs.length > 0) {
    console.log('Executing inline code (local browser)');
    return codeArgs.join(' ');
  }

  // Case 2: File path provided
  if (codeArgs.length > 0 && fs.existsSync(codeArgs[0])) {
    const filePath = path.resolve(codeArgs[0]);
    console.log(`Executing file (local browser): ${filePath}`);
    return fs.readFileSync(filePath, 'utf8');
  }

  // Case 3: Non-file argument treated as inline code
  if (codeArgs.length > 0) {
    console.log('Executing inline code (local browser)');
    return codeArgs.join(' ');
  }

  // Case 4: Stdin
  if (!process.stdin.isTTY) {
    console.log('Reading from stdin (local browser)');
    return fs.readFileSync(0, 'utf8');
  }

  console.error('No code to execute');
  console.error('Usage:');
  console.error('  node scripts/connect-local.js script.js');
  console.error('  node scripts/connect-local.js --inline "await page.goto(\'...\')\"');
  console.error('  cat script.js | node scripts/connect-local.js');
  process.exit(1);
}

/**
 * Wrap user code in the local browser connection template.
 * Unlike run.js, this connects to the user's Chrome instead of launching headless.
 */
function wrapCode(code) {
  // If code already has its own require + async structure, return as-is
  const hasRequire = code.includes('require(');
  const hasAsyncIIFE = code.includes('(async () => {') || code.includes('(async()=>{');
  if (hasRequire && hasAsyncIIFE) {
    return code;
  }

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
    console.error('Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) await connection.close();
  }
})();
`;
}

/**
 * Clean up old temp files
 */
function cleanupOldTempFiles() {
  try {
    const files = fs.readdirSync(skillDir);
    files
      .filter((f) => f.startsWith('.temp-connect-') && f.endsWith('.js'))
      .forEach((f) => {
        try {
          fs.unlinkSync(path.join(skillDir, f));
        } catch {}
      });
  } catch {}
}

async function main() {
  console.log('Playwright Skill — Local Browser Connector\n');

  cleanupOldTempFiles();

  // Check Playwright
  try {
    require.resolve('playwright');
  } catch {
    console.error('Playwright not installed. Run: cd', skillDir, '&& npm run setup');
    process.exit(1);
  }

  const rawCode = getCodeToExecute();
  const code = wrapCode(rawCode);

  const tempFile = path.join(skillDir, `.temp-connect-${Date.now()}.js`);

  try {
    fs.writeFileSync(tempFile, code, 'utf8');
    console.log('Starting local browser automation...\n');
    require(tempFile);
  } catch (error) {
    console.error('Execution failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
