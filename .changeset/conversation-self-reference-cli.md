---
"@inkeep/agents-cli": minor
---

Preserve `$`-prefixed template variables (`$conversation.*`, `$env.*`) through `pull-v4` round-trip. Previously, any variable other than `headers.*` fell through to `contextReference.toTemplate()` in `templates.ts`, silently rewriting `$`-prefixed variables on pull. Now `$`-prefixed variables pass through verbatim on pull → edit → push.

This also fixes a latent preservation bug for the existing `{{$env.*}}` variable.
