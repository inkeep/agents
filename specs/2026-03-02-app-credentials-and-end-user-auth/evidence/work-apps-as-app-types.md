---
title: Work Apps as App Credential Types
description: Analysis of how existing Slack/GitHub integrations map to the proposed polymorphic app credential model.
created: 2026-03-02
last-updated: 2026-03-02
---

## Current Work App Architecture

### Slack
- **Config storage:** `workAppSlackWorkspaces` (runtime DB) — workspace-level
- **Per-channel config:** `workAppSlackChannelAgentConfigs` — agent routing per channel
- **User mapping:** `workAppSlackUserMappings` — Slack user ↔ Inkeep user
- **OAuth tokens:** Stored in Nango, referenced by `nangoConnectionId`
- **Auth in runAuth.ts:** Separate `trySlackUserJwtAuth()` path (priority 3)

### GitHub
- **Config storage:** `workAppGitHubInstallations` (runtime DB)
- **Repo access:** `workAppGitHubProjectRepositoryAccess` + access mode tables
- **Auth:** GitHub App JWT + installation tokens, webhook signature verification
- **Not in runAuth.ts directly** — uses separate webhook/MCP auth paths

### Tools with `isWorkApp: true`
**File:** `packages/agents-core/src/db/manage/manage-schema.ts:461`
- Tools table has `isWorkApp` boolean — marks tools as work-app-managed
- These tools are created/managed by work app integrations, not directly by users

## Mapping to App Credential Types

| Current Concept | Proposed App Type | Auth Model | Config Shape |
|---|---|---|---|
| API Key (agent-scoped) | `api` | Bearer token (hashed secret) | Rate limits, expiration |
| API Key (widget use) | `web_client` | Bearer token + end-user JWT | Domains, anon allowed, agents, captcha |
| Slack workspace | `slack` | Slack OAuth + Nango | Workspace ID, default agent, channel configs |
| GitHub installation | `github` | GitHub App JWT | Installation ID, repo access |
| Triggers | `trigger` | Webhook signature | Input schema, signing secret |
| (New) Discord | `discord` | Discord OAuth | Guild/channel config |
| (New) MCP | `mcp` | Bearer token | Tool access, capabilities |
| (New) Support Copilot | `support_copilot` | Customer JWT | User context, ticket linking |

## Key Tension: Subsume vs. Reference

**Option 1: Subsume work apps into app credentials**
- Move Slack/GitHub config INTO the polymorphic app credential table
- Pro: Single model for all external access
- Con: Slack/GitHub configs are complex and workspace-scoped, not project-scoped. API keys are project-scoped. Forcing them into one table creates awkward scoping.

**Option 2: App credentials reference work apps**
- App credential is a new table that covers API/web/trigger/MCP/support copilot
- Slack and GitHub remain separate, linked via a common "app" abstraction
- Pro: Respects existing complexity. Migration is safer.
- Con: Two systems to manage.

**Option 3: App credential is the auth/access layer; work app config stays separate**
- Every work app gets an app credential for auth purposes
- Work-app-specific config (channels, repos, OAuth) stays in existing tables
- The app credential handles: which agents, rate limits, domain restrictions
- Pro: Clean separation of concerns (auth/access vs. integration config)
- Con: Need to link app credential ↔ work app config

**Analysis:** Option 3 seems most natural. The app credential answers "who can access what and how?" The work app config answers "how does this integration work?" These are orthogonal.

**Confidence:** INFERRED (architectural judgment based on current patterns)

## Scoping Issue: API Keys are Agent-Scoped, But Should App Credentials Be Project-Scoped?

Current API keys: `(tenantId, projectId, agentId)` — one key per agent.
Proposed: App credential should access *multiple* agents within a project.

This is a scope change. The current Slack model already does this — `defaultAgentId` is the default, but channel configs can point to different agents. The app credential model should likely be **project-scoped** with an explicit list of allowed agent IDs.

**Confidence:** INFERRED (design judgment — the user explicitly asked for multi-agent access per credential)
