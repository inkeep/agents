# Playwright Skill - Complete API Reference

This document contains the comprehensive Playwright API reference and advanced patterns. For quick-start execution patterns, see [SKILL.md](SKILL.md).

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Core Patterns](#core-patterns)
- [Selectors & Locators](#selectors--locators)
- [Common Actions](#common-actions)
- [Waiting Strategies](#waiting-strategies)
- [Assertions](#assertions)
- [Page Object Model](#page-object-model-pom)
- [Network & API Testing](#network--api-testing)
- [Authentication & Session Management](#authentication--session-management)
- [Visual Testing](#visual-testing)
- [Mobile Testing](#mobile-testing)
- [Debugging](#debugging)
- [Performance Testing](#performance-testing)
- [Parallel Execution](#parallel-execution)
- [Data-Driven Testing](#data-driven-testing)
- [Accessibility Testing](#accessibility-testing)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Common Patterns & Solutions](#common-patterns--solutions)
- [Troubleshooting](#troubleshooting)

## Installation & Setup

### Prerequisites

Before using this skill, ensure Playwright is available:

```bash
# Check if Playwright is installed
npm list playwright 2>/dev/null || echo "Playwright not installed"

# Install (if needed)
cd $SKILL_DIR
npm run setup
```

### Basic Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Core Patterns

### Basic Browser Automation

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  await page.goto('https://example.com', {
    waitUntil: 'networkidle'
  });

  // Your automation here

  await browser.close();
})();
```

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    const button = page.locator('button[data-testid="submit"]');
    await button.click();
    await expect(page).toHaveURL('/success');
    await expect(page.locator('.message')).toHaveText('Success!');
  });
});
```

## Selectors & Locators

### Best Practices for Selectors

```javascript
// PREFERRED: Data attributes (most stable)
await page.locator('[data-testid="submit-button"]').click();

// GOOD: Role-based selectors (accessible)
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');

// GOOD: Text content (for unique text)
await page.getByText('Sign in').click();

// OK: Semantic HTML
await page.locator('button[type="submit"]').click();
await page.locator('input[name="email"]').fill('test@test.com');

// AVOID: Classes and IDs (can change frequently)
// LAST RESORT: Complex CSS/XPath
```

### Advanced Locator Patterns

```javascript
// Filter and chain locators
const row = page.locator('tr').filter({ hasText: 'John Doe' });
await row.locator('button').click();

// Nth element
await page.locator('button').nth(2).click();

// Combining conditions
await page.locator('button').and(page.locator('[disabled]')).count();
```

## Common Actions

### Form Interactions

```javascript
// Text input
await page.getByLabel('Email').fill('user@example.com');
await page.getByPlaceholder('Enter your name').fill('John Doe');

// Checkbox / Radio
await page.getByLabel('I agree').check();
await page.getByLabel('Option 2').check();

// Select dropdown
await page.selectOption('select#country', 'usa');
await page.selectOption('select#country', { label: 'United States' });

// File upload
await page.setInputFiles('input[type="file"]', 'path/to/file.pdf');
```

### Mouse Actions

```javascript
await page.click('button');
await page.click('button', { button: 'right' });
await page.dblclick('button');
await page.hover('.menu-item');
await page.dragAndDrop('#source', '#target');
```

### Keyboard Actions

```javascript
await page.keyboard.type('Hello World', { delay: 100 });
await page.keyboard.press('Control+A');
await page.keyboard.press('Enter');
await page.keyboard.press('Tab');
```

## Waiting Strategies

### Smart Waiting

```javascript
// Wait for element states
await page.locator('button').waitFor({ state: 'visible' });
await page.locator('.spinner').waitFor({ state: 'hidden' });

// Wait for URL
await page.waitForURL('**/success');

// Wait for network
await page.waitForLoadState('networkidle');

// Wait for response
const responsePromise = page.waitForResponse('**/api/users');
await page.click('button#load-users');
const response = await responsePromise;

// Custom timeout
await page.locator('.slow-element').waitFor({
  state: 'visible',
  timeout: 10000
});
```

## Assertions

```javascript
import { expect } from '@playwright/test';

// Page assertions
await expect(page).toHaveTitle('My App');
await expect(page).toHaveURL(/.*dashboard/);

// Element visibility
await expect(page.locator('.message')).toBeVisible();
await expect(page.locator('button')).toBeEnabled();

// Text content
await expect(page.locator('h1')).toHaveText('Welcome');
await expect(page.locator('.message')).toContainText('success');

// Input values
await expect(page.locator('input')).toHaveValue('test@example.com');

// Count
await expect(page.locator('.item')).toHaveCount(5);
```

## Network & API Testing

### Intercepting Requests

```javascript
// Mock API responses
await page.route('**/api/users', route => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'John' }])
  });
});

// Block resources
await page.route('**/*.{png,jpg,jpeg,gif}', route => route.abort());
```

### Custom Headers via Environment Variables

The skill supports automatic header injection via environment variables:

```bash
# Single header (simple)
PW_HEADER_NAME=X-Automated-By PW_HEADER_VALUE=playwright-skill

# Multiple headers (JSON)
PW_EXTRA_HEADERS='{"X-Automated-By":"playwright-skill","X-Request-ID":"123"}'
```

These headers are automatically applied when using:
- `helpers.createContext(browser)` - headers merged automatically
- `getContextOptionsWithHeaders(options)` - utility injected by run.js wrapper

## Console Monitoring (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Start capturing before navigation
const consoleLogs = helpers.startConsoleCapture(page);

await page.goto(url);

// Get only errors (console.error + uncaught exceptions)
const errors = helpers.getConsoleErrors(consoleLogs);

// Filter logs by string, RegExp, or function
const apiLogs = helpers.getConsoleLogs(consoleLogs, /api/i);
const warningsOnly = helpers.getConsoleLogs(consoleLogs, e => e.type === 'warning');
```

## Network Capture (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Capture requests matching a URL pattern
const network = helpers.startNetworkCapture(page, '/api/');

await page.goto(url);

// Get failed requests (4xx, 5xx, connection failures)
const failed = helpers.getFailedRequests(network);

// Get all captured requests
const all = helpers.getCapturedRequests(network);
// Each entry: { url, method, status, statusText, resourceType, failure, timestamp }

// Wait for a specific API response
const resp = await helpers.waitForApiResponse(page, '/api/users', { status: 200, timeout: 5000 });
// Returns: { url, status, statusText, body, json }
```

## Browser State Inspection (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Read all localStorage
const allStorage = await helpers.getLocalStorage(page);

// Read a single key
const token = await helpers.getLocalStorage(page, 'auth_token');

// Session storage
const session = await helpers.getSessionStorage(page);

// Cookies (requires context, not page)
const cookies = await helpers.getCookies(page.context());

// Clear everything
await helpers.clearAllStorage(page);
```

## Video Recording (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Create context with video recording
const context = await helpers.createVideoContext(browser, {
  outputDir: '/tmp/videos',
  videoSize: { width: 1280, height: 720 }
});
const page = await context.newPage();

// ... perform actions ...

// Video saved on close
const videoPath = await page.video().path();
await page.close();
```

## Accessibility Testing (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Run axe-core WCAG 2.0 AA audit (injects from CDN)
const audit = await helpers.runAccessibilityAudit(page);
// audit.violations - full violation details
// audit.summary - compact: [{ id, impact, description, helpUrl, nodes }]
// audit.violationCount, audit.passes

// Custom tags/rules
const audit2 = await helpers.runAccessibilityAudit(page, {
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  context: '#main-content'
});

// Keyboard focus order verification
const focus = await helpers.checkFocusOrder(page, [
  '#search-input',
  '#nav-home',
  '#nav-about'
]);
// Returns: [{ step, expectedSelector, actualElement, matches }]
```

## Performance Metrics (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Capture after page load
await page.goto(url, { waitUntil: 'networkidle' });
const perf = await helpers.capturePerformanceMetrics(page);

// perf.timing: { dns, tcp, ttfb, download, domInteractive, domComplete, loadEvent }
// perf.vitals: { fcp, lcp, cls }
```

## Network Simulation (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Slow network (500ms delay per request)
await helpers.simulateSlowNetwork(page, 500);

// Offline mode
await helpers.simulateOffline(page.context());

// Block images and fonts
await helpers.blockResources(page, ['image', 'font']);
```

**Composability note:** `simulateSlowNetwork` and `blockResources` use `route.fallback()`, so they compose with other `page.route()` handlers. You can mock API routes and add slow network simulation on the same page — the slow network handler delays, then falls through to your mock handler.

## Layout Inspection (via helpers)

```javascript
const helpers = require('./lib/helpers');

const bounds = await helpers.getElementBounds(page, '.hero-banner');
// Returns null for non-existent selectors
// Returns { visible: false, ... } for display:none / visibility:hidden / opacity:0 elements
// Returns { x, y, width, height, visible, inViewport, computedStyles: { display, visibility, opacity, position, zIndex, overflow } }
```

## Page Structure Discovery (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Get the full accessibility tree with suggested selectors
const structure = await helpers.getPageStructure(page);
// structure.yaml  — raw ARIA snapshot YAML (preserves hierarchy)
// structure.tree  — parsed array of { role, name, selector, level?, checked?, disabled?, expanded?, selected? }
// structure.summary — { total, interactive, headings, links, buttons, inputs }

// Only interactive elements (buttons, links, inputs, etc.)
const interactive = await helpers.getPageStructure(page, { interactiveOnly: true });

// Scope to a specific section
const form = await helpers.getPageStructure(page, { root: '#login-form' });

// Parse ARIA snapshots standalone
const nodes = helpers.parseAriaSnapshot(yamlString);
// Each node: { role, name, indent, level?, checked?, disabled?, expanded?, selected? }

// Generate a selector from a parsed node
const sel = helpers.suggestSelector(nodes[0]);
// e.g., "getByRole('button', { name: 'Submit' })"

// INTERACTIVE_ROLES — Set of interactive ARIA roles
// button, link, textbox, checkbox, radio, combobox, slider, switch, tab, menuitem, searchbox, spinbutton, option
```

## Dialog Handling (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Auto-accept all dialogs (alert, confirm, prompt, beforeunload)
const captured = helpers.handleDialogs(page);
// ... navigate and interact ...
console.log(captured.dialogs);
// [{ type: 'alert', message: '...', defaultValue: '', timestamp: ... }]

// Auto-dismiss dialogs
helpers.handleDialogs(page, { accept: false });

// Provide text for prompt() dialogs
helpers.handleDialogs(page, { promptText: 'my answer' });

// Custom handler — return true to skip default handling
helpers.handleDialogs(page, {
  onDialog: async (dialog) => {
    if (dialog.type() === 'confirm') {
      await dialog.dismiss();
      return true; // handled — skip default
    }
  }
});
```

## Overlay Dismissal (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Auto-dismiss cookie banners and consent popups (broad default patterns)
await helpers.dismissOverlays(page);

// Custom overlay patterns
await helpers.dismissOverlays(page, [
  { locator: '.onboarding-modal', action: 'click', clickTarget: '.close-btn' },
  { locator: '#promo-banner', action: 'remove' }  // removes from DOM
]);
```

**Note:** Default patterns are intentionally broad and may match non-overlay buttons (e.g., "Accept Invitation"). Pass custom overlays for production flows.

## Tracing (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Start a trace (records DOM snapshots, screenshots, network, console)
await helpers.startTracing(context);
// With options:
await helpers.startTracing(context, { screenshots: true, snapshots: true, sources: false });

// ... perform actions ...

// Stop and save
const { path } = await helpers.stopTracing(context, '/tmp/my-trace.zip');
// View with: npx playwright show-trace /tmp/my-trace.zip
```

## PDF Generation (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Generate PDF from current page (Chromium headless only)
const { path } = await helpers.generatePdf(page, '/tmp/page.pdf');

// With options
const { path: p } = await helpers.generatePdf(page, '/tmp/page.pdf', {
  format: 'Letter',       // A4, Letter, Legal, etc.
  tagged: true,            // accessible PDF
  outline: true,           // bookmarks from headings
  printBackground: true,   // include background graphics
  margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
});
```

## File Download (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Wait for a download triggered by a click
const download = await helpers.waitForDownload(page, () => page.click('#download-btn'));
// { path: '/tmp/report.csv', suggestedFilename: 'report.csv', url: 'https://...' }

// Save to a specific path
const download2 = await helpers.waitForDownload(
  page,
  () => page.click('#export-btn'),
  '/tmp/my-export.xlsx'
);
```

## Responsive Screenshots (via helpers)

```javascript
const helpers = require('./lib/helpers');

// Default breakpoints: mobile, tablet, desktop, wide
const results = await helpers.captureResponsiveScreenshots(page, url);

// Custom breakpoints
const results2 = await helpers.captureResponsiveScreenshots(page, url, [
  { name: 'small', width: 320, height: 568 },
  { name: 'medium', width: 768, height: 1024 }
], '/tmp/my-screenshots');
```

## Visual Testing

```javascript
// Full page screenshot
await page.screenshot({ path: 'screenshot.png', fullPage: true });

// Element screenshot
await page.locator('.chart').screenshot({ path: 'chart.png' });
```

## Mobile Testing

```javascript
const { devices } = require('playwright');
const iPhone = devices['iPhone 12'];

const context = await browser.newContext({
  ...iPhone,
  locale: 'en-US',
  permissions: ['geolocation'],
  geolocation: { latitude: 37.7749, longitude: -122.4194 }
});
```

## Debugging

```bash
# Run with inspector
npx playwright test --debug

# Headed mode
npx playwright test --headed
```

```javascript
// Pause execution
await page.pause();

// Console logs
page.on('console', msg => console.log('Browser log:', msg.text()));
page.on('pageerror', error => console.log('Page error:', error));
```

## Performance Testing

```javascript
const startTime = Date.now();
await page.goto('https://example.com');
const loadTime = Date.now() - startTime;
console.log(`Page loaded in ${loadTime}ms`);
```

## Common Patterns & Solutions

### Handling Popups

```javascript
const [popup] = await Promise.all([
  page.waitForEvent('popup'),
  page.click('button.open-popup')
]);
await popup.waitForLoadState();
```

### File Downloads

```javascript
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('button.download')
]);
await download.saveAs(`./downloads/${download.suggestedFilename()}`);
```

### iFrames

```javascript
const frame = page.frameLocator('#my-iframe');
await frame.locator('button').click();
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Playwright Tests
on:
  push:
    branches: [main, master]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      - name: Run tests
        run: npx playwright test
```

## Best Practices

1. **Selector Strategy** - Prefer data-testid attributes, use role-based selectors
2. **Waiting** - Use Playwright's auto-waiting, avoid hard-coded delays
3. **Error Handling** - Add proper error messages, take screenshots on failure
4. **Performance** - Run tests in parallel, reuse authentication state
5. **Docker** - Always include `--no-sandbox` and `--disable-setuid-sandbox` args

## Troubleshooting

1. **Element not found** - Check if element is in iframe, verify visibility
2. **Timeout errors** - Increase timeout, check network conditions
3. **Flaky tests** - Use proper waiting strategies, mock external dependencies
4. **Docker failures** - Ensure `--no-sandbox` flag and all dependencies installed
