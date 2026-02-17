---
name: product-surface-areas
description: |
  Consolidated dependency graph of Inkeep customer-facing surface areas (UIs, CLIs, SDKs, APIs, protocols, config formats). Example use: as a prd-time (planning/brainstorming phase) or post-change checklist to understand the full scope of side-effects or what making one change to the product means for the rest. Use whenever you need to understand the "ripple" out effects of any change.
---

# Inkeep Product Surface Area Inventory

## Overview
This is a consolidated inventory of customer-facing “surface areas”: anything a customer can directly use, interact with, or take a dependency on. Use it to conceptually understand the surface area of what one change may mean for the whole product (i.e. the entire feature dependency tree/propagation chain end-to-end).

## Summary

| Category | Count |
|---|---|
| APIs & Customer-facing Data Contracts | 13 |
| SDKs & Libraries | 2 |
| CLI Tools | 2 |
| MCP Servers & Endpoints | 7 |
| Management UI (Visual Builder & Dashboard) | 16 |
| Chat Experiences | 3 |
| Observability UI | 5 |
| Evaluations UI | 6 |
| Templates & Scaffolding | 2 |
| Deployment Interfaces | 3 |
| Documentation & Content | 4 |
| **Total** | **63** |

## Surface Catalog

### APIs & Customer-facing Data Contracts
Customer goal: integrate with, automate, or depend on platform contracts programmatically.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Management API** | REST endpoints at `/manage/...` for configuration/CRUD operations. | Database Schemas (internal) | `agents-api/src/domains/manage/routes/` |
| **Run API (OpenAI Chat Completions)** | OpenAI-compatible chat completions endpoint: `POST /run/v1/chat/completions` (SSE streaming). | Database Schemas (internal) | `agents-api/src/domains/run/routes/chat.ts` |
| **Chat API (Vercel AI SDK Data Stream)** | Vercel AI SDK data stream endpoint: `POST /run/api/chat`. | Database Schemas (internal) | `agents-api/src/domains/run/routes/chatDataStream.ts` |
| **A2A Protocol** | Agent-to-agent JSON-RPC 2.0 interface at `/agents/a2a`. | Database Schemas (internal) | `agents-api/src/domains/run/a2a/` |
| **Agent Discovery** | A2A agent card discovery: `GET /.well-known/agent.json`. | A2A Protocol | `agents-api/src/domains/run/routes/agents.ts` |
| **MCP Protocol** | MCP JSON-RPC 2.0 interface (hosted endpoint referenced in transcript as `POST /v1/mcp`). | Database Schemas (internal) | `agents-api/src/domains/run/routes/mcp.ts` |
| **Webhook Format (Trigger Invocation)** | Trigger invocation request/response contract for event-driven agent runs. | Management API, Run API (OpenAI Chat Completions) | `agents-api/src/domains/run/routes/webhooks.ts` |
| **OAuth Routes** | OAuth flow routes for tool OAuth configuration (transcript: `/manage/oauth/*`). | Management API | `agents-api/src/domains/manage/routes/oauth.ts` |
| **OpenAPI Docs** | Hosted API documentation: `/docs` and `/openapi.json`. | Management API, Run API (OpenAI Chat Completions), Chat API (Vercel AI SDK Data Stream) | `agents-api/src/index.ts` |
| **OpenTelemetry Schema** | Span names and attribute keys used for tracing/observability. | — | `packages/agents-core/src/constants/otel-attributes.ts` |
| **`inkeep.config.ts` format** | TypeScript project configuration structure consumed by CLI. | — | `agents-cli/src/config.ts` |
| **Environment Variables** | Required env var names and expected formats used across services. | — | `agents-api/src/env.ts`, `packages/agents-core/src/env.ts` |
| **Shared Types (`@inkeep/agents-core` exports)** | Exported types/utilities used across SDK/UI/CLI (customer dependency via npm). | — | `packages/agents-core/src/index.ts`, `packages/agents-core/src/client-exports.ts` |

### SDKs & Libraries
Customer goal: build against Inkeep in code via packaged libraries.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **TypeScript SDK (`@inkeep/agents-sdk`)** | Builder APIs for defining agents/projects/tools/components. | Management API, Run API (OpenAI Chat Completions), Shared Types (`@inkeep/agents-core` exports) | `packages/agents-sdk/src/` (entry: `index.ts`) |
| **Vercel AI SDK Provider (`@inkeep/ai-sdk-provider`)** | Provider integration for Vercel AI SDK (`useChat`, data stream). | Chat API (Vercel AI SDK Data Stream) | `packages/ai-sdk-provider/src/` (entry: `index.ts`) |

### CLI Tools
Customer goal: manage and sync projects from the terminal.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Inkeep CLI (`inkeep` / `agents-cli`)** | Command-line workflows: `init`, `push`, `pull`, `add`, `dev`, `login`. | TypeScript SDK (`@inkeep/agents-sdk`), Management API, `inkeep.config.ts` format | `agents-cli/src/` (entry: `index.ts`, commands: `commands/`) |
| **Create-Agents CLI (`@inkeep/create-agents`)** | Scaffolding CLI to bootstrap a project from the template. | Create-Agents Template | `packages/create-agents/src/` |

### MCP Servers & Endpoints
Customer goal: connect MCP clients to Inkeep capabilities via servers/endpoints and examples.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Unified MCP Server (`@inkeep/agents-mcp`)** | Standalone MCP server package wrapping multiple APIs (manage, run, evals). | MCP Protocol, Management API, Run API (OpenAI Chat Completions) | `packages/agents-mcp/src/` |
| **Unified MCP Endpoint (`/mcp`)** | Hosted unified MCP server endpoint. | Unified MCP Server (`@inkeep/agents-mcp`) | `agents-api/src/domains/mcp/routes/mcp.ts` |
| **Runtime MCP Endpoint (`/run/v1/mcp`)** | Hosted runtime MCP endpoint for per-agent chat MCP. | MCP Protocol | `agents-api/src/domains/run/routes/mcp.ts` |
| **GitHub MCP Server (`/work-apps/github/mcp`)** | Hosted MCP surface for GitHub operations. | MCP Protocol, GitHub Integration | `packages/agents-work-apps/src/github/mcp/` |
| **MCP Templates** | Example MCP integrations (Slack, Zendesk, Vercel template). | MCP Protocol | `agents-cookbook/template-mcps/` |

### Management UI (Visual Builder & Dashboard)
Customer goal: configure agents, projects, tools, and org settings through the web app.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Login Page** | Manage UI authentication entry point (email/password, OAuth, SSO). | — | `agents-manage-ui/src/app/login/` |
| **Device Auth Page** | Device authorization flow used by CLI login. | — | `agents-manage-ui/src/app/device/` |
| **Visual Agent Builder** | Drag-and-drop agent configuration UI. | Management API, Shared Types (`@inkeep/agents-core` exports) | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/agents/[agentId]/` |
| **Projects Dashboard** | Project list and creation UI. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/page.tsx` |
| **Team Members** | Roles and permissions management UI. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/members/` |
| **API Keys** | API key creation and management UI. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/api-keys/` |
| **Organization Settings** | Tenant/org settings UI. | Management API | `agents-manage-ui/src/app/[tenantId]/settings/` |
| **GitHub Integration** | UI to connect/configure the GitHub work app. | Management API | `agents-manage-ui/src/app/[tenantId]/work-apps/github/` |
| **MCP Tools UI** | UI for configuring MCP servers. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/mcp-servers/` |
| **Function Tools UI** | UI for inline/function tool configuration. | Management API | `agents-manage-ui/src/components/agent/sidepane/nodes/function-tool-node-editor.tsx` |
| **Credentials UI** | UI for secrets and OAuth credential management. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/credentials/` |
| **Data Components UI** | UI for structured output schemas (data components). | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/components/` |
| **Artifacts UI** | UI for artifact component schemas. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/artifacts/` |
| **External Agents UI** | UI for configuring third-party agent connections. | Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/external-agents/` |
| **Triggers UI** | UI for webhook trigger configuration. | Management API | `agents-manage-ui/src/app/.../triggers/` |
| **Trigger Invocations UI** | UI for trigger execution history. | Management API | `agents-manage-ui/src/app/.../triggers/[triggerId]/invocations/` |

### Chat Experiences
Customer goal: talk to agents (and, for Copilot, edit/build agents) via chat interfaces.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Chat Widget** | Embeddable chat components for end-user chat. | Chat API (Vercel AI SDK Data Stream) | `agents-ui/src/` |
| **Playground (“Try it”)** | In-dashboard agent testing chat panel with optional debug/traces. | Chat API (Vercel AI SDK Data Stream), Management API, OpenTelemetry Schema | `agents-manage-ui/src/components/agent/playground/`, `agents-api/src/domains/manage/routes/playgroundToken.ts` |
| **Chat-to-Edit (Copilot)** | "Build/Edit with AI" chat-driven agent creation/modification experience in the builder. | Chat API (Vercel AI SDK Data Stream), Unified MCP Server (`@inkeep/agents-mcp`), Management API | `agents-manage-ui/src/components/agent/copilot/`, `agents-manage-ui/src/contexts/copilot.tsx` |

### Observability UI
Customer goal: understand what agents did and why (traces, analytics, debugging).

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Traces Dashboard** | Conversation analytics, charts, filters. | OpenTelemetry Schema, Management API | `agents-manage-ui/src/app/[tenantId]/projects/[projectId]/traces/page.tsx` |
| **Conversation Inspector** | Message-level drilldown for a conversation trace. | OpenTelemetry Schema | `agents-manage-ui/src/app/.../traces/conversations/[conversationId]/` |
| **AI Calls View** | Trace view for LLM calls (prompts/responses, token usage). | OpenTelemetry Schema | `agents-manage-ui/src/app/.../traces/ai-calls/` |
| **Tool Calls View** | Trace view for tool execution inputs/outputs and timing. | OpenTelemetry Schema | `agents-manage-ui/src/app/.../traces/tool-calls/` |
| **Stats Dashboard** | Usage analytics (tokens, calls). | OpenTelemetry Schema, Management API | `agents-manage-ui/src/app/[tenantId]/stats/` |

### Evaluations UI
Customer goal: test, score, and track agent quality over time.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Datasets UI** | UI for managing evaluation datasets/test cases. | Management API | `agents-manage-ui/src/app/.../datasets/` |
| **Dataset Runs UI** | UI for viewing dataset execution results. | Management API | `agents-manage-ui/src/app/.../datasets/[datasetId]/runs/[runId]/` |
| **Evaluators UI** | UI for configuring evaluators/scoring functions. | Management API | `agents-manage-ui/src/app/.../evaluations/` |
| **Evaluation Jobs UI** | UI for running evaluations and monitoring execution. | Management API, Run API (OpenAI Chat Completions) | `agents-manage-ui/src/app/.../evaluations/jobs/[configId]/` |
| **Run Configs UI** | UI for configuring automated evaluation runs. | Management API | `agents-manage-ui/src/app/.../evaluations/run-configs/[configId]/` |
| **Evaluation Results UI** | UI for results visualization and metrics. | Management API | `agents-manage-ui/src/components/evaluation-jobs/` |

### Templates & Scaffolding
Customer goal: bootstrap new projects and learn patterns via working examples.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Create-Agents Template** | Template files used by Create-Agents CLI scaffolding. | TypeScript SDK (`@inkeep/agents-sdk`), Environment Variables | `create-agents-template/` |
| **Cookbook Templates** | Reference implementations / template projects. | TypeScript SDK (`@inkeep/agents-sdk`) | `agents-cookbook/template-projects/` |

### Deployment Interfaces
Customer goal: run the system reliably in dev/prod environments.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Docker Images** | Self-hosted container images and compose-based deployment artifacts. | Environment Variables | `create-agents-template/Dockerfile.*` |
| **Inkeep Cloud** | Managed hosting surface (push config, platform runs it). | Environment Variables | — (external service) |
| **Health Endpoints** | Operational probes: `/health`, `/ready`. | — | `agents-api/src/routes/healthChecks.ts` |

### Documentation & Content
Customer goal: learn the platform and track changes.

| Surface | Description | Depends On | Source Code |
|---|---|---|---|
| **Documentation Site** | Guides, concepts, how-tos. | — | `agents-docs/content/` |
| **Tutorials** | Step-by-step walkthroughs. | TypeScript SDK (`@inkeep/agents-sdk`), Inkeep CLI (`inkeep` / `agents-cli`) | `agents-docs/content/tutorials/` |
| **API Reference** | OpenAPI-based reference documentation content. | Management API, Run API (OpenAI Chat Completions), Chat API (Vercel AI SDK Data Stream) | `agents-docs/content/api-reference/` |
| **Release Notes** | Changelog and migration notes. | — | `.changeset/` |


## Breaking Change Impact Matrix

| If This Changes... | These Surfaces Break |
|---|---|
| **Management API** | **Webhook Format (Trigger Invocation)**, **OAuth Routes**, **OpenAPI Docs**, **TypeScript SDK (`@inkeep/agents-sdk`)**, **Inkeep CLI (`inkeep` / `agents-cli`)**, **Unified MCP Server (`@inkeep/agents-mcp`)**, **Visual Agent Builder**, **Projects Dashboard**, **Team Members**, **API Keys**, **Organization Settings**, **GitHub Integration**, **MCP Tools UI**, **Function Tools UI**, **Credentials UI**, **Data Components UI**, **Artifacts UI**, **External Agents UI**, **Triggers UI**, **Trigger Invocations UI**, **Playground ("Try it")**, **Chat-to-Edit (Copilot)**, **Traces Dashboard**, **Stats Dashboard**, **Datasets UI**, **Dataset Runs UI**, **Evaluators UI**, **Evaluation Jobs UI**, **Run Configs UI**, **Evaluation Results UI**, **API Reference** |
| **Run API (OpenAI Chat Completions)** | **Webhook Format (Trigger Invocation)**, **OpenAPI Docs**, **TypeScript SDK (`@inkeep/agents-sdk`)**, **Unified MCP Server (`@inkeep/agents-mcp`)**, **Evaluation Jobs UI**, **API Reference** |
| **Chat API (Vercel AI SDK Data Stream)** | **OpenAPI Docs**, **Vercel AI SDK Provider (`@inkeep/ai-sdk-provider`)**, **Chat Widget**, **Playground (“Try it”)**, **Chat-to-Edit (Copilot)**, **API Reference** |
| **A2A Protocol** | **Agent Discovery** |
| **MCP Protocol** | **Unified MCP Server (`@inkeep/agents-mcp`)**, **Runtime MCP Endpoint (`/run/v1/mcp`)**, **GitHub MCP Server (`/work-apps/github/mcp`)**, **MCP Templates** |
| **OpenTelemetry Schema** | **Playground (“Try it”)**, **Traces Dashboard**, **Conversation Inspector**, **AI Calls View**, **Tool Calls View**, **Stats Dashboard** |
| **`inkeep.config.ts` format** | **Inkeep CLI (`inkeep` / `agents-cli`)** |
| **Environment Variables** | **Create-Agents Template**, **Docker Images**, **Inkeep Cloud** |
| **Shared Types (`@inkeep/agents-core` exports)** | **TypeScript SDK (`@inkeep/agents-sdk`)**, **Visual Agent Builder** |
| **TypeScript SDK (`@inkeep/agents-sdk`)** | **Inkeep CLI (`inkeep` / `agents-cli`)**, **Create-Agents Template**, **Cookbook Templates**, **Tutorials** |
| **Inkeep CLI (`inkeep` / `agents-cli`)** | **Tutorials** |
| **Unified MCP Server (`@inkeep/agents-mcp`)** | **Unified MCP Endpoint (`/mcp`)** |
| **GitHub Integration** | **GitHub MCP Server (`/work-apps/github/mcp`)** |
| **Create-Agents Template** | **Create-Agents CLI (`@inkeep/create-agents`)** |

## Not Customer-Facing

| Item | Why Not a Surface |
|---|---|
| Database Schemas | Customers don’t directly interact with table/column structures (but API/runtime layers depend on them). |
| Runtime Engine | Internal shared execution code referenced in the transcript; not directly exposed as a customer contract. |
| `/api/auth/*` (Better Auth) | Treated in the transcript as internal infrastructure used by Manage UI and CLI auth flows, not a supported external contract. |
| `@inkeep/agents-work-apps` (package) | Classified in the transcript as internal code consumed by the product; customer-facing exposure is via the GitHub UI and `/work-apps/github/mcp` surface. |

## Dependency Graph

```mermaid
graph TD
  %% Major dependency clusters only (surfaces are cataloged in tables above)

  subgraph Foundational_Contracts[Foundational Contracts]
    ENV[Environment Variables]
    CFG[inkeep.config.ts format]
    TYPES[Shared Types]
    OTEL[OpenTelemetry Schema]
    MCPPROTO[MCP Protocol]
    A2A[A2A Protocol]
  end

  subgraph API_Layer[API Layer]
    MANAGE[Management API]
    RUN[Run API (OpenAI Chat Completions)]
    CHAT[Chat API (Vercel AI SDK Data Stream)]
    WEBHOOK[Webhook Format (Trigger Invocation)]
    OAUTH[OAuth Routes]
    DISCOVERY[Agent Discovery]
    OPENAPI[OpenAPI Docs]
    MCP_RUN[Runtime MCP Endpoint (/run/v1/mcp)]
    MCP_UNIFIED[Unified MCP Endpoint (/mcp)]
    MCP_GITHUB[GitHub MCP Server (/work-apps/github/mcp)]
  end

  subgraph Consumer_Surfaces[Consumer Surface Groups]
    SDK[SDKs & Libraries]
    CLI[CLI Tools]
    UI[Management UI]
    CHATUX[Chat Experiences]
    OBS[Observability UI]
    EVALS[Evaluations UI]
    MCPS[MCP Servers (standalone)]
    TEMPLATES[Templates & Scaffolding]
    DEPLOY[Deployment Interfaces]
    DOCS[Documentation & Content]
  end

  %% Foundational -> API
  A2A --> DISCOVERY
  MCPPROTO --> MCP_RUN
  MCPPROTO --> MCP_UNIFIED
  MCPPROTO --> MCP_GITHUB

  %% APIs -> consumer groups
  MANAGE --> SDK
  MANAGE --> CLI
  MANAGE --> UI
  MANAGE --> OBS
  MANAGE --> EVALS
  MANAGE --> MCPS
  MANAGE --> OAUTH
  MANAGE --> OPENAPI

  RUN --> SDK
  RUN --> EVALS
  RUN --> MCPS
  RUN --> WEBHOOK
  RUN --> OPENAPI

  CHAT --> CHATUX
  CHAT --> SDK

  OTEL --> OBS
  OTEL --> CHATUX

  CFG --> CLI
  TYPES --> SDK
  TYPES --> UI

  ENV --> DEPLOY
  ENV --> TEMPLATES

  %% MCP servers -> endpoints (hosted wrappers)
  MCPS --> MCP_UNIFIED
  MCPS --> MCP_MANAGE
```

