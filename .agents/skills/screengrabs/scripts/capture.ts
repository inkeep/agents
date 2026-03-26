/**
 * Screengrab Capture Script
 *
 * Captures screenshots of UI pages with automatic sensitive data masking.
 * Supports local dev servers, preview deployments, and reusable Playwright servers.
 *
 * Usage:
 *   npx tsx scripts/capture.ts \
 *     --base-url http://localhost:3000 \
 *     --routes "/dashboard,/settings" \
 *     --output-dir ./screengrabs
 *
 * Playwright server mode:
 *   npx tsx scripts/capture.ts --serve --port 3001
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Browser, chromium } from 'playwright';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Load and execute a pre-script before masking/screenshot.
 * The pre-script is a JS module that exports an async function receiving { page, url, route }.
 * Use for interaction that must happen before capture: dismiss popups, click tabs, scroll, fill forms, etc.
 */
async function runPreScript(
  scriptPath: string,
  page: import('playwright').Page,
  url: string,
  route: string
): Promise<void> {
  const resolvedPath = path.resolve(scriptPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Pre-script not found: ${resolvedPath}`);
  }
  console.log(`  Running pre-script: ${resolvedPath}`);
  // Use dynamic import (works with both CJS module.exports and ESM export default)
  const preScript = await import(resolvedPath);
  const fn = typeof preScript.default === 'function' ? preScript.default : preScript;
  if (typeof fn !== 'function') {
    throw new Error(`Pre-script must export a default function (got ${typeof fn}): ${resolvedPath}`);
  }
  await fn({ page, url, route });
}

const MASKING_CSS = `
  input[type="password"] {
    -webkit-text-security: disc !important;
    color: transparent !important;
    text-shadow: 0 0 8px rgba(0,0,0,0.5) !important;
  }
`;

const MASKING_JS = `(() => {
  // Mask password inputs
  document.querySelectorAll('input[type="password"]').forEach(el => {
    el.value = '••••••••';
  });

  // Walk text nodes and redact sensitive patterns
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{20,}/g,
    /sk-ant-[a-zA-Z0-9-]{20,}/g,
    /sk_live_[a-zA-Z0-9]{20,}/g,
    /Bearer\\s+[a-zA-Z0-9._-]{20,}/g,
    /gh[pos]_[a-zA-Z0-9]{36}/g,
    /AKIA[A-Z0-9]{16}/g,
    /eyJ[a-zA-Z0-9_-]{50,}\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+/g,
    /-----BEGIN[A-Z ]*PRIVATE KEY-----/g,
    /postgresql:\\/\\/[^\\s]+:[^\\s]+@/g,
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let node;
  while (node = walker.nextNode()) {
    let text = node.textContent || '';
    let changed = false;
    for (const pattern of sensitivePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, '[REDACTED]');
        changed = true;
      }
    }
    if (changed) {
      node.textContent = text;
    }
  }
})()`;

async function startServer(port: number) {
  const server = await chromium.launchServer({
    port,
    headless: true,
  });
  console.log(`Playwright server started at: ${server.wsEndpoint()}`);
  console.log('Press Ctrl+C to stop.');
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

async function capture() {
  const baseUrl = getArg('base-url');
  const routesStr = getArg('routes');
  const outputDir = getArg('output-dir') || 'tmp/screengrabs';
  const viewport = getArg('viewport') || '1280x800';
  const connectUrl = getArg('connect');
  const extraMaskSelectors = getArg('mask-selectors');
  const waitMs = Number.parseInt(getArg('wait') || '2000', 10);
  const fullPage = hasFlag('full-page');
  const authCookie = getArg('auth-cookie');
  const preScriptPath = getArg('pre-script');

  if (!baseUrl || !routesStr) {
    console.error(
      'Usage: npx tsx capture.ts --base-url <url> --routes <path1,path2,...> [options]\n'
    );
    console.error('Options:');
    console.error('  --output-dir <dir>       Output directory (default: tmp/screengrabs)');
    console.error('  --viewport <WxH>         Viewport size (default: 1280x800)');
    console.error('  --connect <ws-url>       Connect to existing Playwright server');
    console.error('  --mask-selectors <s>     Additional CSS selectors to blur (comma-separated)');
    console.error('  --wait <ms>              Wait after page load (default: 2000)');
    console.error('  --full-page              Capture full page screenshot');
    console.error('  --auth-cookie <value>    Set session cookie for auth');
    console.error('  --pre-script <path>      JS/TS file to run on page before capture (for interaction)');
    console.error('\nServer mode:');
    console.error('  --serve                  Start a reusable Playwright server');
    console.error('  --port <number>          Server port (default: 3001)');
    process.exit(1);
  }

  const routes = routesStr.split(',').map((r) => r.trim());
  const [vw, vh] = viewport.split('x').map(Number);

  fs.mkdirSync(outputDir, { recursive: true });

  let fullMaskingCss = MASKING_CSS;
  if (extraMaskSelectors) {
    const selectors = extraMaskSelectors.split(',').map((s) => s.trim());
    fullMaskingCss += selectors.map((s) => `\n  ${s} { filter: blur(5px) !important; }`).join('');
  }

  let browser: Browser;
  let isConnected = false;

  if (connectUrl) {
    console.log(`Connecting to Playwright server at ${connectUrl}`);
    browser = await chromium.connect(connectUrl);
    isConnected = true;
  } else {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
  }

  try {
    const context = await browser.newContext({
      viewport: { width: vw, height: vh },
    });

    if (authCookie) {
      const url = new URL(baseUrl);
      await context.addCookies([
        {
          name: 'session',
          value: authCookie,
          domain: url.hostname,
          path: '/',
        },
      ]);
    }

    const page = await context.newPage();

    for (const route of routes) {
      const url = `${baseUrl.replace(/\/$/, '')}${route}`;
      const safeName = route.replace(/^\//, '').replace(/\//g, '-') || 'index';

      console.log(`\nCapturing: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      } catch {
        console.log('  networkidle timed out, proceeding with domcontentloaded...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      await page.waitForTimeout(waitMs);

      // Run pre-script for interaction (dismiss popups, click tabs, scroll, etc.)
      if (preScriptPath) {
        await runPreScript(preScriptPath, page, url, route);
        await page.waitForTimeout(500);
      }

      await page.addStyleTag({ content: fullMaskingCss });
      await page.evaluate(MASKING_JS);
      await page.waitForTimeout(500);

      const screenshotPath = path.join(outputDir, `${safeName}.png`);
      await page.screenshot({ path: screenshotPath, fullPage });
      console.log(`  Screenshot: ${screenshotPath}`);

      const domText = await page.evaluate(() => document.body.innerText);
      const textPath = path.join(outputDir, `${safeName}.dom-text.txt`);
      fs.writeFileSync(textPath, domText, 'utf-8');
      console.log(`  DOM text:   ${textPath}`);
    }

    await context.close();
    console.log(`\nDone. ${routes.length} screenshot(s) saved to ${outputDir}`);
  } finally {
    if (!isConnected) {
      await browser.close();
    }
  }
}

async function main() {
  if (hasFlag('serve')) {
    const port = Number.parseInt(getArg('port') || '3001', 10);
    await startServer(port);
  } else {
    await capture();
  }
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
