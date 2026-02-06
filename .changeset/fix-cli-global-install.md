---
"@inkeep/agents-cli": patch
---

Add `#!/usr/bin/env node` shebang to the CLI entry point so that `npm install -g` creates a directly executable `inkeep` binary. Previously, npm global installs symlinked to `dist/index.js` which lacked a shebang, causing the shell to interpret JavaScript as shell commands.
