# Hook Middleware — Technical Specification

## Overview

Hooks are TypeScript functions registered at project configuration time by a project superuser. They execute during the agent generation loop at defined lifecycle points, with the ability to inspect and mutate data, invoke MCP tools, make external calls, read/write the variable bag, write to the artifact store, and terminate generation entirely.

Hook code runs in the same sandbox infrastructure used by function tools (`SandboxExecutorFactory`, `node22` runtime). Hook authors are project superusers — the execution model mirrors function tools: stored as `executeCode` + `dependencies` in the database, executed via `SandboxExecutorFactory` with a configurable `SandboxConfig`.

---

## Hook Points

Three named hook points, each with a defined input/output contract.

### `before-args`

Fires after the LLM generates a tool call but before the tool executes. The hook receives the tool call arguments and may return mutated arguments, block execution (short-circuit with a synthetic result), or abort generation entirely.

```typescript
type BeforeArgsHook = (ctx: BeforeArgsContext) => Promise<BeforeArgsResult>;

interface BeforeArgsContext {
  tool: ToolMeta;
  args: Record<string, unknown>;
  conversation: ConversationMeta;
  variableBag: VariableBag;
  mcp: ProjectMcpAccessor;
}

type BeforeArgsResult =
  | { action: 'proceed'; args?: Record<string, unknown> }   // continue, optionally with mutated args
  | { action: 'block'; result: string }                      // short-circuit: return synthetic result to LLM
  | { action: 'abort'; reason: string };                     // terminate generation loop entirely
```

### `after-result`

Fires after the tool returns its result but before that result enters the LLM's context window. The hook may transform or replace the output, write to the artifact store, or abort generation.

```typescript
type AfterResultHook = (ctx: AfterResultContext) => Promise<AfterResultResult>;

interface AfterResultContext {
  tool: ToolMeta;
  args: Record<string, unknown>;
  result: unknown;
  conversation: ConversationMeta;
  variableBag: VariableBag;
  artifacts: ArtifactAccessor;
  mcp: ProjectMcpAccessor;
}

type AfterResultResult =
  | { action: 'proceed'; result?: unknown }   // continue, optionally with transformed result
  | { action: 'abort'; reason: string };      // terminate generation loop entirely
```

### `before-delegation`

Fires when the agent is about to hand off to a sub-agent, before the sub-agent receives any input. Applies to both `delegate_to_*` (sub-agent returns) and `transfer_to_*` (permanent handoff). The hook may inject additional context into the sub-agent's starting payload, or abort entirely.

```typescript
type BeforeDelegationHook = (ctx: BeforeDelegationContext) => Promise<BeforeDelegationResult>;

interface BeforeDelegationContext {
  subAgent: SubAgentMeta;
  delegationType: 'delegate' | 'transfer';
  payload: SubAgentPayload;
  conversation: ConversationMeta;
  variableBag: VariableBag;
  mcp: ProjectMcpAccessor;
}

type BeforeDelegationResult =
  | { action: 'proceed'; payload?: SubAgentPayload }  // continue, optionally with injected context
  | { action: 'abort'; reason: string };              // terminate generation loop entirely
```

---

## Flow-Level Abort

Any hook returning `{ action: 'abort' }` terminates the running generation loop immediately — no further tool calls, LLM steps, or delegation. The `reason` is surfaced as the terminal message for the generation. This is distinct from `block` (which injects a synthetic result and lets the LLM continue reasoning).

---

## Hook Registration & Execution

### Storage

Hooks are stored in the manage database analogously to function tool definitions — as `executeCode` (TypeScript source), `dependencies` (npm package map), and metadata (hook point, scope, ordering, `onError` policy). They are registered via the management UI or API by a project superuser.

### Execution

Hooks execute via `SandboxExecutorFactory`, the same infrastructure used for function tools (`agents-api/src/domains/run/tools/SandboxExecutorFactory`). The sandbox is session-scoped: `SandboxExecutorFactory.getForSession(sessionId)`. Each hook invocation calls `sandboxExecutor.executeHook(hookId, ctx, hookDef)` where `hookDef` carries `executeCode`, `dependencies`, and `sandboxConfig`.

```typescript
const defaultHookSandboxConfig: SandboxConfig = {
  provider: 'native',
  runtime: 'node22',
  timeout: HOOK_EXECUTION_TIMEOUT_MS_DEFAULT,
  vcpus: HOOK_SANDBOX_VCPUS_DEFAULT,
};
```

The `SandboxConfig` is overridable per-hook at registration time, the same way function tools expose `ctx.config.sandboxConfig`.

### Schema

Mirrors the `functions` / `function_tools` split:

- **`hook_definitions`** — project-scoped. Stores reusable logic: `executeCode`, `dependencies`. Can be shared across multiple hook attachments.
- **`hooks`** — attachment table. Ties a `hookDefinitionId` to a hook point and execution context. Scope is declared explicitly via a non-nullable `scope` column — never inferred from `NULL`.

```
hook_definitions (tenantId, projectId, id)
  executeCode: text
  dependencies: jsonb
  createdAt, updatedAt

hooks (tenantId, projectId, id)
  hookDefinitionId: FK → hook_definitions.id
  scope: 'project' | 'agent'      -- non-nullable; intent always explicit
  agentId: varchar(256) NULLABLE  -- required when scope = 'agent', must be null when scope = 'project'
  hookPoint: 'before-args' | 'after-result' | 'before-delegation'
  order: integer
  onError: 'abort' | 'proceed'    -- default: 'proceed'
  sandboxConfig: jsonb NULLABLE   -- overrides project default if set
  createdAt, updatedAt

  CHECK (
    (scope = 'project' AND agentId IS NULL) OR
    (scope = 'agent'   AND agentId IS NOT NULL)
  )
```

### Execution Order

When loading hooks for a running agent, the query fetches all hooks where `scope = 'project' OR (scope = 'agent' AND agentId = $currentAgentId)`, ordered by:

1. Project-level hooks first (`scope = 'project'`)
2. Agent-level hooks second (`scope = 'agent'`)
3. Within each tier, ascending `order`

This ensures project-wide policy hooks (budget guard, audit log) always run before agent-specific hooks.

---

## Variable Bag

A mutable, schema-free key-value store that persists for the lifetime of a conversation. Readable and writable by any hook. Invisible to the LLM — never injected into context.

### Storage

Stored as a `jsonb` column on the `conversations` table in the runtime database.

```sql
ALTER TABLE conversations ADD COLUMN variable_bag jsonb NOT NULL DEFAULT '{}';
```

Reads and writes are performed via the `VariableBag` interface passed into every hook context:

```typescript
interface VariableBag {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  getAll(): Record<string, unknown>;
}
```

Writes are accumulated in memory across all hooks within a tool call (before-args + after-result) and flushed to the DB once after the tool call completes.

### Scoping

Variable bag is conversation-scoped. State persists across all turns, tool calls, and delegations within a single conversation.

**v2 consideration:** Task-scoped variable bags (a `jsonb` column on `tasks`) for cases where state should not bleed between turns — e.g. a per-invocation retry counter that resets on each user message. The interfaces would be identical; the scoping would be configurable per-hook or per-key.

---

## Artifact Store Extensions

The existing artifact store (`ledgerArtifacts` table, `ArtifactService`, `ArtifactParser`) is built around tool-output artifacts: a tool executes, its output is stored, and the LLM references it via `<artifact:ref id="X" tool="Y" />` tags.

Hooks require additional access patterns:

| Access Pattern | Current support | Required extension |
|---|---|---|
| Hook-initiated write with caller-chosen key | No — artifacts are always tied to a tool call | Add `writeArtifact(key, content)` to `ArtifactAccessor` |
| Append to existing artifact | No | Add `appendArtifact(key, content)` |
| Read artifact by key | Partial — queries by contextId/taskId | Add `readArtifact(key)` keyed by caller-chosen string |
| Return reference string to LLM | Yes — `<artifact:ref ...>` tags | Reuse existing mechanism; expose from `ArtifactAccessor` |

`ArtifactAccessor` interface available in `after-result` hooks:

```typescript
interface ArtifactAccessor {
  write(key: string, content: string, mimeType?: string): Promise<string>;   // returns reference token
  append(key: string, content: string): Promise<void>;
  read(key: string): Promise<string | undefined>;
}
```

Hook-written artifacts are stored in `ledgerArtifacts` with a `source: 'hook'` marker and the caller-chosen `key` alongside the existing `toolCallId` index.

---

## MCP Access from Hooks

Hooks have access to all MCP tools configured on the project, regardless of which agent is currently executing. The hook author is a project superuser and can invoke any registered MCP.

### ProjectMcpAccessor

A new `ProjectMcpAccessor` (or an extension to `AgentMcpManager`) is required. It initializes connections to all MCPs registered on the project and exposes a `callTool` interface:

```typescript
interface ProjectMcpAccessor {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  listTools(): Promise<ToolMeta[]>;
}
```

MCP connections are initialized lazily on first `callTool()` invocation for a given server within the session. `ProjectMcpAccessor` is self-contained and does not depend on the invoking agent's `AgentMcpManager`.

---

## Multi-Hook Ordering

When multiple hooks are registered for the same hook point, they execute in a deterministic, user-defined order. The output of each hook (mutated args or result) is passed as the input to the next hook in the chain.

If any hook in the chain returns `abort` or `block`, the chain short-circuits — subsequent hooks in that chain do not execute.

Hook ordering is defined at registration time. The platform guarantees execution order matches registration order.

---

## Shared Types

```typescript
interface ToolMeta {
  name: string;
  type: 'mcp' | 'function' | 'relation';
  readonly: boolean;
  sideEffects: boolean;
}

interface SubAgentMeta {
  agentId: string;
  name: string;
}

interface ConversationMeta {
  conversationId: string;
  taskId: string;
  tenantId: string;
  projectId: string;
}

interface SubAgentPayload {
  systemPrompt?: string;
  additionalContext?: string;
  messages?: unknown[];
}
```

---

## Open Questions

1. **Hook registration scope** — Resolved: `hook_definitions` (project-scoped logic) + `hooks` attachment table with explicit non-nullable `scope` enum (`'project' | 'agent'`) and a check constraint enforcing that `agentId` is set iff `scope = 'agent'`. Project-level hooks run before agent-level hooks within the same hook point.

2. **`SandboxExecutorFactory` extension** — Resolved: add a dedicated `executeHook(hookId, ctx, def)` method parallel to `executeFunctionTool`. Internal sandbox machinery can be extracted to a private `_execute` method shared by both, but the public interface stays typed and separate.

3. **Variable bag write flushing** — Resolved: batch writes in memory across all hooks within a tool call (before-args + after-result), flush to `conversations.variable_bag` once after the tool call completes.

4. **Task-scoped variable bag (v2)** — Resolved: conversation scope is sufficient for all v1 use cases. Task-scoped bag (`tasks.variable_bag`, identical interface) deferred to v2.

5. **ProjectMcpAccessor initialization strategy** — Resolved: lazy per-call. `ProjectMcpAccessor` is self-contained; MCP connections are initialized on first `callTool()` invocation for a given server within the session. Reusing the invoking agent's `AgentMcpManager` connections would require coupling the two classes and exposing internal connection state — revisit if latency proves to be a problem in practice.

6. **Hook error handling** — Resolved: per-hook `onError` policy (`'abort' | 'proceed'`), default `'proceed'`. On error, `'proceed'` logs and continues as if the hook returned `{ action: 'proceed' }` with no mutations; `'abort'` terminates generation with the error surfaced as the terminal message. Stored as a column on the `hooks` table. Hooks acting as hard policy gates should explicitly set `onError: 'abort'`.
