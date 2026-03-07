---
title: API Keys vs App Credentials Feature Comparison
description: Side-by-side comparison of the two auth mechanisms for the run API, traced from source code.
created: 2026-03-03
last-updated: 2026-03-03
---

## Feature Matrix

| Capability | API Keys | App Credentials (web_client) | App Credentials (api) |
|---|---|---|---|
| **Scoping** | 1 tenant + 1 project + 1 agent | 1 tenant + 1 project + N agents (configurable) | Same as web_client |
| **Agent access** | Fixed to 1 agent | `agentAccessMode: all\|selected`, allowedAgentIds, defaultAgentId | Same |
| **Origin/domain validation** | None | `allowedDomains` with exact/wildcard/universal matching | None (server-to-server) |
| **End-user identity** | None | `endUserId` from JWT `sub` claim | None |
| **End-user conversation history** | None | Yes, via `/run/v1/conversations` scoped by userId | None |
| **Anonymous session JWTs** | None | Server-issued HS256 JWTs with configurable lifetime (60s-7d) | N/A |
| **Customer JWT (BYOJ)** | None | HS256 shared secret, customer signs their own JWTs | N/A |
| **Auth modes** | Single mode (key validation) | 3 modes: anonymous_only, anonymous+authenticated, authenticated_only | Single mode (secret validation) |
| **Enable/disable toggle** | No (only expiration) | `enabled` field for instant revocation | Same |
| **Captcha/PoW** | No | `captchaEnabled` flag | No |
| **Key format** | `sk_<publicId>.<secret>` | App ID: `app_<publicId>`, JWT token for auth | `as_<publicId>.<secret>` |
| **Secret shown once** | Yes | Yes (for api type) | Yes |
| **Expiration** | Optional per-key | JWT-level (configurable lifetime) | None on secret |
| **lastUsedAt tracking** | Every request | 10% sampled | 10% sampled |

**Confidence:** CONFIRMED (all traced from source code)

## Auth Middleware Routing

When `X-Inkeep-App-Id` header is present: exclusively uses app credential auth (no fallback).
When absent: falls through: temp JWT -> bypass -> Slack JWT -> **API key** -> team agent token.

The two systems are **mutually exclusive per request** — a request uses one or the other, never both.

**Confidence:** CONFIRMED (runAuth.ts lines 688-693)

## Where Each Is Used Today

### API Keys are used by:
1. **SDK** (`agents-sdk`): `Project.setConfig(apiKey)` for manage API auth
2. **CLI** (`agents-cli`): `INKEEP_API_KEY` env var, profile credentials, `X-API-Key` header in CI mode
3. **ai-sdk-provider**: `apiKey` parameter in Vercel AI SDK integration
4. **Chat components**: 12+ doc pages recommend `INKEEP_API_KEY` / `NEXT_PUBLIC_INKEEP_API_KEY`
5. **Playground**: temp JWT token (not a traditional API key, but follows the same auth path)
6. **MCP server**: all tool operations use Bearer auth with API key
7. **A2A documentation**: "Standard API Key recommended"

### App Credentials are used by:
1. **Ship modal**: Chat UI code snippets show anonymous session flow
2. **Widget SDK**: `@inkeep/agents-ui` components accept `apiKey: token` (using session JWT)
3. **Apps management page**: Full CRUD UI

**Confidence:** CONFIRMED (inventory from codebase search)

## Key Overlap

The **only functional overlap** is when an `api` type app credential is used for server-to-server auth — this provides similar functionality to a traditional API key, but with multi-agent access control.

For **web client** use cases (chat widgets), app credentials are strictly superior — they add origin validation, end-user identity, and session management that API keys cannot provide.

For **SDK/CLI/CI** use cases, API keys are the established mechanism and app credentials have no current integration.
