---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Fix Doltgres error logging to surface root cause details, redact SQL bind params, and re-throw auto-commit failures to prevent silent data loss
