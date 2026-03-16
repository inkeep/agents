---
name: slack-manifest
description: "Guide for modifying the Slack app manifest — adding/removing bot scopes, event subscriptions, slash commands, shortcuts, or OAuth config. Ensures single-source-of-truth via slack-app-manifest.json. Triggers on: slack scope, bot scope, slack manifest, slack permission, add slack scope, remove slack scope, slack event subscription, slash command, slack OAuth, slack-app-manifest."
---

# Slack App Manifest — Single Source of Truth

All Slack app configuration lives in one file. Every other file derives from it automatically. Never hardcode scopes, events, or commands elsewhere.

---

## Source of Truth

```
packages/agents-work-apps/src/slack/slack-app-manifest.json   ← EDIT HERE
  │
  ├── slack-scopes.ts       ← exports BOT_SCOPES / BOT_SCOPES_CSV (imported by oauth.ts)
  └── setup-slack-dev.ts    ← reads manifest at runtime (local dev app setup)
```

---

## Adding or Removing Bot Scopes

### Steps

1. **Edit the manifest** — add/remove the scope in `oauth_config.scopes.bot`:

   ```
   packages/agents-work-apps/src/slack/slack-app-manifest.json
   ```

2. **No other code changes needed** — `slack-scopes.ts` re-exports at import time; `setup-slack-dev.ts` reads the manifest at runtime. `oauth.ts` imports `BOT_SCOPES_CSV` from `slack-scopes.ts`.

3. **Production Slack app** — must be updated manually at https://api.slack.com/apps → OAuth & Permissions. The manifest is a template (contains `<YOUR_API_DOMAIN>` placeholders) and is not auto-synced to production.

4. **Local dev apps** — re-run `pnpm setup-slack-dev`. The script detects scope drift automatically and triggers OAuth re-install if scopes changed.

5. **Changeset** — create one for `agents-work-apps`:
   ```bash
   pnpm bump patch --pkg agents-work-apps "Add <scope-name> bot scope for <feature>"
   ```

### Do NOT

- Hardcode scopes in `oauth.ts`, `setup-slack-dev.ts`, or anywhere else
- Add scopes only to the manifest without updating the production Slack app
- Remove scopes used by active features without checking event handlers and API calls

---

## Modifying Event Subscriptions

Edit `settings.event_subscriptions.bot_events` in the manifest:

```json
"event_subscriptions": {
  "request_url": "https://<YOUR_API_DOMAIN>/work-apps/slack/events",
  "bot_events": ["app_mention", "message.channels", "message.groups", "message.im"]
}
```

After adding an event type, ensure the event dispatcher (`dispatcher.ts`) handles it.

---

## Modifying Slash Commands

Edit `features.slash_commands` in the manifest. The dev setup script auto-renames the command to `/inkeep-<devId>` for local dev apps.

---

## Modifying Shortcuts

Edit `features.shortcuts` in the manifest.

---

## Key Files

| File | Role |
|------|------|
| `slack-app-manifest.json` | Single source of truth for all Slack app config |
| `slack-scopes.ts` | Exports `BOT_SCOPES` and `BOT_SCOPES_CSV` from the manifest |
| `routes/oauth.ts` | Uses `BOT_SCOPES_CSV` for OAuth install flow |
| `scripts/setup-slack-dev.ts` | Reads manifest directly; detects drift on re-run |
| `dispatcher.ts` | Routes incoming Slack events to handlers |

---

## Inspecting Current Scopes

```bash
node -e "console.log(require('./packages/agents-work-apps/src/slack/slack-app-manifest.json').oauth_config.scopes.bot.join('\n'))"
```

---

## Template Placeholders

The manifest uses `<YOUR_API_DOMAIN>` as a placeholder in URLs. This is intentional — it keeps the manifest portable across environments:

- **Production**: Replace with your deployed API domain
- **Local dev**: `setup-slack-dev.ts` handles this automatically (uses Socket Mode, removes URL fields)
