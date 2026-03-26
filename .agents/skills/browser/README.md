# Playwright Browser Skill

Browser automation for Claude Code — navigate, screenshot, test, record, and upload.

## Setup

```bash
cd ~/.claude/plugins/marketplaces/inkeep-team-skills/plugins/eng/skills/browser
npm run setup   # installs deps + Chromium
```

## Environment Variables

Env vars are configured via Claude Code's `~/.claude/settings.json` `env` field — available in every session, from any directory, survives plugin updates.

**See [eng plugin README](../../README.md#quick-setup) step 5** for the one-liner setup command and credential guide.

### Optional env vars

| Variable | Purpose |
|---|---|
| `HEADLESS` | Set to `false` for visible browser (default: headless) |
| `SLOW_MO` | Delay in ms between actions (debugging) |
| `PW_HEADER_NAME` / `PW_HEADER_VALUE` | Custom HTTP header sent with every request |

## Video Upload Strategy

| Use case | Function | Platform | Why |
|---|---|---|---|
| Internal (team demos, QA recordings) | `uploadToBunny()` | Bunny Stream | Cheapest, explicit VP8/WebM support, JIT encoding, independent company |
| Customer-facing (docs, marketing) | `uploadToVimeo()` | Vimeo | Familiar platform, password-protected links, broad reach |

Both accept WebM directly — no local conversion needed.

## Usage

See [SKILL.md](SKILL.md) for full helper reference and code examples.

```bash
# Run a script
cd $SKILL_DIR && node run.js /tmp/playwright-test.js

# Quick inline
cd $SKILL_DIR && node run.js "
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000');
await page.screenshot({ path: '/tmp/screenshot.png' });
await browser.close();
"
```

## Local Browser Mode (User's Chrome)

Connect to the user's running Chrome instead of launching headless. Gives the agent access to the user's auth, cookies, extensions, and browsing state.

### Setup (one-time)

1. **Install the extension**: Open Chrome and install [Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) from the Chrome Web Store.

2. **Reload any Chrome tab** (Cmd+R / Ctrl+R). The extension needs a page reload after install to activate.

3. **Test the connection**:
   ```bash
   cd $SKILL_DIR && node run.js --connect "console.log('Connected:', await page.title())"
   ```
   A new Chrome tab will briefly open — this is the extension handshake. On first connection, you'll see an **approval dialog** in Chrome asking to allow the connection. Click **Allow**.

4. **Set the token** (optional, skips the approval dialog on future connections):
   - Click the Playwright MCP Bridge extension icon in Chrome's toolbar
   - Copy the token shown in the popup
   - Add to Claude Code settings (`~/.claude/settings.json` → `env`):
     ```
     "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "<your-token>"
     ```

**If you get `ERR_BLOCKED_BY_CLIENT`**: An ad blocker is blocking the extension URL. Temporarily disable it (uBlock Origin, Adblock Plus, etc.) or whitelist `chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm/*`.

### Usage

```bash
# Standalone connector
cd $SKILL_DIR && node scripts/connect-local.js /tmp/my-script.js

# Or via run.js with --connect flag
cd $SKILL_DIR && node run.js --connect /tmp/my-script.js

# Quick inline
cd $SKILL_DIR && node run.js --connect "console.log(await page.title())"
```

Scripts get pre-wired `browser`, `context`, `page`, `helpers`, `connectToLocalBrowser`, `getConnectedPage`, and `extractAuthState` variables.

### Extract auth for headless reuse

```bash
cd $SKILL_DIR && node run.js --connect "
await extractAuthState(context, { path: '/tmp/auth.json', indexedDB: true });
"
# Then use in headless: helpers.loadAuthState(browser, '/tmp/auth.json')
```

See [references/local-browser.md](references/local-browser.md) for the full routing table, limitations, and auth portability guide.
