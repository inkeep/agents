---
title: API Key Surface Area Inventory
description: Every user-facing reference to "API key" in the codebase, categorized by surface and whether it mentions App Credentials.
created: 2026-03-03
last-updated: 2026-03-03
---

## Summary Counts

| Surface | Files referencing "API key" | Already mentions App Credentials? |
|---|---|---|
| Manage UI (API Keys page) | 10+ components | No |
| Manage UI (Ship modal) | 8 snippets | Yes (updated to INKEEP_APP_SECRET) |
| Manage UI (sidebar nav) | 2 files | No (both API Keys and Apps appear) |
| Documentation | 20+ pages | No |
| SDK (agents-sdk) | 5 files | No |
| SDK (ai-sdk-provider) | 2 files + README | No |
| CLI (agents-cli) | 3 files | No |
| MCP server | auto-generated | No |
| Cookbook/examples | 4 files | No |
| Environment variables | 4 distinct INKEEP_* vars | No |
| OpenAPI spec/routes | 1 route file + snapshot | No |
| Error messages | 2 in runAuth.ts | No |

## Highest-Impact Surfaces (ordered by user reach)

1. **Documentation** — concepts.mdx says "API keys are the recommended approach for production use"
2. **Chat component docs** — 12 pages all say "Use an API key for secure authentication in production"
3. **Sidebar nav** — API Keys appears as a top-level item
4. **ai-sdk-provider README** — `apiKey: <your-agent-api-key>`
5. **CLI reference** — `INKEEP_API_KEY` in config precedence
6. **Widget SDK property** — `apiKey: token` is a public API surface in `@inkeep/agents-ui`

**Confidence:** CONFIRMED (comprehensive grep across all packages)
