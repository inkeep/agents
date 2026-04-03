# Code Mode for Agents

## Problem

Inkeep agents need to process, query, and transform data during execution — grep through artifacts, extract fields from JSON, search within conversations, and perform ad-hoc data operations.

Building each operation as a dedicated tool (grep, jq, schema derivation, etc.) is a never-ending scope expansion. Each tool costs engineering time, and agents still can't handle novel operations not anticipated by tool authors. The LLM rewriting the same utility code every time it needs to parse JSON or search text is a waste of tokens.

**Insight from discussion:** Rather than building bespoke grep and jq tools, we should give agents the ability to write and execute code on the fly — and provide a standard library so they don't rewrite the basics.

## Vision

Code Mode is a runtime capability that lets agents **write and execute code** during a conversation, with access to a **shared standard library** of common utilities. Think of it like how Claude Code has access to command-line tools — but for Inkeep agents.

### Core Ideas

#### 1. Code Execution as a Platform Tool

Agents get a `execute_code` tool that accepts code (TypeScript/JS) and runs it in the existing sandbox infrastructure (native or Vercel). The agent writes whatever logic it needs on the fly — no need for us to anticipate every operation.

**Example use cases:**
- Grep through an oversized artifact for specific patterns
- Extract and reshape fields from a large JSON tool result
- Filter and sort conversation messages by criteria
- Compute aggregations or statistics from data
- Transform data between formats

#### 2. Standard Library ("stdlib")

A curated set of common utilities pre-loaded in the sandbox environment so agents don't waste tokens rewriting them. These are the operations agents reach for most often:

| Module | Operations | Why built-in |
|--------|-----------|--------------|
| `grep` | Text search with regex, context windows, match counting | Most common data operation — agents need this constantly for artifacts |
| `jq` | JSON path queries, field extraction, filtering, transformation | Structured data querying without writing verbose JS |
| `schema` | Derive schema/shape from arbitrary JSON, type inference | Agent needs to understand data structure before querying it |
| `text` | Split, chunk, truncate, word count, diff | Common text processing for conversation/artifact data |
| `csv` | Parse, filter, transform tabular data | Common tool result format |

The stdlib ships with the platform — agents don't need to install or import anything. It's just available in the execution environment.

#### 3. Shared Tool Generation (Agent-Scoped Library)

Sub-agents can create reusable functions during execution and register them in a **shared library scoped to the parent agent**. Other sub-agents in the same agent graph can then use these functions without rewriting them.

```
Sub-Agent A writes a data transformer
  → registers it as a shared function
  → Sub-Agent B uses that function in its own code execution
```

This means agents can build up specialized utilities during a conversation. A sub-agent that figured out how to parse a specific API response format can share that parser with its siblings.

**Scope:** The shared library is scoped to the agent (project + agentId). Sub-agents within the same agent graph can read/write. Different agents in different projects cannot see each other's libraries.

#### 4. Cross-Session Persistence

Generated tools can be **persisted across sessions**, so agents improve over time by building up their toolbox. When an agent creates a useful utility in one conversation, it's available in the next.

```
Session 1: Agent writes a Salesforce response parser → saved to library
Session 2: Agent reuses the parser without regenerating it
Session N: Library grows with battle-tested utilities
```

**Storage:** Persisted functions are stored in the manage database, versioned, and scoped to the agent. They can be viewed/managed in the Agent Builder UI.

**Curation:** The agent decides what's worth persisting (not every throwaway snippet). Persisted functions get a name, description, and input/output schema so other agents (and humans) can understand them.

## How It Connects

```
┌─────────────────────────────────────────────────┐
│                 Agent Execution                  │
│                                                  │
│  Agent calls execute_code tool                   │
│       │                                          │
│       ▼                                          │
│  ┌─────────────────────────────┐                 │
│  │     Sandbox Environment     │                 │
│  │                             │                 │
│  │  ┌───────┐  ┌───────────┐  │                 │
│  │  │ stdlib │  │  shared   │  │                 │
│  │  │ (grep, │  │  library  │  │                 │
│  │  │  jq,   │  │ (agent-   │  │                 │
│  │  │  etc.) │  │  scoped)  │  │                 │
│  │  └───────┘  └───────────┘  │                 │
│  │                             │                 │
│  │  Agent's code runs here     │                 │
│  │  with access to both        │                 │
│  └─────────────────────────────┘                 │
│       │                                          │
│       ▼                                          │
│  Result returned to agent context                │
│  (or saved as artifact if oversized)             │
└─────────────────────────────────────────────────┘
```

## Relationship to Existing Systems

- **Sandbox Executors:** Code Mode builds on the existing `SandboxExecutorFactory` (native + Vercel). The sandbox infrastructure already handles execution, session scoping, and cleanup.
- **Function Tools:** Existing function tools are pre-configured in the manage database. Code Mode is dynamic — the agent writes code at runtime. Persisted shared functions could eventually become function tools.
- **Artifacts:** Oversized tool results are already stored as artifacts. Code Mode gives agents a way to actually *work with* those artifacts (grep, query, transform) instead of just retrieving them whole.
- **Platform Tools:** `execute_code` would be a platform tool (like the search tools in the conversation history spec), auto-loaded for agents that have code mode enabled.
- **Conversation History Search:** The queryable history spec gives agents tools to *find* relevant conversations and artifacts. Code Mode gives agents tools to *process* what they find.

## Open Questions

1. **What can code access?** Can code in the sandbox make network requests? Access the database? Or is it purely computational (data in → data out)? Starting with pure computation is safest.

2. **How does code get data?** Does the agent pass data as arguments to `execute_code`, or can code directly reference artifacts/messages by ID? Passing data is simpler; referencing by ID is more powerful for large data.

3. **Shared library governance:** Who decides what gets persisted? The agent autonomously? With human approval? Should there be a review/approval step in the UI?

4. **Security boundaries:** What are the sandboxing guarantees? Timeout limits, memory limits, no filesystem access, no network? How do we prevent agents from writing malicious code?

5. **Token economics:** Is the stdlib small enough that agents can "see" the available functions via tool descriptions, or do they need a discovery mechanism (like `list_stdlib_functions`)?

6. **Internal messages:** Should code mode have access to internal agent messages (sub-agent chatter), or only user-facing messages and artifacts?

7. **Versioning shared functions:** When a persisted function is updated, what happens to agents mid-conversation that already loaded the old version?

8. **Enabling code mode:** Is this opt-in per agent (configured in Agent Builder), or available to all agents by default?

## Phasing (Rough)

**Phase 1 — Code Execution + Stdlib**
- `execute_code` platform tool
- Sandbox execution (leverage existing infra)
- Ship stdlib with grep, jq, text basics
- Pure computation only (no network, no DB)

**Phase 2 — Shared Library**
- Agent-scoped function registry
- Sub-agents can register and discover shared functions
- Functions scoped to agent graph

**Phase 3 — Cross-Session Persistence**
- Persist shared functions to manage database
- UI for viewing/managing persisted functions
- Agent can load persisted functions at session start
- Versioning and curation

---

*Origin: Slack discussion between Tim and Mike (2026-04-03) about how to handle grep/search within conversations and artifacts. Rather than building bespoke tools, code mode emerged as the more general-purpose solution.*
