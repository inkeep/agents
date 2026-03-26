---
name: browser
description: "Browser automation with Playwright — navigate pages, fill forms, take screenshots, test responsive design, validate UX, test login flows, check links, inspect network requests, inject JavaScript, monitor console errors, capture network traffic, record video, inspect browser state, run accessibility audits, measure performance, simulate network conditions, discover page structure, persist auth sessions, create annotated GIFs, handle dialogs, dismiss overlays, capture traces, generate PDFs, and download files. Headless by default for CI/Docker. Use when user wants to test websites, automate browser interactions, validate web functionality, or perform browser-based testing. Triggers: playwright, browser test, browser automation, web test, screenshot, responsive test, test the page, automate browser, headless browser, UI test, console errors, console monitoring, network inspection, network capture, accessibility audit, a11y test, performance metrics, web vitals, video recording, browser state, localStorage, network simulation, offline testing, page structure, accessibility tree, authenticated testing, auth state, session reuse, annotated gif, dialog handling, overlay dismissal, cookie banner, tracing, trace viewer, pdf generation, file download, time manipulation, websocket interception."
argument-hint: "[URL or description of what to test/automate]"
---

**IMPORTANT - Path Resolution:**
This skill is installed via the plugin system. Before executing any commands, determine the skill directory based on where you loaded this SKILL.md file, and use that path in all commands below. Replace `$SKILL_DIR` with the actual discovered path.

Expected plugin path: `~/.claude/plugins/marketplaces/inkeep-team-skills/plugins/eng/skills/browser`

# Playwright Browser Automation

General-purpose browser automation skill. Write custom Playwright code for any automation task and execute it via the universal executor.

**CRITICAL WORKFLOW - Follow these steps in order:**

1. **Start a session** - If you expect to run more than one script (debugging, iterating, multi-step flows), start a persistent browser session FIRST. This is the **default mode** for all interactive work:

   ```bash
   cd $SKILL_DIR && node run.js --session start
   ```

   Scripts auto-detect the session and connect via WebSocket (~50ms) instead of launching a new browser (~2-3s). Login state, cookies, and localStorage persist between runs. Skip this step only for true one-off scripts or CI/CD environments.

2. **Auto-detect dev servers** - For localhost testing, run server detection:

   ```bash
   cd $SKILL_DIR && node -e "require('./lib/helpers').detectDevServers().then(servers => console.log(JSON.stringify(servers)))"
   ```

   - If **1 server found**: Use it automatically, inform user
   - If **multiple servers found**: Ask user which one to test
   - If **no servers found**: Ask for URL or offer to help start dev server

3. **Write scripts to /tmp** - NEVER write test files to skill directory; always use `/tmp/playwright-test-*.js`

4. **Parameterize URLs** - Always make URLs configurable via environment variable or constant at top of script

5. **Stop session when done** - Clean up the persistent browser when the task is complete:

   ```bash
   cd $SKILL_DIR && node run.js --session stop
   ```

   Sessions also auto-stop after 10 minutes of inactivity.

## How It Works

1. You describe what you want to test/automate
2. Start a session (`--session start`) — browser stays warm for all subsequent scripts
3. Auto-detect running dev servers (or ask for URL if testing external site)
4. Write custom Playwright code in `/tmp/playwright-test-*.js` (won't clutter your project)
5. Execute it via: `cd $SKILL_DIR && node run.js /tmp/playwright-test-*.js` — auto-connects to session
6. Results displayed in real-time; login state and pages persist between runs
7. Stop session when done (`--session stop`); test files auto-cleaned from /tmp by OS

### Local browser mode (user's Chrome)

When the user asks you to interact with their actual browser — using their auth, cookies, or extensions — use the local browser connector instead of headless Playwright.

**When to use:** User directs you to do something in their browser on their behalf, or you need their authenticated session. Only available on the user's local machine (not Docker/sandbox).

**Prerequisites:** Chrome running + [Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) extension installed.

**Execute:** `cd $SKILL_DIR && node scripts/connect-local.js /tmp/my-script.js` or `cd $SKILL_DIR && node run.js --connect /tmp/my-script.js`

**Load:** `references/local-browser.md` for routing guidance, limitations, and examples.

## Setup (First Time)

```bash
cd $SKILL_DIR
npm run setup
```

This installs Playwright and Chromium browser. Only needed once.

## Execution Pattern

**Step 1: Detect dev servers (for localhost testing)**

```bash
cd $SKILL_DIR && node -e "require('./lib/helpers').detectDevServers().then(s => console.log(JSON.stringify(s)))"
```

**Step 2: Write test script to /tmp with URL parameter**

```javascript
// /tmp/playwright-test-page.js
const { chromium } = require('playwright');

// Parameterized URL (detected or user-provided)
const TARGET_URL = 'http://localhost:3001'; // <-- Auto-detected or from user

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  console.log('Page loaded:', await page.title());

  await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
  console.log('Screenshot saved to /tmp/screenshot.png');

  await browser.close();
})();
```

**Step 3: Execute from skill directory**

```bash
cd $SKILL_DIR && node run.js /tmp/playwright-test-page.js
```

## Common Patterns

### Test a Page (Multiple Viewports)

```javascript
// /tmp/playwright-test-responsive.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001'; // Auto-detected

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Desktop test
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(TARGET_URL);
  console.log('Desktop - Title:', await page.title());
  await page.screenshot({ path: '/tmp/desktop.png', fullPage: true });

  // Mobile test
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: '/tmp/mobile.png', fullPage: true });

  await browser.close();
})();
```

### Test Login Flow

```javascript
// /tmp/playwright-test-login.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001'; // Auto-detected

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${TARGET_URL}/login`);

  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Wait for redirect
  await page.waitForURL('**/dashboard');
  console.log('Login successful, redirected to dashboard');

  await browser.close();
})();
```

### Test Authenticated Pages

Login once, save the session, and reuse it across multiple test runs. Avoids re-logging in every time.

**Step 1: Login and save auth state (run once)**

```javascript
// /tmp/playwright-auth-save.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001/login';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createContext(browser);
  const page = await context.newPage();

  await page.goto(TARGET_URL);
  await helpers.authenticate(page, {
    username: 'admin@example.com',
    password: 'password123'
  });

  // Save session for reuse
  const saved = await helpers.saveAuthState(context);
  console.log('Auth state saved:', saved.path);
  console.log(`  ${saved.cookies} cookies, ${saved.origins} origins`);

  // For Firebase/Supabase/modern auth that stores tokens in IndexedDB:
  // const saved = await helpers.saveAuthState(context, '/tmp/auth.json', { indexedDB: true });

  await browser.close();
})();
```

**Step 2: Reuse saved auth in subsequent tests**

```javascript
// /tmp/playwright-test-dashboard.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001/dashboard';

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Load saved auth — skips login entirely
  const context = await helpers.loadAuthState(browser);
  const page = await context.newPage();

  await page.goto(TARGET_URL);
  console.log('Page title:', await page.title());
  // You're now on the authenticated dashboard
  await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true });

  await browser.close();
})();
```

### Fill and Submit Form

```javascript
// /tmp/playwright-test-form.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001'; // Auto-detected

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${TARGET_URL}/contact`);

  await page.fill('input[name="name"]', 'John Doe');
  await page.fill('input[name="email"]', 'john@example.com');
  await page.fill('textarea[name="message"]', 'Test message');
  await page.click('button[type="submit"]');

  // Verify submission
  await page.waitForSelector('.success-message');
  console.log('Form submitted successfully');

  await browser.close();
})();
```

### Network Request Inspection

```javascript
// /tmp/playwright-test-network.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture all API requests
  const apiRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      apiRequests.push({
        method: request.method(),
        url: request.url(),
        headers: request.headers()
      });
    }
  });

  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  console.log('API requests captured:', JSON.stringify(apiRequests, null, 2));

  await browser.close();
})();
```

### JavaScript Injection

```javascript
// /tmp/playwright-test-js-inject.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(TARGET_URL);

  // Inject and execute JavaScript
  const result = await page.evaluate(() => {
    return {
      title: document.title,
      links: document.querySelectorAll('a').length,
      meta: Array.from(document.querySelectorAll('meta')).map(m => ({
        name: m.getAttribute('name'),
        content: m.getAttribute('content')
      })).filter(m => m.name),
      localStorage: Object.keys(window.localStorage),
      cookies: document.cookie
    };
  });

  console.log('Page analysis:', JSON.stringify(result, null, 2));

  await browser.close();
})();
```

### Check for Broken Links

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:3000');

  const links = await page.locator('a[href^="http"]').all();
  const results = { working: 0, broken: [] };

  for (const link of links) {
    const href = await link.getAttribute('href');
    try {
      const response = await page.request.head(href);
      if (response.ok()) {
        results.working++;
      } else {
        results.broken.push({ url: href, status: response.status() });
      }
    } catch (e) {
      results.broken.push({ url: href, error: e.message });
    }
  }

  console.log(`Working links: ${results.working}`);
  console.log(`Broken links:`, results.broken);

  await browser.close();
})();
```

### Take Screenshot with Error Handling

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 10000,
    });

    await page.screenshot({
      path: '/tmp/screenshot.png',
      fullPage: true,
    });

    console.log('Screenshot saved to /tmp/screenshot.png');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
```

### Test Responsive Design

```javascript
// /tmp/playwright-test-responsive-full.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001'; // Auto-detected

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const viewports = [
    { name: 'Desktop', width: 1920, height: 1080 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile', width: 375, height: 667 },
  ];

  for (const viewport of viewports) {
    console.log(
      `Testing ${viewport.name} (${viewport.width}x${viewport.height})`,
    );

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    await page.goto(TARGET_URL);
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: `/tmp/${viewport.name.toLowerCase()}.png`,
      fullPage: true,
    });
  }

  console.log('All viewports tested');
  await browser.close();
})();
```

### Monitor Console Errors During a Flow

Use when verifying a UI flow doesn't produce silent JS errors.

```javascript
// /tmp/playwright-test-console.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Start capturing BEFORE navigation
  const consoleLogs = helpers.startConsoleCapture(page);

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  // Interact with the page
  await page.click('button.submit').catch(() => {});
  await page.waitForTimeout(1000);

  // Check for errors
  const errors = helpers.getConsoleErrors(consoleLogs);
  if (errors.length > 0) {
    console.log(`FAIL: ${errors.length} console error(s):`);
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`));
  } else {
    console.log('PASS: No console errors');
  }

  // Optionally filter for specific logs
  const apiLogs = helpers.getConsoleLogs(consoleLogs, /api|fetch/i);
  console.log(`API-related logs: ${apiLogs.length}`);

  await browser.close();
})();
```

### Verify Network Requests During UI Flow

Use when checking that the right API calls fire with the right status codes.

```javascript
// /tmp/playwright-test-network-verify.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture only API requests
  const network = helpers.startNetworkCapture(page, '/api/');

  await page.goto(`${TARGET_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  // Check for failed API calls
  const failed = helpers.getFailedRequests(network);
  if (failed.length > 0) {
    console.log(`FAIL: ${failed.length} failed API request(s):`);
    failed.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status || r.failure}`));
  } else {
    console.log('PASS: All API requests succeeded');
  }

  // Review all captured requests
  const all = helpers.getCapturedRequests(network);
  console.log(`Total API requests: ${all.length}`);
  all.forEach(r => console.log(`  ${r.status} ${r.method} ${r.url}`));

  await browser.close();
})();
```

### Record Video of a Flow

Use when you need a recording of multi-step browser interaction.

```javascript
// /tmp/playwright-test-video.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createVideoContext(browser, {
    outputDir: '/tmp/playwright-videos'
  });
  const page = await context.newPage();

  await page.goto(TARGET_URL);
  await page.click('nav a:first-child');
  await page.waitForTimeout(1000);
  await page.click('button.submit').catch(() => {});
  await page.waitForTimeout(1000);

  // Video is saved when page closes
  const videoPath = await page.video().path();
  await page.close();
  await context.close();

  console.log(`Video saved: ${videoPath}`);
  await browser.close();
})();
```

### Inspect Browser State After Mutation

Use when verifying that a UI action correctly persisted data.

```javascript
// /tmp/playwright-test-state.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(TARGET_URL);

  // Check state before action
  const storageBefore = await helpers.getLocalStorage(page);
  console.log('localStorage before:', JSON.stringify(storageBefore));

  const cookies = await helpers.getCookies(context);
  console.log('Cookies:', cookies.map(c => `${c.name}=${c.value}`));

  // Perform some action that should change state
  await page.click('button.save-preferences').catch(() => {});
  await page.waitForTimeout(500);

  // Check state after action
  const storageAfter = await helpers.getLocalStorage(page);
  console.log('localStorage after:', JSON.stringify(storageAfter));

  // Clean up for next test
  await helpers.clearAllStorage(page);

  await browser.close();
})();
```

### Discover Page Structure

Use when you don't know a page's DOM structure — third-party sites, authenticated dashboards, or unfamiliar UIs. Get the ARIA snapshot to find the right selectors before writing interactions.

Returns `yaml` (raw ARIA snapshot string preserving hierarchy), `tree` (parsed nodes with suggested selectors), and `summary` (counts by role type).

```javascript
// /tmp/playwright-test-discover.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createContext(browser);
  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // Get full page structure
  const structure = await helpers.getPageStructure(page);
  console.log('Page:', structure.title);
  console.log('Elements:', JSON.stringify(structure.summary));

  // Raw YAML preserves nesting — useful for understanding page hierarchy
  console.log('ARIA snapshot:\n', structure.yaml);

  // Parsed tree has suggested selectors for each element
  console.log('Interactive elements:');
  structure.tree.filter(el =>
    ['button','link','textbox','checkbox','combobox'].includes(el.role)
  ).forEach(el => console.log(`  ${el.role}: "${el.name}" → ${el.selector}`));

  // Scope to a specific section
  const formElements = await helpers.getPageStructure(page, {
    interactiveOnly: true,
    root: 'form'
  });
  console.log('Form inputs:', JSON.stringify(formElements.tree, null, 2));

  await browser.close();
})();
```

### Visual Inspection (look at a page)

Use when you need to **see** what a page looks like — before taking final screenshots, during exploration, after an action, or to verify a UI state. This is for your own understanding, not for output.

The pattern: take a temporary screenshot, then read it.

```javascript
// /tmp/playwright-test-inspect.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createContext(browser);
  const page = await context.newPage();
  await page.goto(`${TARGET_URL}/dashboard`, { waitUntil: 'networkidle' });

  // Take a quick screenshot to see the page
  await page.screenshot({ path: '/tmp/inspect.png' });

  // Inspect a specific section
  const section = page.locator('.settings-panel');
  await section.screenshot({ path: '/tmp/inspect-section.png' });

  await browser.close();
})();
```

After running the script, **read the image file** to see what the page looks like:

```
Read tool → /tmp/inspect.png
```

Claude renders PNG files visually, so you can see the actual page layout, content, popups, loading states, and any issues.

**When to use this vs `getPageStructure()`:**

| Need | Use |
|---|---|
| Find selectors, understand DOM hierarchy | `getPageStructure()` (text — faster, more precise) |
| See what the page actually looks like | Visual inspection (screenshot — layout, colors, overlays, rendering) |
| Both — unfamiliar page | Do both: structure first for selectors, then screenshot to see the visual result |

**Tip:** For iterative work (exploring a page, debugging a pre-script), use a persistent session so you don't relaunch the browser each time. The screenshot file gets overwritten on each run.

### Capture Screenshots for Documentation

Use when writing docs, help articles, or PR screenshots that need consistent, high-quality images of the running UI.

```javascript
// /tmp/playwright-test-doc-screenshot.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2, // Retina clarity
  });
  const page = await context.newPage();

  await page.goto(`${TARGET_URL}/settings`);
  await page.waitForLoadState('networkidle');

  // Crop to the relevant section — avoid full-page captures with empty space
  const section = page.locator('.api-keys-section');
  await section.screenshot({
    path: '/tmp/doc-settings-api-keys.png',
    type: 'png',
  });

  // Full-page fallback when you need the whole view
  await page.screenshot({
    path: '/tmp/doc-settings-full.png',
    type: 'png',
    fullPage: false, // Viewport-only — keep it tight
  });

  console.log('Doc screenshots saved to /tmp/doc-*.png');
  await browser.close();
})();
```

**Key settings for doc screenshots:**
- `viewport: { width: 1280, height: 720 }` — standard docs width
- `deviceScaleFactor: 2` — retina resolution for sharp text
- `type: 'png'` — lossless for UI screenshots
- Use `element.screenshot()` to crop to a specific panel instead of full-page
- Target <200KB per image — crop aggressively

### Media Asset Pipeline

Choose the right preset and conversion for your target. Presets set viewport + DPR automatically — no manual config needed.

| Target | Preset | Output | Max size | Why |
|---|---|---|---|---|
| Docs site screenshot | `docs-retina` | 2560×1440 PNG | <500 KB | Retina-sharp for Next.js Image |
| GitHub PR screenshot | `pr-standard` | 1280×720 PNG | <200 KB | Crisp at GitHub's 894px display width. Use `uploadToBunnyStorage()` for CDN URLs |
| GitHub PR GIF | `gif-compact` | 800×450 animated GIF | <10 MB | DPR 1 — GIF's 256-color palette is the bottleneck, not pixel density. Use `uploadToBunnyStorage()` for CDN URLs |
| Video (internal or customer-facing) | `video` | 2560×1440 WebM → Bunny or Vimeo | — | `uploadToBunny()` or `uploadToVimeo()` — both transcode to ABR. DPR 1 is correct for video (DPR only affects CSS rendering, not video output resolution) |

**Capture a docs-quality screenshot with a preset:**

```javascript
// /tmp/playwright-test-preset-screenshot.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Preset sets viewport 1280x720 + DPR 2 → 2560x1440 output
  const context = await helpers.createPresetContext(browser, 'docs-retina');
  const page = await context.newPage();

  await page.goto(`${TARGET_URL}/settings`);
  await page.waitForLoadState('networkidle');

  // Element-level crop for tight framing
  const section = page.locator('.api-keys-section');
  await section.screenshot({ path: '/tmp/doc-api-keys.png', type: 'png' });

  console.log('Docs screenshot: 2560x1440 Retina PNG');
  await browser.close();
})();
```

**Create a step-by-step GIF for a PR:**

```javascript
// /tmp/playwright-test-pr-gif.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  // gif-compact: 800x450 @ DPR 1 — optimized for GitHub's 10MB limit
  const context = await helpers.createPresetContext(browser, 'gif-compact');
  const page = await context.newPage();

  const frames = [];

  // Frame 1: Starting state
  await page.goto(`${TARGET_URL}/settings`);
  await page.waitForLoadState('networkidle');
  frames.push(await page.screenshot({ type: 'png' }));

  // Frame 2: Click action
  await page.click('button.save');
  await page.waitForTimeout(500);
  frames.push(await page.screenshot({ type: 'png' }));

  // Frame 3: Success state
  await page.waitForSelector('.success-toast');
  frames.push(await page.screenshot({ type: 'png' }));

  // Assemble GIF — 3 frames at 2fps = 1.5s loop
  const result = await helpers.screenshotsToGif(frames, '/tmp/pr-demo.gif', {
    width: 800, height: 450, fps: 2
  });

  console.log(`GIF: ${result.path} (${result.sizeMB} MB, ${result.frames} frames)`);
  await browser.close();
})();
```

**Annotated GIF with click indicators and step labels:**

```javascript
// /tmp/playwright-test-annotated-gif.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createPresetContext(browser, 'gif-compact');
  const page = await context.newPage();

  const frames = [];
  const annotations = [];

  // Frame 1: Navigate to page
  await page.goto(TARGET_URL);
  frames.push(await page.screenshot({ type: 'png' }));
  annotations.push({ label: 'Step 1: Open login page' });

  // Frame 2: Click username field
  await page.click('#username');
  frames.push(await page.screenshot({ type: 'png' }));
  annotations.push({ label: 'Step 2: Click username', click: { x: 640, y: 300 } });

  // Frame 3: Type credentials
  await page.fill('#username', 'admin');
  frames.push(await page.screenshot({ type: 'png' }));
  annotations.push({ label: 'Step 3: Enter username' });

  // Frame 4: Click submit
  await page.click('button[type="submit"]');
  frames.push(await page.screenshot({ type: 'png' }));
  annotations.push({ label: 'Step 4: Submit', click: { x: 640, y: 400 } });

  const result = await helpers.screenshotsToGif(frames, '/tmp/login-demo.gif', {
    width: 800, height: 450, fps: 2,
    annotations
  });

  console.log(`Annotated GIF: ${result.path} (${result.sizeMB} MB, ${result.frames} frames)`);
  await browser.close();
})();
```

### Run Accessibility Audit

Use when checking a page for WCAG violations.

```javascript
// /tmp/playwright-test-a11y.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  const audit = await helpers.runAccessibilityAudit(page);

  console.log(`Accessibility audit: ${audit.violationCount} violation(s), ${audit.passes} passes`);

  if (audit.violationCount > 0) {
    console.log('\nViolations:');
    audit.summary.forEach(v => {
      console.log(`  [${v.impact}] ${v.id}: ${v.description} (${v.nodes} element(s))`);
      console.log(`    Help: ${v.helpUrl}`);
    });
  }

  // Test keyboard focus order
  const focusOrder = await helpers.checkFocusOrder(page, [
    'a[href]:first-of-type',
    'nav a:nth-child(2)',
    'input[type="search"]'
  ]);
  focusOrder.forEach(f => {
    console.log(`  Tab ${f.step}: expected ${f.expectedSelector} -> ${f.matches ? 'PASS' : 'FAIL'}`);
  });

  await browser.close();
})();
```

### Handle Dialogs and Overlays

Use when pages have `alert()`/`confirm()`/`prompt()` dialogs or blocking overlays (cookie banners, modals) that prevent interaction.

```javascript
// /tmp/playwright-test-dialogs.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Auto-accept all dialogs (call BEFORE navigating)
  const dialogLog = helpers.handleDialogs(page);

  // Auto-dismiss cookie banners and common overlays
  await helpers.dismissOverlays(page);

  await page.goto(TARGET_URL);
  await page.click('button.delete'); // triggers confirm()

  // Check what dialogs appeared
  console.log('Dialogs captured:', dialogLog.dialogs.length);
  dialogLog.dialogs.forEach(d =>
    console.log(`  ${d.type}: "${d.message}"`)
  );

  // Custom overlay patterns (beyond the defaults)
  await helpers.dismissOverlays(page, [
    { locator: '.onboarding-modal .close-btn', action: 'click' },
    { locator: '.promo-popup', action: 'remove' }  // remove from DOM entirely
  ]);

  await browser.close();
})();
```

### Debug with Tracing

Use when a flow fails and you need to understand exactly what happened — DOM state, screenshots, network, and console at each step. Produces a `.zip` viewable in Playwright Trace Viewer.

```javascript
// /tmp/playwright-test-trace.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await helpers.createContext(browser);

  // Start tracing BEFORE creating pages
  await helpers.startTracing(context);

  const page = await context.newPage();
  await page.goto(TARGET_URL);
  await page.click('button.submit');
  await page.waitForSelector('.result');

  // Stop and save trace
  const trace = await helpers.stopTracing(context, '/tmp/trace.zip');
  console.log(`Trace saved: ${trace.path}`);
  console.log('View with: npx playwright show-trace /tmp/trace.zip');

  await browser.close();
})();
```

### Generate PDF

Use when you need a PDF export of a page — documentation, reports, or print-ready output. Chromium headless only.

```javascript
// /tmp/playwright-test-pdf.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001/report';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // Basic PDF
  const result = await helpers.generatePdf(page, '/tmp/report.pdf');
  console.log('PDF saved:', result.path);

  // Accessible PDF with bookmarks
  await helpers.generatePdf(page, '/tmp/report-accessible.pdf', {
    tagged: true,   // accessible/tagged PDF
    outline: true,  // document outline from headings
    format: 'Letter',
    margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' }
  });

  await browser.close();
})();
```

### Download Files

Use when a button or link triggers a file download and you need to save or inspect the file.

```javascript
// /tmp/playwright-test-download.js
const { chromium } = require('playwright');
const helpers = require('./lib/helpers');

const TARGET_URL = 'http://localhost:3001/exports';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(TARGET_URL);

  // Trigger download and save
  const file = await helpers.waitForDownload(
    page,
    () => page.click('#export-csv'),  // action that triggers the download
    '/tmp/export.csv'                   // optional save path
  );
  console.log(`Downloaded: ${file.suggestedFilename} → ${file.path}`);

  await browser.close();
})();
```

## Inline Execution (Simple Tasks)

For quick one-off tasks, you can execute code inline without creating files:

```bash
# Take a quick screenshot
cd $SKILL_DIR && node run.js "
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3001');
await page.screenshot({ path: '/tmp/quick-screenshot.png', fullPage: true });
console.log('Screenshot saved');
await browser.close();
"
```

**When to use inline vs files:**

- **Inline**: Quick one-off tasks (screenshot, check if element exists, get page title)
- **Files**: Complex tests, responsive design checks, anything user might want to re-run

## Session Mode (Persistent Browser) — Default

Session mode is the **recommended default** for all interactive browser automation. Start a session before running scripts — every subsequent script connects in ~50ms instead of launching a new browser (~2-3s), and login state persists automatically.

**Use session mode for:** All interactive work — debugging, testing, iterative flows, auth-heavy pages, video recording, multi-step automation. This covers the vast majority of agent use cases.

**Use headless (no session) only for:** True one-off scripts, CI/CD pipelines, or environments where a persistent daemon is inappropriate.

### Quick start

```bash
# Start a session (do this first)
cd $SKILL_DIR && node run.js --session start

# Run scripts — they auto-connect to the session
cd $SKILL_DIR && node run.js /tmp/my-script.js
# Cookies, localStorage, and current URL all persist between runs

# Check session status
cd $SKILL_DIR && node run.js --session status

# Stop when done
cd $SKILL_DIR && node run.js --session stop
```

### How it works

1. `--session start` launches a headless Chromium via Playwright's `launchServer()`
2. The browser runs as a background daemon (detached process)
3. Session info is written to `/tmp/playwright-session.json`
4. When you run a script, `run.js` auto-detects the session and connects via WebSocket
5. Your code gets pre-wired `browser`, `context`, and `page` variables
6. On script exit, cookies/localStorage/current URL are saved to `/tmp/playwright-session-state.json`
7. Next script reconnects and restores state — same auth, same URL, ready to continue

### What your code gets

In session mode, your code has these variables pre-defined:

| Variable | Description |
|---|---|
| `browser` | Connected browser instance (persists across runs) |
| `context` | Browser context with restored cookies/localStorage from previous run |
| `page` | Page navigated to the last URL from previous run (or blank on first run) |
| `saveState` | Call before exiting to persist cookies/localStorage/URL (called automatically by wrapper) |
| `helpers` | All helper functions from `lib/helpers` |
| `chromium`, `devices` | Playwright exports (for creating additional contexts) |

### Session mode vs headless (no session)

| | Session mode (default) | Headless — no session |
|---|---|---|
| Browser launch | Once (on `--session start`) | Every script execution |
| Startup time | ~50ms (WebSocket connect) | ~2-3s (browser launch) |
| Login state | Persists automatically (cookies/localStorage saved between runs) | Lost each run (use `saveAuthState`/`loadAuthState`) |
| Current URL | Restored from previous run | Starts at `about:blank` |
| `page.route()` | Full support | Full support |
| Token cost | Minimal (no launch/close boilerplate) | Higher (launch + close in every script) |
| Best for | **All interactive work** — debugging, testing, iterating, auth flows | CI/CD, isolated tests, one-off scripts |

### Options

```bash
# Start with headed browser (visible)
cd $SKILL_DIR && node run.js --session start --headless false

# Start with a resolution preset
cd $SKILL_DIR && node run.js --session start --preset video
```

### Auto-cleanup

- Session auto-stops after 10 minutes of inactivity (no scripts run)
- If the session process crashes, the next script detects the stale session and falls back to fresh headless mode
- The session file and state file are cleaned up automatically

### Creating fresh contexts in session mode

The default is to reuse the existing context (for state persistence). If you need a clean context:

```javascript
// Create an isolated context within the session
const freshContext = await browser.newContext();
const freshPage = await freshContext.newPage();
await freshPage.goto('https://example.com');
// This context has no cookies/localStorage from previous runs
```

## Available Helpers

All helpers live in `lib/helpers.js`. Use `const helpers = require('./lib/helpers');` in scripts. Organized by what you need to do:

### Page Interaction

| Helper | When to use |
|---|---|
| `helpers.detectDevServers()` | **CRITICAL — run first** for localhost testing. Returns array of detected server URLs. |
| `helpers.createContext(browser, options?)` | Create browser context with defaults: viewport 1280x720, locale en-US, timezone America/New_York. Pass `{ mobile: true }` for iPhone UA. Auto-merges env headers. |
| `helpers.waitForPageReady(page, options?)` | Smart wait for page load (`networkidle` by default). Pass `{ waitForSelector: '.loaded' }` for dynamic content. |
| `helpers.retryWithBackoff(fn, maxRetries?, initialDelay?)` | Retry an async function with exponential backoff. Default: 3 retries, 1s initial delay. |
| `helpers.safeClick(page, selector, { retries: 3 })` | Click elements that may not be immediately visible/clickable. Auto-retries. |
| `helpers.safeType(page, selector, text)` | Type into inputs. Clears field first by default. |
| `helpers.extractTexts(page, selector)` | Get text from multiple matching elements as array. |
| `helpers.scrollPage(page, 'down', 500)` | Scroll page. Directions: `'down'`, `'up'`, `'top'`, `'bottom'`. |
| `helpers.handleCookieBanner(page)` | Dismiss common cookie consent banners. Run early — clears overlays that block interaction. |
| `helpers.authenticate(page, { username, password })` | Login flow with common field selectors. Auto-waits for redirect. |
| `helpers.saveAuthState(context, path?, options?)` | Save login session after authenticating. Default path: `/tmp/playwright-auth.json`. Pass `{ indexedDB: true }` for Firebase/Supabase auth. Reuse with `loadAuthState`. |
| `helpers.loadAuthState(browser, path?, options?)` | Create a context with saved auth state. Skips re-login. Inherits `createContext` defaults. |
| `helpers.getPageStructure(page, { interactiveOnly, root })` | Discover page structure via ARIA snapshot. Returns `yaml` (raw hierarchy), `tree` (parsed with selectors), and `summary` (counts). Use for unfamiliar pages. |
| `helpers.handleDialogs(page, options?)` | Auto-handle `alert`/`confirm`/`prompt` dialogs. Call BEFORE navigating. Returns `{ dialogs }` for inspection after. |
| `helpers.dismissOverlays(page, overlays?)` | Auto-dismiss cookie banners, modals, and blocking overlays using `addLocatorHandler`. Pass custom patterns or use defaults. |
| `helpers.extractTableData(page, 'table.results')` | Extract structured data from HTML tables (headers + rows). |
| `helpers.takeScreenshot(page, 'name')` | Save timestamped screenshot. |

### Console Monitoring — catch silent JS errors

| Helper | When to use |
|---|---|
| `helpers.startConsoleCapture(page)` | **Call BEFORE navigating.** Returns a collector that accumulates all console output. |
| `helpers.getConsoleErrors(collector)` | Get only error-level messages and uncaught exceptions from collector. |
| `helpers.getConsoleLogs(collector, filter?)` | Get all logs, or filter by string/RegExp/function. |

**Lightweight alternative (Playwright v1.56+):** For quick checks without a collector, use `page.consoleMessages()` and `page.pageErrors()` after the fact — they return all messages/errors since page creation.

### Network Inspection — verify API calls during UI flows

| Helper | When to use |
|---|---|
| `helpers.startNetworkCapture(page, '/api/')` | **Call BEFORE navigating.** Captures request/response pairs. Optional URL filter. |
| `helpers.getFailedRequests(collector)` | Get 4xx, 5xx, and connection failures from collector. |
| `helpers.getCapturedRequests(collector)` | Get all captured request/response entries. |
| `helpers.waitForApiResponse(page, '/api/users', { status: 200 })` | Wait for a specific API call to complete. Returns `{ url, status, body, json }`. |

**Lightweight alternative (Playwright v1.56+):** `page.requests()` returns all requests since page creation — useful for quick post-hoc inspection without setting up a collector.

### Browser State — inspect storage and cookies

| Helper | When to use |
|---|---|
| `helpers.getLocalStorage(page)` | Get all localStorage entries. Pass a key for a single value. |
| `helpers.getSessionStorage(page)` | Get all sessionStorage entries. Pass a key for a single value. |
| `helpers.getCookies(context)` | Get all cookies from browser context. |
| `helpers.clearAllStorage(page)` | Clear localStorage + sessionStorage + cookies. Use for clean-state testing. |

### Video Recording — record browser interactions

| Helper | When to use |
|---|---|
| `helpers.createVideoContext(browser, { outputDir: '/tmp/videos' })` | Create a context that records video. Video saved when page/context closes. |
| `helpers.uploadToVimeo(filePath, { name, privacy })` | **Optional** — upload a local video (WebM/MP4) to Vimeo. Only when user asks. Requires `VIMEO_CLIENT_ID`, `VIMEO_CLIENT_SECRET`, `VIMEO_ACCESS_TOKEN` env vars. Returns `{ videoId, url, embedUrl }`. |
| `helpers.uploadToBunny(filePath, { name, collectionId })` | **Optional** — upload a local video (WebM/MP4) to Bunny Stream. For internal videos (team demos, QA recordings). Requires `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID` env vars. VP8 WebM explicitly supported. Returns `{ videoId, url, embedUrl }`. |

### Image/File Upload — Bunny Edge Storage

| Helper | When to use |
|---|---|
| `helpers.uploadToBunnyStorage(filePath, remotePath, { region })` | Upload any file (PNG, GIF, PDF) to Bunny Edge Storage and get a permanent CDN URL. Use for PR screenshots, annotated images, comparison PNGs. Requires `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_HOSTNAME` env vars. Returns `{ url, storagePath, size }`. |

### Resolution Presets — consistent dimensions per target

| Helper | When to use |
|---|---|
| `helpers.RESOLUTION_PRESETS` | Access preset configs. Keys: `docs-retina`, `pr-standard`, `gif-compact`. Each has `viewport` and `deviceScaleFactor`. |
| `helpers.createPresetContext(browser, 'preset')` | Create a context with preset viewport + DPR. Replaces manual viewport/DPR config. |

### Media Conversion — screenshots to GIF

| Helper | When to use |
|---|---|
| `helpers.screenshotsToGif(frames, path, opts)` | Convert PNG buffers to animated GIF. Options: `width`, `height`, `fps`, `quality`, `annotations` (per-frame click indicators + labels). |

### Accessibility — WCAG audits and keyboard navigation

| Helper | When to use |
|---|---|
| `helpers.runAccessibilityAudit(page)` | Inject axe-core and run WCAG 2.0 AA audit. Returns violations with impact/description. Requires internet (CDN). |
| `helpers.checkFocusOrder(page, ['#first', '#second', '#third'])` | Tab through elements and verify focus lands on expected selectors in order. |

### Performance Metrics — measure page speed

| Helper | When to use |
|---|---|
| `helpers.capturePerformanceMetrics(page)` | Capture Navigation Timing (TTFB, DOM interactive) and Web Vitals (FCP, LCP, CLS). Call after page load. |

### Responsive Screenshots — multi-viewport sweep

| Helper | When to use |
|---|---|
| `helpers.captureResponsiveScreenshots(page, url)` | Screenshot at mobile/tablet/desktop/wide breakpoints. Custom breakpoints and output dir optional. |

### Network Simulation — test degraded conditions

| Helper | When to use |
|---|---|
| `helpers.simulateSlowNetwork(page, 500)` | Add artificial latency (ms) to all requests. |
| `helpers.simulateOffline(context)` | Set browser to offline mode. |
| `helpers.blockResources(page, ['image', 'font'])` | Block specific resource types (image, font, stylesheet, script, etc.). |

**Simulating specific failures:** Use `route.abort('connectionrefused')` for targeted error simulation. Error types: `'connectionrefused'`, `'timedout'`, `'connectionreset'`, `'internetdisconnected'`.

### Tracing & Debugging

| Helper | When to use |
|---|---|
| `helpers.startTracing(context, options?)` | Start recording a trace (DOM snapshots, screenshots, network). Call before page interactions. |
| `helpers.stopTracing(context, path?)` | Stop tracing and save `.zip`. View with `npx playwright show-trace trace.zip`. |

### PDF Generation

| Helper | When to use |
|---|---|
| `helpers.generatePdf(page, path?, options?)` | Generate PDF from current page. Options: `format`, `tagged` (accessible), `outline` (bookmarks), `margin`. Chromium headless only. |

### File Downloads

| Helper | When to use |
|---|---|
| `helpers.waitForDownload(page, triggerAction, savePath?)` | Wait for a download triggered by an action, then save it. Returns `{ path, suggestedFilename, url }`. |

### Layout Inspection — verify element positioning

| Helper | When to use |
|---|---|
| `helpers.getElementBounds(page, '.selector')` | Get bounding box, visibility, viewport presence, and computed styles. Returns `null` for non-existent selectors, `{ visible: false }` for hidden elements. |

### Page Structure Internals — parse ARIA snapshots standalone

| Helper | When to use |
|---|---|
| `helpers.parseAriaSnapshot(yaml)` | Parse a Playwright ARIA snapshot YAML string into structured node objects. Each node has `role`, `name`, and optional `level`, `checked`, `disabled`, `expanded`, `selected`. |
| `helpers.suggestSelector(node)` | Generate a `getByRole(...)` selector string from a parsed ARIA node. |
| `helpers.INTERACTIVE_ROLES` | `Set` of interactive ARIA roles (button, link, textbox, checkbox, radio, combobox, slider, switch, tab, menuitem, searchbox, spinbutton, option). |

### Local Browser — connect to user's Chrome

These helpers live in `lib/local-browser.js`. Use `const { connectToLocalBrowser, getConnectedPage, extractAuthState } = require('./lib/local-browser');` in scripts. See `references/local-browser.md` for full docs.

| Helper | When to use |
|---|---|
| `connectToLocalBrowser(options?)` | Connect to user's running Chrome via extension bridge. Returns `{ browser, context, page, close() }`. Requires [Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) extension. Set `PLAYWRIGHT_MCP_EXTENSION_TOKEN` env var to bypass the approval dialog. |
| `getConnectedPage(context, url?)` | Get the page exposed by the extension and optionally navigate. Note: `context.newPage()` does NOT work via the extension bridge — use this or the `page` from `connectToLocalBrowser()`. |
| `extractAuthState(context, options?)` | Extract cookies + localStorage (+ IndexedDB with `{ indexedDB: true }`) from user's browser. Save to file with `{ path: '/tmp/auth.json' }` for later reuse via `helpers.loadAuthState()`. |

## Custom HTTP Headers

Configure custom headers for all HTTP requests via environment variables. Useful for:

- Identifying automated traffic to your backend
- Getting LLM-optimized responses (e.g., plain text errors instead of styled HTML)
- Adding authentication tokens globally

### Configuration

**Single header (common case):**

```bash
PW_HEADER_NAME=X-Automated-By PW_HEADER_VALUE=playwright-skill \
  cd $SKILL_DIR && node run.js /tmp/my-script.js
```

**Multiple headers (JSON format):**

```bash
PW_EXTRA_HEADERS='{"X-Automated-By":"playwright-skill","X-Debug":"true"}' \
  cd $SKILL_DIR && node run.js /tmp/my-script.js
```

### How It Works

Headers are automatically applied when using `helpers.createContext()`:

```javascript
const context = await helpers.createContext(browser);
const page = await context.newPage();
// All requests from this page include your custom headers
```

For scripts using raw Playwright API, use the injected `getContextOptionsWithHeaders()`:

```javascript
const context = await browser.newContext(
  getContextOptionsWithHeaders({ viewport: { width: 1920, height: 1080 } }),
);
```

## Advanced Usage

For comprehensive Playwright API documentation, see [API_REFERENCE.md](API_REFERENCE.md):

- Selectors & Locators best practices
- Network interception & API mocking
- Authentication & session management
- Visual regression testing
- Mobile device emulation
- Performance testing
- Debugging techniques
- CI/CD integration

## Tips

- **CRITICAL: Detect servers FIRST** - Always run `detectDevServers()` before writing test code for localhost testing
- **Custom headers** - Use `PW_HEADER_NAME`/`PW_HEADER_VALUE` env vars to identify automated traffic to your backend
- **Use /tmp for test files** - Write to `/tmp/playwright-test-*.js`, never to skill directory or user's project
- **Parameterize URLs** - Put detected/provided URL in a `TARGET_URL` constant at the top of every script
- **DEFAULT: Headless browser** - Always use `headless: true` for Docker/CI compatibility
- **Headed mode** - Use `headless: false` when user specifically requests visible browser or is debugging locally
- **Wait strategies:** Use `waitForURL`, `waitForSelector`, `waitForLoadState` instead of fixed timeouts
- **Error handling:** Always use try-catch for robust automation
- **Console output:** Use `console.log()` to track progress and show what's happening
- **Docker:** The `--no-sandbox` flag is included by default in helpers for container compatibility
- **Time manipulation (Playwright v1.45+):** Use `page.clock` to control time in tests — `await page.clock.install()` then `await page.clock.fastForward('01:00')` to advance, or `await page.clock.pauseAt(new Date('2025-01-01'))` to freeze at a specific moment. Useful for testing timers, countdowns, session expiry, and time-dependent UI.
- **WebSocket interception (Playwright v1.48+):** Use `page.routeWebSocket(url, handler)` to mock or monitor WebSocket connections. The handler receives a `WebSocketRoute` with `onMessage()`, `send()`, and `close()`. Useful for testing real-time features (chat, notifications, live updates) without a running server.

## Troubleshooting

**Playwright not installed:**

```bash
cd $SKILL_DIR && npm run setup
```

**Module not found:**
Ensure running from skill directory via `run.js` wrapper

**Browser doesn't launch in Docker:**
Ensure `--no-sandbox` and `--disable-setuid-sandbox` args are set (included by default in helpers)

**Element not found:**
Add wait: `await page.waitForSelector('.element', { timeout: 10000 })`
