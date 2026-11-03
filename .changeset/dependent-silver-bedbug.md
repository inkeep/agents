---
"@inkeep/agents-manage-ui": patch
---

Raise the minimum `next` dependency to ^16.4.3, which fixes two unauthenticated remote code execution vulnerabilities in Next.js (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) as well as the September 2026 image optimization SSRF. Projects created with `@inkeep/create-agents` should raise `pnpm.overrides.next` in their `package.json` to `^16.4.3`.
