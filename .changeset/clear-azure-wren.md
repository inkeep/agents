---
"@inkeep/agents-core": minor
"@inkeep/agents-sdk": minor
"@inkeep/agents-manage-api": minor
"@inkeep/agents-run-api": minor
"@inkeep/agents-manage-ui": minor
"@inkeep/agents-cli": minor
---

Simplify trigger authentication to use arbitrary header key-value pairs with hashed secrets

Breaking change: Trigger authentication now uses a flexible headers array format instead of the previous discriminated union (api_key, basic_auth, bearer_token, none). Run `pnpm db:migrate:cleanup-old-triggers` to remove incompatible triggers before deploying.
