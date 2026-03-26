---
name: screengrabs
description: "Capture, annotate, and include screenshots in pull requests for UI changes. Use when creating or updating PRs that touch frontend components, pages, or any web-facing surface. Also use when asked to add before/after screenshots, visual diffs, or enrich PR descriptions. Triggers on: PR screenshots, before/after, visual diff, PR description, capture screenshot, PR images, enrich PR."
license: MIT
metadata:
  author: "inkeep"
  version: "1.2"
---

# Screengrabs

Capture, redact, annotate, and embed screenshots in GitHub PRs for UI changes.

## When to use

- Creating/updating PRs that touch frontend components, pages, or styles
- User asks for screenshots, before/after comparisons, or PR body enrichment
- Skip for backend-only, test-only, or non-visual changes

## Prerequisites

These scripts require the following npm packages. Install them as dev dependencies in your project:

| Package | Purpose | Install |
|---|---|---|
| `playwright` | Browser automation for screenshot capture | `npm add -D playwright` |
| `sharp` | Image annotation (labels, borders, stitching) | `npm add -D sharp` |
| `tsx` | TypeScript runner for scripts | `npm add -D tsx` |

After installing Playwright, download browser binaries: `npx playwright install chromium`

## Workflow

Most screenshots require understanding the target page before capture — what state it's in, what popups appear, what content needs to be visible. The default workflow is **explore → capture → verify → iterate**.

1. **Identify affected pages** from the PR diff
2. **Explore target pages** — visit each page with the browser to understand layout, state, and interaction needs before writing any capture logic
3. **Plan & write pre-scripts** — based on what you observed, write pre-scripts for interaction needed before capture
4. **Capture screenshots** — run `scripts/capture.ts` with `--pre-script`
5. **Verify captures** — look at each captured image to confirm it shows what was expected
6. **Iterate if needed** — if a capture is wrong (spinner, overlay, wrong state, missing content), adjust and re-capture
7. **Validate no sensitive data** — run `scripts/validate-sensitive.ts`
8. **Annotate** — run `scripts/annotate.ts` (labels, borders, side-by-side)
9. **Upload & embed** — update PR body with images

**Simple captures (no interaction needed):** For static pages where goto + wait is sufficient, skip step 3 and omit `--pre-script`. Steps 2 (explore) and 5 (verify) still apply — always understand what you're capturing and confirm you got it right.

---

## Step 1: Identify Affected Pages

Analyze the PR diff to determine which UI routes are impacted. Map changed component/page files to their corresponding URLs. If the diff only touches backend code, tests, or non-visual files, skip screenshot capture.

---

## Step 2: Explore Target Pages

**Before writing any pre-scripts or capture commands**, visit each target page to understand what you're capturing. Load `/browser` skill and use its **Visual Inspection** pattern — navigate to each route, take a temporary screenshot, and read it to see what the page looks like.

### What to observe

For each page, note:

- **Current layout and content** — what's visible above the fold, key sections, data states
- **Popups and overlays** — cookie banners, modals, onboarding tours, notification prompts
- **Loading behavior** — spinners, skeleton screens, lazy-loaded content, how long until stable
- **Auth requirements** — login walls, permission gates, session-dependent content
- **Dynamic state** — tabs, accordions, expandable sections, content that requires interaction to reveal
- **What the PR changed** — which specific elements or areas the screenshot needs to highlight

### Decide what to capture

Based on exploration, decide:

- Which **view states** each page needs (e.g., default tab vs. specific tab, collapsed vs. expanded)
- Whether **multiple captures per route** are needed (e.g., before/after a user action)
- What **viewport and scroll position** will frame the relevant change
- What **interaction** is needed before each capture (popups to dismiss, elements to click, sections to scroll to)

Do not proceed to pre-script writing until you understand each page's behavior. Exploration often reveals interaction needs that aren't obvious from the diff alone (popups that appear on first visit, content behind tabs, lazy loading delays).

---

## Step 3: Plan & Write Pre-Scripts

Load `/browser` skill for writing pre-scripts. A pre-script is a JS file that receives the Playwright `page` object and runs interaction before masking + screenshot. Use your findings from Step 2 to write targeted pre-scripts.

### Pre-script contract

The file must export an async function that receives `{ page, url, route }`:

```javascript
// /tmp/pw-pre-dashboard.js
module.exports = async function({ page, url, route }) {
  // Dismiss cookie banner
  await page.click('button:has-text("Accept")').catch(() => {});

  // Click the "Analytics" tab
  await page.click('[data-tab="analytics"]');
  await page.waitForTimeout(500);
};
```

### Common pre-script patterns

**Dismiss popups / modals:**
```javascript
module.exports = async function({ page }) {
  // Cookie banner
  await page.click('button:has-text("Accept all")').catch(() => {});
  // Marketing popup
  await page.click('[data-testid="close-modal"]').catch(() => {});
};
```

**Navigate through a login flow:**
```javascript
module.exports = async function({ page }) {
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
};
```

**Scroll to a specific section:**
```javascript
module.exports = async function({ page }) {
  await page.locator('#pricing-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
};
```

**Expand collapsed content:**
```javascript
module.exports = async function({ page }) {
  await page.click('button:has-text("Show more")');
  await page.waitForSelector('.expanded-content', { state: 'visible' });
};
```

**One pre-script per route** — if routes need different interaction, write separate scripts and run capture once per route. If all routes share the same interaction (e.g., dismiss the same cookie banner), one script covers all.

---

## Step 4: Capture Screenshots

### Environment setup

| Environment | Base URL | Notes |
|---|---|---|
| **Local dev** | `http://localhost:3000` (or your dev server port) | Start your dev server first |
| **Preview deployment** | Your preview URL (e.g., Vercel, Netlify, etc.) | Available after PR push |
| **Playwright server** | Connect via `--connect ws://localhost:3001` | See "Reusable server" below |

### Capture command

```bash
# With pre-script (default for most captures)
npx tsx scripts/capture.ts \
  --base-url http://localhost:3000 \
  --routes "/dashboard,/settings" \
  --pre-script /tmp/pw-pre-dashboard.js \
  --output-dir tmp/screengrabs

# Simple capture (no interaction needed)
npx tsx scripts/capture.ts \
  --base-url http://localhost:3000 \
  --routes "/landing,/about" \
  --output-dir tmp/screengrabs

# Preview deployment with pre-script
npx tsx scripts/capture.ts \
  --base-url https://your-preview-url.example.com \
  --routes "/dashboard" \
  --pre-script /tmp/pw-pre-dismiss-popups.js \
  --output-dir tmp/screengrabs
```

### All capture options

| Option | Default | Description |
|---|---|---|
| `--base-url <url>` | *required* | Target URL (local dev or preview) |
| `--routes <paths>` | *required* | Comma-separated route paths |
| `--pre-script <path>` | — | JS file to run on page before capture (for interaction) |
| `--output-dir <dir>` | `tmp/screengrabs` | Where to save PNGs and DOM text |
| `--viewport <WxH>` | `1280x800` | Browser viewport size |
| `--connect <ws-url>` | — | Connect to existing Playwright server |
| `--mask-selectors <s>` | — | Additional CSS selectors to blur |
| `--wait <ms>` | `2000` | Wait after page load before capture |
| `--full-page` | `false` | Capture full scrollable page |
| `--auth-cookie <value>` | — | Session cookie for authenticated pages |

### Reusable Playwright server

Start a server once, reuse across multiple captures:

```bash
# Terminal 1: start server
npx tsx scripts/capture.ts --serve --port 3001

# Terminal 2+: connect and capture
npx tsx scripts/capture.ts \
  --connect ws://localhost:3001 --base-url http://localhost:3000 \
  --routes "/..." --pre-script /tmp/pw-pre-script.js --output-dir tmp/screengrabs
```

---

## Step 5: Verify Captures

**Do not skip this step.** After capturing, look at each screenshot to confirm it captured what you intended.

### Verification checklist

For each captured image, read the PNG file and check:

- [ ] **Correct page/route** — the screenshot shows the intended page, not a redirect, error page, or login wall
- [ ] **Expected content visible** — the elements or sections that the PR changed are visible in the frame
- [ ] **Stable state** — no spinners, skeleton loaders, or partially-rendered content
- [ ] **No unexpected overlays** — cookie banners, modals, notification toasts, or tooltips aren't blocking the content
- [ ] **Proper framing** — the viewport and scroll position highlight the relevant change (not cut off, not too zoomed out)
- [ ] **Redaction intact** — sensitive data masking was applied correctly (passwords blurred, tokens replaced)

### How to verify

Use the Read tool to view each captured PNG — it renders images visually. Compare what you see against what you observed during exploration (Step 2).

```
# Read the captured image to verify
Read tool → tmp/screengrabs/<route-name>.png
```

If all captures pass verification, proceed to Step 7 (validate sensitive data). If any capture is wrong, go to Step 6.

---

## Step 6: Iterate (if verification fails)

When a capture doesn't match expectations, diagnose and re-capture. Do not upload incorrect screenshots.

### Common issues and fixes

| Problem | Likely cause | Fix |
|---|---|---|
| Spinner or skeleton visible | Insufficient wait time | Increase `--wait` (e.g., `--wait 5000`) or add `waitForSelector` in pre-script |
| Cookie banner or modal blocking content | Pre-script didn't dismiss it | Add dismiss logic to pre-script (`.catch(() => {})` for optional popups) |
| Wrong tab or section visible | Pre-script didn't navigate to correct state | Update pre-script to click the right tab/accordion/section |
| Login wall or auth error | Missing auth cookie or expired session | Use `--auth-cookie` or add login flow to pre-script |
| Content cut off or wrong scroll position | Default viewport insufficient | Adjust `--viewport`, add `scrollIntoViewIfNeeded()` in pre-script, or use `--full-page` |
| Partially loaded images or assets | Network still loading | Add `waitForLoadState('networkidle')` in pre-script after interaction |

### Iteration process

1. Identify which captures failed verification and why
2. Adjust the pre-script, capture parameters, or both
3. Re-run `scripts/capture.ts` for the affected routes only
4. Re-verify (Step 5) — read the new images and confirm they're correct
5. Repeat if needed — maximum **3 iterations per route** before stopping to reassess the approach

### When to stop iterating

- After 3 failed attempts for the same route, reconsider whether the page is in a capturable state (is the dev server running correctly? is the feature complete?)
- If the issue is environmental (server not running, deployment not ready), fix the environment rather than adjusting capture parameters

---

## Step 7: Validate Sensitive Data

**Always run before uploading to GitHub.**

```bash
npx tsx scripts/validate-sensitive.ts \
  --dir ./screengrabs
```

The script checks `.dom-text.txt` files (saved by capture) for:
- API keys (`sk-`, `sk-ant-`, `AKIA`, `sk_live_`)
- Tokens (Bearer, JWT, GitHub PATs)
- PEM private keys
- Connection strings with credentials

Exit code 1 = sensitive data found. Re-capture with additional `--mask-selectors` or fix the source before proceeding.

### Pre-capture masking (automatic)

The capture script automatically masks these before taking screenshots:

| Selector / Pattern | What it catches |
|---|---|
| `input[type="password"]` | Password fields |
| Text matching `sk-`, `Bearer`, `eyJ`, `ghp_`, PEM headers | In-page tokens/keys |

Add more with `--mask-selectors "selector1,selector2"`.

---

## Step 8: Annotate Images

```bash
# Add "Before" label with red border
npx tsx scripts/annotate.ts \
  --input before.png --label "Before" --border "#ef4444" --output before-labeled.png

# Add "After" label with green border
npx tsx scripts/annotate.ts \
  --input after.png --label "After" --border "#22c55e" --output after-labeled.png

# Side-by-side comparison
npx tsx scripts/annotate.ts \
  --stitch before.png after.png --labels "Before,After" --output comparison.png
```

---

## Step 9: Upload & Embed in PR

Images in PR markdown need permanent URLs.

**Primary: Bunny Edge Storage** (programmatic, permanent CDN URLs):

```javascript
const helpers = require('./lib/helpers');
const result = await helpers.uploadToBunnyStorage(
  './tmp/screengrabs/dashboard-labeled.png',
  `pr-${prNumber}/dashboard-before.png`
);
// result.url → "https://{cdn-hostname}/pr-123/dashboard-before.png" (permanent)
```

Requires `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_HOSTNAME` env vars. Set up with `./secrets/setup.sh --skill screengrabs` (see [secrets/secrets.json](../../../../secrets/secrets.json)).

**Fallback: GitHub drag-and-drop** — drag images into the PR description editor on GitHub. GitHub generates permanent CDN URLs automatically.

### Update PR body

```bash
gh pr edit {pr-number} --body "$(cat pr-body.md)"
```

### PR body templates

Use the templates in [references/pr-templates.md](references/pr-templates.md) for consistent formatting. Include:

1. **Visual Changes** section with before/after screenshots
2. **Test URLs** section with links to preview deployment pages
3. **Summary** of what changed and why

---

## Additional Resources

- [references/pr-templates.md](references/pr-templates.md) — PR body markdown templates
