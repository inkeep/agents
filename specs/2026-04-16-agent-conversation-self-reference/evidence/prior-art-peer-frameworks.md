---
name: Prior art — runtime identifiers in prompts across peer frameworks
description: How LangGraph, Vercel AI SDK, Claude Agent SDK, OpenAI Assistants, and Letta handle (or avoid) runtime context in prompts; why Inkeep differing is architecturally justified.
type: factual
sources:
  - Subagent investigation 2026-04-16 (a1afe6cc897fd6247) — public framework docs, design patterns as of Feb 2025
captured: 2026-04-16
baseline: 2abfdf44e
---

# Summary

**Common pattern across peer frameworks: runtime IDs stay out of prompts.** Session/thread/conversation identifiers are accessed programmatically inside tool handlers, not via prompt template variables. Naming, where exposed, is flat (`thread_id`, not `runtime.thread_id`).

| Framework | Thread/conversation ID visible in prompt? | How context is accessed | Naming convention |
|---|---|---|---|
| LangGraph / LangChain | No | `graph.get_state()` calls inside tool handlers | Flat (`thread_id`) — accessed as state dict |
| Vercel AI SDK (`ai`) | No | Imperative API; runtime context passed as structured params | No template variable support |
| Claude Agent SDK / Managed Agents | No | Conversation history + system instructions; thread context implicit in execution context | Not exposed to instructions |
| OpenAI Assistants | No | `thread_id` is metadata on the thread object; accessed via API calls from tool handlers | Flat (`thread_id`) |
| Letta / MemGPT | No | Memory tools fetch context programmatically | Not template-injected |

**The architectural assumption behind this consensus:** tools are in-process functions. Tool handlers have closure/context access to runtime state; there's no need to plumb it through the prompt.

# Why Inkeep is right to differ

Inkeep's first-class tool type is the **MCP remote server**. Tool handlers don't run in-process; they're called over a transport. There is no closure/context seam to read `conversationId` from inside an MCP server — the server knows only what it receives via the protocol (tool arguments, transport headers).

Given that constraint, the design options for getting `conversationId` into an MCP tool call are:

1. **Header injection at the MCP client.** Out-of-band; coupled per-server; invisible to LLM/traces; doesn't work for function tools.
2. **Template-injection at prompt render time.** LLM sees value; passes as normal tool argument; visible in traces; works uniformly for MCP + function tools.

Only option 2 preserves prompt/trace transparency and generalizes across tool types. **Template-injection is consensus-correct *within* Inkeep's architectural constraints** — even though it's consensus-divergent across the peer-framework landscape.

# Contamination-awareness flag

This finding was presented in-conversation as a frame-challenge ("every peer framework does this differently — why should Inkeep?") before locking in the template-injection direction. User reviewed and confirmed. No stealth consensus-adoption — the dissent was examined and the architectural justification was specific to Inkeep's MCP-remote-tools model, not appeal-to-tradition.

# What this does NOT settle

- Whether Inkeep should *also* invest in a programmatic tool-handler context seam (for function tools that want runtime IDs without going through the LLM). Out of scope for this spec; worth noting as a separate design question if function-tool usage grows.
- Naming specifics — peer frameworks use flat naming (`thread_id`); Inkeep's choice of nested `$conversation.id` is stylistic, justified by Inkeep's TemplateEngine already supporting `$`-prefix builtins and JMESPath path navigation.
