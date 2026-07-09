---
'@inkeep/agents-core': patch
---

Fix `pnpm db:auth:init` failing when the haveIBeenPwned API is unreachable. The bootstrap script now skips the external password-compromise lookup (strength is still enforced locally by the password policy), and `setup-dev` fails fast in CI when auth initialization fails instead of continuing with a half-initialized environment.
