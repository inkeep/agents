---
"@inkeep/agents-cli": patch
---

Fix CLI global install reliability across all package managers:

- **Lazy-load all heavy imports** — `@inkeep/agents-core`, command implementations, env loading, and instrumentation are now deferred until a command actually runs. This makes `inkeep --version`, `--help`, and `update` work instantly even when the dependency tree has resolution issues (e.g. pnpm's zod v3/v4 mismatch).
- **Add `#!/usr/bin/env node` shebang** — the CLI entry point now includes a Node.js shebang so that `npm install -g` creates a directly executable `inkeep` binary instead of an unusable symlink.
