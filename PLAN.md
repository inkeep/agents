# Spec Files Plan

This document outlines the specification files to create in the `spec/` directory. These specs are designed to provide AI agent developers with context on specific features of the Inkeep Agent Framework.

## Recommended Spec Files

### Core Architecture

| File | Purpose |
|------|---------|
| `spec/architecture-overview.md` | High-level system architecture: services (manage-api, run-api, CLI, UI, SDK), their responsibilities, and how they interact. Include deployment topology and data flow diagrams. |
| `spec/database-schema.md` | Entity model (projects, agents, subAgents, tools, tasks, conversations, messages), scoping hierarchy (tenant → project → agent → subAgent), and key relationships. Reference `packages/agents-core/src/db/schema.ts`. |
| `spec/multi-tenancy.md` | Tenant isolation patterns, organization/project scoping, foreign key cascades, and how tenantId flows through the system. |

### Agent Execution

| File | Purpose |
|------|---------|
| `spec/agent-execution-flow.md` | How agent turns work: receiving messages → sub-agent selection → tool calls → responses. Include the execution loop, stopWhen conditions, and context preservation. |
| `spec/a2a-protocol.md` | Agent-to-agent communication: JSON-RPC methods (`message/send`, `message/stream`, `tasks/get`), message parts, context IDs, task lifecycle, blocking vs streaming modes. |
| `spec/transfer-delegation.md` | How transfers and delegations work: when to use each, how context is preserved, parent-child task relationships, and implementation patterns. |
| `spec/agent-discovery.md` | Agent card discovery via `/.well-known/agent.json`, capabilities advertisement, and how external platforms discover and connect. |

### Tools & MCP

| File | Purpose |
|------|---------|
| `spec/mcp-integration.md` | MCP server lifecycle: registration, health checks, transport types (stdio, SSE, HTTP), tool discovery, and credential injection. |
| `spec/tool-execution.md` | How tools are called: validation, execution context, result handling, error patterns, and tool approvals. |
| `spec/credentials.md` | Credential management patterns: InkeepCredentialProvider, env vars, keychain, Nango OAuth, and how credentials flow to MCP servers. |

### SDK & CLI

| File | Purpose |
|------|---------|
| `spec/sdk-builder-patterns.md` | How to use SDK builders (`agent()`, `subAgent()`, `tool()`, `mcpServer()`, `dataComponent()`). Include composition patterns and common configurations. |
| `spec/push-pull-mechanics.md` | How `inkeep push` and `inkeep pull` work: serialization format, diff detection, LLM-assisted code updates, and conflict resolution. |
| `spec/inkeep-config.md` | Structure of `inkeep.config.ts`, project exports, environment profiles, and CLI configuration. |

### Context & Data Flow

| File | Purpose |
|------|---------|
| `spec/context-headers.md` | How headers flow from API requests to sub-agents, variable interpolation (`{{variable}}`), and context fetcher patterns. |
| `spec/conversation-history.md` | Conversation history config, message types, history limits, and how sub-agents access prior messages. |
| `spec/structured-outputs.md` | Data components, artifact components, status updates: schemas, when to use each, and rendering patterns. |

### Observability & Testing

| File | Purpose |
|------|---------|
| `spec/observability.md` | OpenTelemetry integration, span patterns, correlation IDs, SigNoz/Jaeger setup, and logging conventions. |
| `spec/testing-patterns.md` | Vitest setup, in-memory SQLite for tests, A2A integration testing (60s timeouts), mocking patterns, and test organization. |

### API & Authentication

| File | Purpose |
|------|---------|
| `spec/authentication.md` | API key auth, development mode, bypass secrets, Better Auth integration, and SSO patterns. |
| `spec/api-conventions.md` | Request/response patterns for manage-api and run-api, Zod validation, error codes, and OpenAPI alignment. |

---

## Priority Order for Creation

### Tier 1 - Essential for understanding the system
1. `architecture-overview.md`
2. `database-schema.md`
3. `agent-execution-flow.md`
4. `a2a-protocol.md`
5. `sdk-builder-patterns.md`

### Tier 2 - Important for feature work
6. `mcp-integration.md`
7. `transfer-delegation.md`
8. `context-headers.md`
9. `testing-patterns.md`
10. `push-pull-mechanics.md`

### Tier 3 - Reference for specific scenarios
11. `structured-outputs.md`
12. `credentials.md`
13. `observability.md`
14. `multi-tenancy.md`
15. `authentication.md`
16. `tool-execution.md`
17. `conversation-history.md`
18. `agent-discovery.md`
19. `api-conventions.md`
20. `inkeep-config.md`

---

## Authoring Guidelines

### Target Audience
- **Primary**: AI coding agents working on this codebase
- **Secondary**: Humans who proofread and maintain these docs
- **Assumed knowledge**: None - specs are self-contained; no prior agent framework knowledge required

### Content Principles
- **Code is source of truth** - specs summarize and point to relevant code, not replace it
- **Living documents** - track the existing codebase, not historical decision archives (ADRs are separate)
- **Short explanations** - explain *what* exists with brief *why*, not detailed decision history
- **Reference specific file paths** - always point readers to the relevant source files

### Size & Structure
- **Target length**: 500-1500 words per document
- **Smaller is better** - enables selective context inclusion for AI agents
- **Split when necessary** - if a file grows too large, abstract the concept in one file and explain lower-level details in separate files
- **Follow abstraction principles** - manage complexity through proper decomposition

### Diagrams
- **Use Mermaid syntax** - AI agents parse Mermaid well (structured DSL, unambiguous syntax)
- **Avoid ASCII diagrams** - LLMs struggle with spatial pattern recognition; tokenization breaks ASCII art
- **Keep diagrams focused** - break large systems into smaller, targeted diagrams
- **Place diagram before text** - establish visual structure, then explain in prose

### Why Mermaid over ASCII
| Factor | Mermaid | ASCII |
|--------|---------|-------|
| AI comprehension | Excellent (structured text) | Poor (spatial patterns break on tokenization) |
| Ambiguity | Low (strict DSL syntax) | High (interpretation varies) |
| Human review | Good (renders visually) | Moderate (mental parsing required) |
| Maintainability | Easy (text-based) | Fragile (formatting breaks easily) |

---

## Suggested Format for Each Spec

```markdown
# [Feature Name]

## Overview
Brief description of what this feature is and why it matters.

## Key Concepts
Core terminology and concepts an AI agent developer needs to understand.

## Architecture
How components interact, data flow, relevant files/packages.

## Implementation Details
Patterns, code references, and key functions/classes.

## Common Operations
Typical tasks and how to accomplish them.

## Gotchas & Edge Cases
Known issues, non-obvious behaviors, debugging tips.

## Related Specs
Links to related specification documents.
```

---

## Source References

Key files to reference when writing specs:

- **Database Schema**: `agents/packages/agents-core/src/db/schema.ts`
- **SDK Builders**: `agents/packages/agents-sdk/src/`
- **A2A Protocol**: `agents/agents-run-api/src/` and `agents/agents-docs/content/talk-to-your-agents/a2a.mdx`
- **MCP Integration**: `agents/packages/agents-manage-mcp/`
- **CLI**: `agents/agents-cli/`
- **Existing Docs**: `agents/agents-docs/content/`
- **Agents.md**: `agents/agents/Agents.md` (comprehensive guide for AI coding agents)
