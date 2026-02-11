---
name: pr-screenshots
description: "Capture, annotate, and include screenshots in pull requests for UI changes. Use when creating or updating PRs that touch agents-manage-ui components/pages, agents-docs content, or any web-facing surface. Also use when asked to add before/after screenshots, visual diffs, preview deployment links, or enrich PR descriptions. Triggers on: PR screenshots, before/after, visual diff, PR description, preview deployment, capture screenshot, PR images, enrich PR."
---

# PR Screenshots

Capture, redact, annotate, and embed screenshots in GitHub PRs for UI changes.

## When to use

- Creating/updating PRs touching `agents-manage-ui/src/components/**`, `agents-manage-ui/src/app/**`, or `agents-docs/content/**`
- User asks for screenshots, before/after comparisons, or PR body enrichment
- Skip for backend-only, test-only, or non-visual changes

## Workflow

1. **Identify affected routes** from the diff — see [affected-routes.md](references/affected-routes.md)
2. **Capture screenshots** — run `scripts/capture.ts`
3. **Validate no sensitive data** — run `scripts/validate-sensitive.ts`
4. **Annotate** — run `scripts/annotate.ts` (labels, borders, side-by-side)
5. **Upload & embed** — update PR body with images and preview links

---

## Step 1: Identify Affected Pages

Analyze the diff to determine which UI routes are impacted. Use the mapping in [references/affected-routes.md](references/affected-routes.md).

Example: changes to `components/agent/sidepane/nodes/model-selector.tsx` affect the **agent editor** at `/{tenantId}/projects/{projectId}/agents/{agentId}`.

If the diff only touches backend code, tests, or non-visual files, skip screenshot capture.

---

## Step 2: Capture Screenshots

### Environment setup

| Environment | Base URL | How to start |
|---|---|---|
| **Local dev** | `http://localhost:3000` | `cd agents-manage-ui && pnpm dev` |
| **Vercel preview** | `https://agents-git-{branch}-inkeep.vercel.app` | Automatic on PR push |
| **Playwright server** | Connect via `--connect ws://localhost:3001` | See "Reusable server" below |

### Capture command

```bash
# Local dev
npx tsx .cursor/skills/pr-screenshots/scripts/capture.ts \
  --base-url http://localhost:3000 \
  --routes "/{tenantId}/projects/{projectId}/agents/{agentId}" \
  --output-dir ./pr-screenshots

# Vercel preview
npx tsx .cursor/skills/pr-screenshots/scripts/capture.ts \
  --base-url https://agents-git-my-branch-inkeep.vercel.app \
  --routes "/{tenantId}/projects/{projectId}/agents/{agentId}" \
  --output-dir ./pr-screenshots

# With Playwright server (reuses browser across captures)
npx tsx .cursor/skills/pr-screenshots/scripts/capture.ts \
  --connect ws://localhost:3001 \
  --base-url http://localhost:3000 \
  --routes "/t1/projects/p1/agents/a1,/t1/projects/p1/settings" \
  --output-dir ./pr-screenshots
```

### All capture options

| Option | Default | Description |
|---|---|---|
| `--base-url <url>` | *required* | Target URL (local dev or preview) |
| `--routes <paths>` | *required* | Comma-separated route paths |
| `--output-dir <dir>` | `./pr-screenshots` | Where to save PNGs and DOM text |
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
npx tsx .cursor/skills/pr-screenshots/scripts/capture.ts --serve --port 3001

# Terminal 2+: connect and capture
npx tsx .cursor/skills/pr-screenshots/scripts/capture.ts \
  --connect ws://localhost:3001 --base-url http://localhost:3000 \
  --routes "/..." --output-dir ./pr-screenshots
```

### Using browser-use subagent (Cursor alternative)

When scripts are unavailable, use the `browser-use` subagent:
1. Navigate to the target URL
2. Call `browser_screenshot` to capture
3. Download the image for annotation

---

## Step 3: Validate Sensitive Data

**Always run before uploading to GitHub.**

```bash
npx tsx .cursor/skills/pr-screenshots/scripts/validate-sensitive.ts \
  --dir ./pr-screenshots
```

The script checks `.dom-text.txt` files (saved by capture) for:
- API keys (`sk-`, `ik_`, `sk-ant-`, `AKIA`, `sk_live_`)
- Tokens (Bearer, JWT, GitHub PATs)
- PEM private keys
- Connection strings with credentials
- Email addresses

Exit code 1 = sensitive data found. Re-capture with additional `--mask-selectors` or fix the source before proceeding.

### Pre-capture masking (automatic)

The capture script automatically masks these before taking screenshots:

| Selector | What it catches |
|---|---|
| `input[type="password"]` | Password fields |
| `input[name="apiKeyToSet"]` | Credential API key inputs |
| `input[data-field="value"]` | Header value inputs (GenericKeyValueInput) |
| `[role="alertdialog"] pre` | API key display dialogs |
| Text matching `sk-`, `ik_`, `Bearer`, `eyJ`, `ghp_`, PEM headers | In-page tokens/keys |

Add more with `--mask-selectors "selector1,selector2"`.

### What to check manually

- Screenshots of the **credentials** page (`/credentials/**`)
- Screenshots of the **API keys** page (`/api-keys`)
- Any page where users enter secrets (trigger auth headers, MCP server config)

---

## Step 4: Annotate Images

```bash
# Add "Before" label with red border
npx tsx .cursor/skills/pr-screenshots/scripts/annotate.ts \
  --input before.png --label "Before" --border "#ef4444" --output before-labeled.png

# Add "After" label with green border
npx tsx .cursor/skills/pr-screenshots/scripts/annotate.ts \
  --input after.png --label "After" --border "#22c55e" --output after-labeled.png

# Side-by-side comparison
npx tsx .cursor/skills/pr-screenshots/scripts/annotate.ts \
  --stitch before.png after.png --labels "Before,After" --output comparison.png
```

---

## Step 5: Upload & Embed in PR

### Upload images to GitHub

Images in PR markdown need permanent URLs. Use one of:

**Option A — PR comment with image** (simplest):
```bash
# GitHub renders attached images with permanent CDN URLs
gh pr comment {pr-number} --body "![Before](./pr-screenshots/before-labeled.png)"
```

**Option B — Update PR body directly**:
```bash
gh pr edit {pr-number} --body "$(cat pr-body.md)"
```

### PR body templates

Use the templates in [references/pr-templates.md](references/pr-templates.md) for consistent formatting. Include:

1. **Visual Changes** section with before/after screenshots
2. **Test URLs** section with links to preview deployment pages
3. **Summary** of what changed and why

### Generating preview URLs

Pattern: `https://agents-git-{branch}-inkeep.vercel.app/{tenantId}/projects/{projectId}/...`

Replace `{branch}` with the PR branch name (hyphens, not slashes). Use the affected-routes mapping to build the full paths.

---

## Dependencies

These scripts require packages available in the monorepo:

| Package | Source | Notes |
|---|---|---|
| `playwright` | `agents-manage-ui` workspace dep | Browser automation |
| `sharp` | Root dev dep | Image annotation |
| `tsx` | Used in root scripts | TypeScript runner |

If `sharp` is not installed: `pnpm add -Dw sharp`

---

## Additional Resources

- [references/affected-routes.md](references/affected-routes.md) — File path → UI route mapping
- [references/pr-templates.md](references/pr-templates.md) — PR body markdown templates
