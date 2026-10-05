---
"@inkeep/agents-manage-ui": patch
---

Raise the minimum `next` dependency to ^16.3.8 for the Next.js September 2026 security release, which fixes a server-side request forgery in image optimization for apps that set `images.remotePatterns`. Projects created with `@inkeep/create-agents` must also raise `pnpm.overrides.next` in their `package.json` to `^16.3.8`, because that override decides which `next` they install.
