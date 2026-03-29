---
title: Work App Conceptual Model — Why They Exist
description: Deep analysis of what work apps are, why they're architecturally separate from API keys, and where overlap exists with proposed app credentials.
created: 2026-03-02
last-updated: 2026-03-02
---

## What Is a Work App?

A work app is a **bidirectional, workspace-scoped integration layer** that bridges external SaaS platforms with the agent infrastructure. It solves three problems that API keys don't:

1. **Discovery:** "Which Inkeep tenant/project/agent should handle this Slack message?" — resolved via hierarchical config (channel override → workspace default → prompt to configure)
2. **Identity linking:** "Is this Slack user an Inkeep user?" — via `workAppSlackUserMappings`
3. **Platform-native execution:** "Stream the agent response back into the Slack thread as formatted blocks" — bidirectional integration

**Confidence:** CONFIRMED (traced full Slack event → agent → response flow)

## Work App vs API Key — Fundamental Differences

| Dimension | API Key | Work App (Slack) |
|---|---|---|
| **Direction** | Client → API (unidirectional) | Platform ↔ API (bidirectional) |
| **Agent binding** | Static (1 key = 1 agent) | Dynamic (channel config → workspace default → unset) |
| **Identity** | Identifies the *customer project*, not the end-user | Two layers: workspace (tenant) + user (identity linking) |
| **Scoping** | Project + Agent | Tenant (workspace) + per-channel overrides |
| **Auth mechanism** | Hashed secret, bearer token | OAuth (Nango) + JWT (user tokens) |
| **User interaction** | None (programmatic) | Yes (linking prompts, modals, slash commands) |
| **Platform awareness** | None | Deep (blocks, threads, channels, reactions) |

**Confidence:** CONFIRMED (code analysis)

## Where Overlap Exists

Both API keys and work apps answer the same root question: **"How does something external connect to agents?"**

The conceptual layers of any external connection:
1. **Authentication:** How do we know this is a legitimate caller?
2. **Authorization:** Which agents/projects can this caller access?
3. **Identity:** Who is the end-user (if any)?
4. **Routing:** Which agent should handle this request?
5. **Integration:** How do we interact with the external platform?

| Layer | API Key | Work App (Slack) | App Credential (proposed) |
|---|---|---|---|
| Authentication | Hashed secret | OAuth workspace token | Hashed secret (API/web) or OAuth (Slack/Discord) |
| Authorization | Implicit (key → agent) | Channel/workspace config | Explicit allowlist (config) |
| Identity | None | User mapping table | Anonymous JWT or customer-signed JWT |
| Routing | Fixed (key = agent) | Hierarchical resolution | Client specifies from allowlist |
| Integration | None (generic HTTP) | Deep (Slack API, blocks, events) | Varies by type (none for API, deep for Slack) |

**The overlap is in layers 1-4. Layer 5 (integration) is where work apps diverge.**

## Why Work Apps Are Separate Tables

Slack has 3 tables:
- `workAppSlackWorkspaces` — workspace installation state (OAuth connection, tenant binding)
- `workAppSlackChannelAgentConfigs` — per-channel agent routing overrides
- `workAppSlackUserMappings` — Slack user → Inkeep user identity bridge

These are structurally different from what a web client or API credential needs. A web client doesn't have "channels" or "user mappings." The integration-specific state is genuinely different per platform.

**BUT:** The common concerns (which agents can this app access? is it enabled? what's its name?) are duplicated or missing:
- Slack stores `defaultAgentId` directly on the workspace
- GitHub stores repo access in separate tables
- API keys store a single `agentId`
- None of them have a unified "which agents can this app access" model

**Confidence:** CONFIRMED (schema analysis)

## Proposed Unified Model

An "App" is the shared base concept. Type-specific concerns extend it:

```
┌───────────────────────────────────────────────────┐
│                    APP (base)                       │
│  id, tenantId, projectId, name, type, enabled       │
│  allowedAgentIds, config (polymorphic JSONB)        │
├───────────────────────────────────────────────────┤
│ type = web_client     │ type = slack               │
│ - domains[]           │ - (base only — links to    │
│ - anonymousAccess     │   existing workspace       │
│ - authMode            │   tables via appId)        │
│ - hs256Secret ref     │                            │
│ - captchaEnabled      │                            │
├───────────────────────┤                            │
│ type = api            │ type = github              │
│ - (minimal config)    │ - (base only — links to    │
│                       │   existing installation    │
│ type = trigger        │   tables via appId)        │
│ - inputSchema         │                            │
│ - signingSecret ref   │ type = mcp                 │
│                       │ - toolAccess               │
└───────────────────────┴────────────────────────────┘
```

For Slack/GitHub: the App record is the unified base. The existing workspace/installation tables remain for integration-specific state, linked by `appId`.

For web_client/api/trigger/mcp: the App record + JSONB config is sufficient.

**Confidence:** INFERRED (architectural proposal, not verified against code)
