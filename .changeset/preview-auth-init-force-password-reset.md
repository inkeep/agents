---
"@inkeep/agents-core": patch
---

`pnpm db:auth:init` now respects `INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET=true` to re-sync an existing admin user's credential-account password from `INKEEP_AGENTS_MANAGE_UI_PASSWORD`. Default-off, so production / self-hosted re-runs of the script remain non-destructive — when the flag is unset the existing-user branch still skips the password update, preserving prior behavior.

The flag is intended for ephemeral CI environments (per-PR Railway preview) where the admin password secret may have rotated since the user was first created, leaving the stored hash mismatched against the current secret and causing sign-in 401s.
