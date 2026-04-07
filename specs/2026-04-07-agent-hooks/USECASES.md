# Hook Middleware Transform — Use Cases

## Result Too Big

**PR diff → filenames + line counts**
A tool returns a full PR diff, 40k tokens. The agent only needs changed file names and line counts to decide what to read next. Hook: `AfterToolCall(get_pull_request_diff)` → JMESpath `files[*].{name: filename, additions: additions, deletions: deletions}`. Context impact: 40k → ~200 tokens.

**SQL query → first N rows**
Agent runs a SQL query returning 5,000 rows. It only needs the first 20 to understand schema and shape. Hook returns `rows[0:20]` + `{ truncated: true, total: len(rows) }`. The agent knows data exists without seeing all of it.

**Log search → signal only**
Splunk/Datadog tool returns 500 matching log lines. Hook slices to the 10 most recent, or filters to ERROR level only. Agent gets signal without noise.

---

## Sub-Agent Context Prefetch

> The before-delegation hook fires for both `delegate_to_*` (sub-agent returns to caller) and `transfer_to_*` (permanent handoff) operations. Context injection applies to both. Flow-level abort (see Required Mechanisms) is only meaningful for delegation — aborting a transfer cancels the entire generation loop.

**Routing to billing-agent → auto-fetch account status**
A supervisor routes to a billing-agent sub-agent. The hook fires on delegation, sees the sub-agent identity, and fetches the customer's account status and recent invoices from the billing API before handoff. The billing-agent starts with context it would have had to fetch itself.

**Invoking security-reviewer → inject SECURITY.md + CVE list**
When a security-reviewer sub-agent is invoked, the hook automatically fetches the project's SECURITY.md and known CVE list and injects them into the delegation context. The sub-agent doesn't need to know to ask for these.

**Any sub-agent call → inject tenant feature flags**
In a multi-tenant SaaS, different customers have different capabilities — features enabled, rate limits, data access scopes. When the supervisor delegates to a sub-agent, the hook fires on the delegation event, reads the current `tenant_id` from the variable bag (set at conversation start), calls an internal feature-flag service, and injects the result into the sub-agent's context before it starts. The sub-agent can make decisions ("this tenant doesn't have the export feature") without that logic living in the agent prompt or the supervisor needing to know what each sub-agent needs. The hook acts as the bridge between conversation-level identity and sub-agent-level capabilities — feature flag logic lives in one place rather than being duplicated across every sub-agent's system prompt.

---

## Arg Injection / Enrichment

**Credential injection — LLM never sees the secret**
The agent prompt says "use the Stripe API to fetch invoice {invoice_id}". The LLM generates a tool call with `api_key: "{{api_key}}"` — a convention meaning "I know a credential goes here but I don't have it." The before-args hook intercepts this, sees the placeholder token, resolves the real secret from the vault (keyed by tool name + credential name), and substitutes it. The LLM never had the key in context, can't leak it in reasoning, and can't be prompted to reveal it. Credential rotation is handled here too — if the vault returns a fresh token, the hook always uses the current one without any agent prompt changes.

**Tenant scoping — auto-inject tenant_id**
Every database tool call gets `tenant_id` injected into the args automatically. Even if the agent forgets to pass it, the hook ensures it's always there. Prevents cross-tenant data leaks without relying on the LLM.

**Timestamp normalization**
An agent passes `date: "yesterday"` to a calendar tool. The hook resolves it to an ISO 8601 string before execution. Eliminates a whole class of tool call failures.

---

## Policy / Control Flow Gates

**Audit mode — block all write tools**
A user puts an agent in "audit mode." Any tool with a write side-effect (`create_issue`, `update_record`, `send_message`) is blocked by a hook. The agent can still read and reason; it just can't act. The hook returns `{ proceed: false, reason: "agent is in read-only mode" }` and the platform feeds that back as the tool result.

**Budget guard**
Each LLM API call tracks cumulative cost in the variable bag. A hook checks the running total before each tool execution; once a threshold is crossed, it blocks further tool calls and surfaces a `BUDGET_EXCEEDED` message.

**Path scope enforcement**
A `file_write` tool is restricted to paths under `/workspace/output/`. The before-args hook inspects the path argument; if it's outside the allowed scope, block and explain. No jail-escaping.

---

## Output Routing

**Raw HTML → artifacts**
A scraping tool returns a full page of HTML — navigation, ads, boilerplate, the actual content. All of it would hit the context window. The hook runs a lightweight extractor (CSS selector, JMESpath over a parsed structure, or a small transform function) to pull out just the target data — a price, a table, a list of links — and writes the full HTML to the artifacts store under a key like `scrape::{url}::raw`. What returns to the agent is "Scraped example.com — extracted 12 products, stored raw at `artifacts://scrape::example.com::raw`". The agent works with the 12 products. If it later needs to re-extract with a different selector, it can fetch from artifacts. Context stays clean; nothing is lost.

**Report sections → artifact assembly**
An agent writes a long document iteratively — each tool call produces a section. Without a hook, each section's full text flows back into context, and by section 5 the agent is reading its own prior output, which is wasteful and eventually hits limits. The hook intercepts each `write_section` result, appends the content to a running artifact (`report::draft`), and returns only metadata: "Section 3 written (612 words). Total draft: 1,840 words." The agent tracks progress without accumulating the document in its own context window. At the end, the full artifact is available for rendering or handoff.

**Search result deduplication**
A research agent issues multiple search queries across a session. Search tools frequently return overlapping results, especially top-ranked pages. Without a hook, the same URL's content might be summarized into context two or three times. The hook maintains a `seen_urls` set in the variable bag. On each search result, it filters out any URL already in the set, adds new ones, and returns only novel results. The agent never knows — it just receives a deduplicated list. This also prevents the agent from inflating its confidence by citing a source it's seen multiple times.

---

## Composed / Multi-Hook

**The complete API call pipeline**
Before: inject auth token + add tenant ID. After: if response > 10k tokens, JMESpath-select the relevant fields; if status indicates error, normalize to a standard error shape; write raw response to artifacts. The agent sees a clean, typed, credential-free, right-sized result. None of this is in the agent prompt.

---

## Required Mechanisms

| Mechanism | Description | Used by |
|---|---|---|
| Before-args hook point | Fires after the LLM generates a tool call but before the tool executes; can inspect and mutate arguments or block execution entirely | Credential injection, tenant scoping, timestamp normalization, path scope |
| After-result hook point | Fires after the tool returns its result but before that result enters the LLM's context window; can transform or replace the output | All result-too-big, all output routing |
| Before-delegation hook point | Fires when a supervisor is about to hand off to a sub-agent, before the sub-agent receives any input; can modify what the sub-agent starts with | All sub-agent prefetch cases |
| Result replacement (`proceed: false`) | The platform contract by which a hook short-circuits tool execution and injects an arbitrary string back to the LLM as if it were the tool's result | All gate cases, output routing short confirmations |
| Artifacts store | A session-scoped, key-addressable content store outside the context window; supports write, read, and append; holds large content that would otherwise bloat context | All output routing cases |
| External call capability | Hooks can make outbound network requests (HTTP, vault lookups, internal APIs) during execution — not just transform data already in memory | Prefetch cases, credential injection |
| MCP tool access from hooks | Hooks can invoke tools through the MCP protocol using the MCP SDK, not just raw HTTP — enabling structured tool calls with schema validation and the full MCP tool ecosystem from within a hook | Google Calendar context fetcher, any prefetch case using MCP-registered tools |
| Flow-level exit / abort | A hook can terminate the entire generation loop — no further steps execute. This is not scoped to a single tool call or delegation; it fully stops the running agent. Can be triggered from any hook point (before-args, after-result, before-delegation). | Calendar-gate context fetcher (no meetings → stop entirely), budget exceeded, policy violation |
| Programmatic hook | Hooks are TypeScript functions registered at config time by a project superuser. They run in-process with full Node.js access — conditionals, external calls, loops, MCP tool invocations — not just declarative transforms. Hook authors are trusted; no sandbox. | Budget guard, deduplication, calendar exit gate, credential injection |
| Tool identity + metadata access | Within a hook, the tool's name and declared properties (e.g., `readonly`, `side_effects`) are available for inspection and branching logic | Audit mode, credential injection |
| Sub-agent delegation context injection | The ability to append content to the payload a sub-agent receives at startup, distinct from transforming a tool result | All prefetch cases |
| Multi-hook ordering / chaining | When multiple hooks apply to the same event, the platform executes them in a deterministic order, passing each hook's output as the next hook's input | Composed pipeline |
| Variable bag | A mutable key-value store scoped to the conversation, readable and writable by any hook, invisible to the LLM. Stored as a `jsonb` column on the `conversations` table. Task-scoped variable bags are a v2 consideration for cases where state should not bleed between turns. | Budget guard, deduplication, tenant ID propagation |
| MCP tool access from hooks | Hooks have access to all MCP tools configured on the project (not scoped to the invoking agent). The hook author is a project superuser and can invoke any registered MCP tool. Requires a project-level MCP accessor distinct from the per-agent `AgentMcpManager`. | Google Calendar context fetcher, any prefetch case using MCP-registered tools |
