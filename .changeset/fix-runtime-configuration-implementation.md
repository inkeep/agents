---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-api": patch
"@inkeep/agents-run-api": patch
---

Fix runtime configuration implementation to properly apply environment variable overrides

This change fixes a critical bug where runtime configuration environment variables were parsed but never actually used by the runtime execution code. The fix includes:

1. **Core Changes (agents-core)**:
   - Removed `getEnvNumber()` helper function
   - Bundled all 56 runtime constants into a `runtimeConsts` export object for cleaner imports
   - Constants now use plain default values instead of reading from `process.env` directly

2. **Environment Parsing (manage-api & run-api)**:
   - Updated env.ts files to import `runtimeConsts` instead of individual constants
   - Added missing `AGENTS_VALIDATION_PAGINATION_DEFAULT_LIMIT` to manage-api parsing
   - Both APIs now properly parse environment variables and create `runtimeConfig` objects

3. **Runtime Implementation (run-api)**:
   - Updated 10+ runtime files to import `runtimeConfig` from `../env` instead of from `@inkeep/agents-core`
   - Fixed files include: Agent.ts, ToolSessionManager.ts, relationTools.ts, a2a/client.ts, AgentSession.ts, stream-helpers.ts, IncrementalStreamParser.ts, conversations.ts
   - Environment variable overrides now properly affect runtime behavior

**Impact**: Environment variables documented in `.env.example` files now actually work. Users can configure runtime limits, timeouts, and other behavior via environment variables as intended.
