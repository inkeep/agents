---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Prefetch webhook destinations once per chat turn to eliminate redundant Doltgres branch-checkout queries during conversation execution
