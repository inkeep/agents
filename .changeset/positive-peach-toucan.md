---
"@inkeep/agents-sdk": patch
"@inkeep/agents-cli": patch
---

Require zod ^4.6.7, the version Better Auth 1.7.16 needs, so Inkeep packages share one zod. Schemas that relied on zod 4.3 treating `z.unknown()` and `z.any()` object keys as optional now mark those keys `.optional()` explicitly, so validation behavior is unchanged.
