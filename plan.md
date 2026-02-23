# Refactoring Spec: Agent Execution Layer Decomposition

## 1. Overview

### 1.1 Scope

Decompose the agent execution layer — `Agent.ts` (3858 lines), `executionHandler.ts` (761 lines), and `generateTaskHandler.ts` (610 lines) — into a pipeline of focused, stateless modules. Introduce shared span instrumentation helpers to eliminate boilerplate. Ensure the resulting architecture supports future parallel delegation streaming without further structural changes.

### 1.2 Motivation

| Problem | Evidence |
|---|---|
| God class | `Agent.ts` handles 8+ distinct responsibilities in one 3858-line class |
| Single responsibility violations | MCP connection management, tool approval UX, artifact data analysis, LLM orchestration, compression, model config — all in one file |
| Duplicated logic | Tool approval flow copy-pasted verbatim between MCP tools (lines 898-1029) and function tools (lines 1531-1658) |
| Implicit state coupling | 16 `this.*` fields used as implicit parameter passing; mutations scattered across 3800 lines |
| Class not justified | One consumer (`generateTaskHandler`), one public method (`generate`), per-request instantiation — no shared lifecycle |
| Span boilerplate | 20+ identical try/setStatus/catch/setSpanWithError/finally/end blocks across 5 files |
| Error handling duplication | 4 copies of the same ~35-line teardown sequence in `executionHandler.ts` |
| Blocks future work | Mutable class state prevents running parallel delegations without contention |

### 1.3 Guiding Principles

- **No behavioral changes.** All inputs, outputs, stream events, span attributes, and error handling remain identical. This is a pure structural refactor.
- **Explicit data flow.** Replace `this.X` implicit state with a `GenerationContext` object threaded through functions.
- **Don't split for splitting's sake.** Only create separate files when there's genuinely distinct infrastructure. Small functions that share the same helpers stay in the same file.
- **Instrumentation is declarative.** Span creation, error recording, and cleanup handled by reusable helpers — not copy-pasted.

### 1.4 Non-Goals

- Changing the A2A message protocol or execution loop structure
- Implementing parallel delegation (this refactor *enables* it; a future spec will *implement* it)
- Modifying the `SystemPromptBuilder`, `PromptConfig`, or prompt versioning system
- Changing `relationTools.ts` beyond updating imports

---

## 2. Current Architecture Analysis

### 2.1 Agent.ts — Responsibility Inventory

| Responsibility | Lines (approx) | Key Methods |
|---|---|---|
| Model configuration | ~150 | `getPrimaryModel`, `getStructuredOutputModel`, `getSummarizerModel`, `configureModelSettings` |
| MCP tool management | ~500 | `getMcpTools`, `getMcpTool`, `createMcpConnection`, `convertToMCPToolConfig`, `applyToolOverrides` |
| Function tool management | ~280 | `getFunctionTools` (inline sandbox execution + approval) |
| Tool streaming lifecycle | ~200 | `wrapToolWithStreaming`, `sanitizeToolsForAISDK`, tool result recording |
| Tool approval flow | ~130 ×2 | Duplicated identically in `getMcpTools` and `getFunctionTools` |
| System prompt assembly | ~200 | `buildSystemPrompt`, `getPrompt`, `getResolvedContext` |
| LLM generation orchestration | ~400 | `generate`, `handleStreamGeneration`, `processStreamEvents`, `buildBaseGenerationConfig` |
| Compression | ~150 | `setupCompression`, `handlePrepareStepCompression`, `cleanupCompression` |
| Artifact/data component processing | ~300 | `enhanceToolResultWithStructureHints` (265 lines alone), `getArtifactTools`, `buildDataComponentsSchema` |
| Conversation history | ~70 | `buildConversationHistory` |
| Tool result formatting | ~50 | `formatToolResult` |
| Relation tool construction | ~60 | `getRelationTools`, `createRelationToolName`, `getRelationshipIdForTool` |

### 2.2 Instance State Audit

Every `this.X =` assignment in Agent.ts, with justification analysis:

| Field | Set at | Read at | Class-worthy? |
|---|---|---|---|
| `config` | constructor | everywhere | No — could be a function arg |
| `executionContext` | constructor | everywhere | No — could be a function arg |
| `credentialStoreRegistry` | constructor | tool methods | No — derived from constructor arg |
| `credentialStuffer` | constructor | MCP tools | No — derived |
| `contextResolver` | constructor | `getResolvedContext` | No — derived |
| `systemPromptBuilder` | field init | `buildSystemPrompt` | No — stateless |
| `artifactComponents` | constructor | many places | No — part of config |
| `mcpClientCache` | runtime | `getMcpTool` | **Per-request** — Agent is `new`'d each time |
| `mcpConnectionLocks` | runtime | `getMcpTool` | **Per-request** — same |
| `conversationId` | `setConversationId` | tool wrappers | No — set then read, could be threaded |
| `streamHelper` | `setupGenerationContext` | tool wrappers | No — same |
| `streamRequestId` | `setupGenerationContext` | tool wrappers | No — same |
| `isDelegatedAgent` | `setDelegationStatus` | tool wrappers | No — could be in config |
| `delegationId` | `setDelegationId` | history filters | No — could be in config |
| `currentCompressor` | `setupCompression` | compress tool | No — scoped to `generate()` |
| `functionToolRelationshipIdByName` | `getFunctionTools` | `getRelationshipIdForTool` | No — scoped to tool loading |

**Conclusion:** Zero fields justify a class. The MCP cache/locks are the closest, but they're per-request since Agent is instantiated per task.

### 2.3 Consumer Analysis

```
new Agent()  — 1 production call site (generateTaskHandler.ts:194)
                34 test call sites (Agent.test.ts, functionToolApprovals.test.ts)
```

Usage pattern:
```ts
agent = new Agent(config, executionContext, credentialStoreRegistry);
agent.setDelegationStatus(isDelegation);
agent.setDelegationId(delegationId);
const response = await agent.generate(task.input.parts, { ... });
agent.cleanupCompression();
```

Construct → set two flags → call one method → cleanup. This is a function call, not a class lifecycle.

### 2.4 Span Instrumentation Patterns

**Pattern A — Async traced operation (20+ occurrences):**
```ts
return tracer.startActiveSpan('name', { attributes }, async (span) => {
  try {
    const result = await doWork();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
});
```

**Pattern B — Fire-and-forget span (12 occurrences in approval flow):**
```ts
tracer.startActiveSpan('tool.approval_requested', {
  attributes: { 'tool.name': toolName, 'tool.callId': toolCallId, ... }
}, (span) => {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
});
```

**Pattern C — Teardown-with-span in executionHandler (4 occurrences):**
```ts
return tracer.startActiveSpan('execution_handler.execute', {}, async (span) => {
  try {
    span.setAttributes({ ... });
    setSpanWithError(span, new Error(errorMessage));
    await sseHelper.writeOperation(errorOp(...));
    if (task) await updateTask(runDbClient)({ taskId: task.id, data: { status: 'failed', ... } });
    await agentSessionManager.endSession(requestId);
    unregisterStreamHelper(requestId);
    return { success: false, error: errorMessage, iterations };
  } finally {
    span.end();
    await new Promise((resolve) => setImmediate(resolve));
    await flushBatchProcessor();
  }
});
```

### 2.5 Call Chain (Current)

```
HTTP Route
  → ExecutionHandler.execute()
    → A2AClient.sendMessage()  (via getInProcessFetch — same process)
      → A2A endpoint
        → generateTaskHandler (createTaskHandler closure)
          → new Agent(config, executionContext, credentialStoreRegistry)
          → agent.setDelegationStatus() / setDelegationId()
          → agent.generate(parts, runtimeContext)
            → loadToolsAndPrompts()
              → getMcpTools() / getFunctionTools() / getRelationTools() / getDefaultTools()
              → buildSystemPrompt()
            → buildConversationHistory()
            → configureModelSettings()
            → streamText() / generateText()
            → handleStreamGeneration() → processStreamEvents()
            → formatFinalResponse()
          → agent.cleanupCompression()
```

---

## 3. Target Architecture

### 3.1 Call Chain (After Refactor)

```
HTTP Route
  → ExecutionHandler.execute()
    → A2AClient.sendMessage()
      → A2A endpoint
        → generateTaskHandler (createTaskHandler closure)
          → buildAgentConfig(...)           [agentConfigBuilder.ts]
          → buildGenerationContext(...)      [inline in generateTaskHandler]
          → executeGeneration(ctx, parts)   [generationPipeline.ts]
            → resolveAllTools(ctx)          [toolResolver.ts → mcpToolResolver.ts]
            → buildSystemPrompt(ctx)        [SystemPromptBuilder — unchanged]
            → buildConversationHistory(ctx)
            → configureModelSettings(ctx)   [modelConfig.ts]
            → streamText() / generateText()
            → processStreamEvents()
            → formatResponse()
          → detectTransferResult(response)  [agentConfigBuilder.ts]
          → cleanup compression
```

### 3.2 GenerationContext — The Replacement for `this`

```ts
interface GenerationContext {
  // Immutable config (set once at construction)
  config: AgentConfig;
  executionContext: FullExecutionContext;
  credentialStoreRegistry?: CredentialStoreRegistry;
  credentialStuffer?: CredentialStuffer;
  contextResolver?: ContextResolver;

  // Per-request state (set during setup, read during execution)
  conversationId?: string;
  streamRequestId?: string;
  streamHelper?: StreamHelper;
  isDelegated: boolean;
  delegationId?: string;
  sessionId: string;

  // Per-request MCP infrastructure (scoped to one execution)
  mcpClientCache: Map<string, McpClient>;
  mcpConnectionLocks: Map<string, Promise<McpClient>>;
}
```

This is a plain object — not a class. It's created in `generateTaskHandler`, threaded through the pipeline, and discarded when the request completes.

### 3.3 New File Inventory

```
agents-api/src/domains/run/
├── agents/
│   ├── Agent.ts                    ← DELETED
│   ├── types.ts                    ← EXTENDED (GenerationContext + migrated types)
│   ├── toolResolver.ts             ← NEW (wrapping, approval, function/relation/default tools)
│   ├── mcpToolResolver.ts          ← NEW (MCP-specific: caching, connections, credentials, overrides)
│   ├── modelConfig.ts              ← NEW (model selection + validation)
│   ├── generationPipeline.ts       ← NEW (core generation orchestration)
│   ├── agentConfigBuilder.ts       ← NEW (AgentConfig construction + transfer detection)
│   ├── generateTaskHandler.ts      ← SIMPLIFIED (~80 lines)
│   ├── relationTools.ts            ← IMPORT CHANGE ONLY
│   ├── SystemPromptBuilder.ts      ← UNCHANGED
│   ├── ToolSessionManager.ts       ← UNCHANGED
│   └── versions/v1/PromptConfig.ts ← UNCHANGED
├── handlers/
│   └── executionHandler.ts         ← REFACTORED (error deduplication)
└── utils/
    ├── structureHints.ts           ← NEW (artifact structure hint analysis)
    └── tracer.ts                   ← EXTENDED (re-export withTracedSpan, emitSpan)

packages/agents-core/src/utils/
├── tracer-factory.ts               ← EXTENDED (withTracedSpan, emitSpan)
└── tracer.ts                       ← EXTENDED (re-export)
```

---

## 4. Phase Breakdown

### Phase 1: Span Instrumentation Helpers

**Problem:** 20+ identical try/catch/finally span blocks. 12 fire-and-forget span emissions.

**Changes:**

`packages/agents-core/src/utils/tracer-factory.ts` — add:

```ts
/**
 * Execute an async operation within a traced span. Automatically handles
 * status (OK on success, ERROR on throw), exception recording, and span.end().
 */
export async function withTracedSpan<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, options, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Emit a fire-and-forget span with OK status. Use for point-in-time events
 * (e.g., "approval requested", "max steps reached") that don't wrap work.
 */
export function emitSpan(
  tracer: Tracer,
  name: string,
  attributes: Record<string, any>
): void {
  const span = tracer.startSpan(name, { attributes });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
```

`packages/agents-core/src/utils/tracer.ts` — re-export both.

`agents-api/src/domains/run/utils/tracer.ts` — re-export both.

**Before:**
```ts
tracer.startActiveSpan('tool.approval_requested', {
  attributes: { 'tool.name': toolName, 'tool.callId': toolCallId, 'subAgent.id': this.config.id, 'subAgent.name': this.config.name }
}, (requestSpan: Span) => {
  requestSpan.setStatus({ code: SpanStatusCode.OK });
  requestSpan.end();
});
```

**After:**
```ts
emitSpan(tracer, 'tool.approval_requested', {
  'tool.name': toolName,
  'tool.callId': toolCallId,
  'subAgent.id': ctx.config.id,
  'subAgent.name': ctx.config.name,
});
```

**Before:**
```ts
return tracer.startActiveSpan('agent.load_tools', { attributes: { ... } }, async (childSpan) => {
  try {
    const result = await Promise.all([...]);
    childSpan.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    setSpanWithError(childSpan, errorObj);
    throw err;
  } finally {
    childSpan.end();
  }
});
```

**After:**
```ts
return withTracedSpan(tracer, 'agent.load_tools', { attributes: { ... } }, async () => {
  return Promise.all([...]);
});
```

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 2: GenerationContext Type

**Changes:**

Extend `agents-api/src/domains/run/agents/types.ts`:

```ts
import type { CredentialStoreRegistry, CredentialStuffer, FullExecutionContext, McpClient } from '@inkeep/agents-core';
import type { ContextResolver } from '../context';
import type { StreamHelper } from '../utils/stream-helpers';

export interface GenerationContext {
  config: AgentConfig;
  executionContext: FullExecutionContext;
  credentialStoreRegistry?: CredentialStoreRegistry;
  credentialStuffer?: CredentialStuffer;
  contextResolver?: ContextResolver;
  conversationId?: string;
  streamRequestId?: string;
  streamHelper?: StreamHelper;
  isDelegated: boolean;
  delegationId?: string;
  sessionId: string;
  mcpClientCache: Map<string, McpClient>;
  mcpConnectionLocks: Map<string, Promise<McpClient>>;
}
```

Also migrate type exports currently in `Agent.ts`:
- `AgentConfig`
- `DelegateRelation`
- `ExternalAgentRelationConfig`
- `TeamAgentRelationConfig`
- `ToolType`
- `ResolvedGenerationResponse`

**Verification:** `pnpm typecheck`

---

### Phase 3: Tool Resolver + MCP Tool Resolver

**Design rationale:** All tool types share the same wrapping (`wrapToolWithStreaming`), sanitization (`sanitizeToolsForAISDK`), and approval infrastructure (`handleToolApproval`). Function tools (~150 lines), relation tools (~80 lines), and default tools (~120 lines) are individually small with no unique infrastructure — splitting them into separate files would just create tiny files importing the same helpers. MCP is the exception: ~500 lines of genuinely distinct connection management, credential stuffing, and override logic.

#### 3a: `agents/toolResolver.ts` (~600 lines)

**Shared infrastructure:**

```ts
export function wrapToolWithStreaming(
  ctx: GenerationContext,
  toolName: string,
  toolDefinition: any,
  toolType?: ToolType,
  options?: { needsApproval?: boolean; mcpServerId?: string; mcpServerName?: string }
): any

export function sanitizeToolsForAISDK(tools: ToolSet): ToolSet

export async function handleToolApproval(params: {
  toolName: string;
  toolCallId: string;
  args: unknown;
  ctx: GenerationContext;
  providerMetadata?: any;
}): Promise<{ approved: boolean; reason?: string }>
```

**Tool builders:**

```ts
export async function resolveFunctionTools(
  ctx: GenerationContext,
  sessionId: string,
  streamRequestId?: string
): Promise<ToolSet>

export function buildRelationTools(
  ctx: GenerationContext,
  runtimeContext: RuntimeContext,
  sessionId?: string
): ToolSet

export async function buildDefaultTools(
  ctx: GenerationContext,
  streamRequestId?: string
): Promise<ToolSet>

export function createRelationToolName(prefix: string, targetId: string): string

export function getRelationshipIdForTool(
  config: AgentConfig,
  toolName: string,
  toolType?: ToolType
): string | undefined
```

**Orchestrator:**

```ts
export async function resolveAllTools(
  ctx: GenerationContext,
  sessionId: string,
  streamRequestId: string | undefined,
  runtimeContext: RuntimeContext
): Promise<{ tools: ToolSet; contextBreakdown: ContextBreakdown }>
```

#### 3b: `agents/mcpToolResolver.ts` (~500 lines)

```ts
export async function resolveMcpTools(
  ctx: GenerationContext,
  sessionId?: string,
  streamRequestId?: string
): Promise<ToolSet>

export async function resolveSingleMcpTool(
  ctx: GenerationContext,
  tool: McpTool
): Promise<{ tools: ToolSet; toolPolicies: Record<string, any>; mcpServerId: string; mcpServerName: string }>

export async function createMcpConnection(
  tool: McpTool,
  serverConfig: McpServerConfig
): Promise<McpClient>

export function convertToMCPToolConfig(
  tool: McpTool,
  agentToolRelationHeaders?: Record<string, string>
): MCPToolConfig

export async function applyToolOverrides(
  originalTools: ToolSet,
  mcpTool: McpTool
): Promise<ToolSet>
```

MCP client cache and connection locks are `Map` instances on `GenerationContext`, passed in — not module-level singletons.

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 4: Artifact Structure Hints

**New file: `agents-api/src/domains/run/utils/structureHints.ts`** (~265 lines)

```ts
export function enhanceToolResultWithStructureHints(
  result: any,
  toolCallId: string | undefined,
  artifactComponents: ArtifactComponentApiInsert[]
): any
```

Extracts `findAllPaths`, `findCommonFields`, `findUsefulSelectors`, `findNestedContentPaths` as module-private helpers. Zero dependency on agent state — pure data analysis.

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 5: Model Config

**New file: `agents-api/src/domains/run/agents/modelConfig.ts`** (~100 lines)

```ts
export function validateModel(modelString: string | undefined, modelType: string): string

export function getPrimaryModel(models?: Models): ModelSettings

export function getStructuredOutputModel(models?: Models): ModelSettings

export function getSummarizerModel(models?: Models): ModelSettings

export function configureModelSettings(config: AgentConfig): {
  primaryModelSettings: ModelSettings;
  modelSettings: any;
  hasStructuredOutput: boolean;
  timeoutMs: number;
}
```

Pure functions of the models config. No side effects.

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 6: Generation Pipeline

**New file: `agents-api/src/domains/run/agents/generationPipeline.ts`** (~400 lines)

**Public API:**

```ts
export async function executeGeneration(
  ctx: GenerationContext,
  userParts: Part[],
  runtimeContext: RuntimeContext
): Promise<ResolvedGenerationResponse>

export async function resolveGenerationResponse(
  response: Record<string, unknown>
): Promise<ResolvedGenerationResponse>

export function hasToolCallWithPrefix(prefix: string): (opts: { steps: any[] }) => boolean
```

**Internal pipeline steps** (not exported):

1. `setupStreamHelper()` — resolve stream helper from registry, set on context
2. `resolveAllTools()` — imported from `toolResolver.ts`
3. `buildSystemPrompt()` — delegates to `SystemPromptBuilder` (unchanged)
4. `buildConversationHistory()` — history retrieval + compression config
5. `configureModelSettings()` — imported from `modelConfig.ts`
6. `buildInitialMessages()` — system + history + user content (incl. multimodal)
7. `setupCompression()` — compressor initialization
8. `buildBaseGenerationConfig()` — AI SDK config assembly
9. `buildDataComponentsSchema()` — Zod schema for structured output
10. Stream or generate: `handleStreamGeneration()` / `generateText()`
11. `processStreamEvents()` — stream event loop
12. `handlePrepareStepCompression()` — mid-generation compression callback
13. `handleStopWhenConditions()` — step termination logic
14. `formatFinalResponse()` — response formatting with `ResponseFormatter`
15. `formatToolResult()` — tool result formatting for conversation history

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 7: AgentConfig Builder

**New file: `agents-api/src/domains/run/agents/agentConfigBuilder.ts`** (~150 lines)

```ts
/**
 * Build an AgentConfig from execution context and project data.
 * Replaces the ~110 lines of inline config construction in generateTaskHandler.
 */
export async function buildAgentConfig(params: {
  taskHandlerConfig: TaskHandlerConfig;
  credentialStoreRegistry?: CredentialStoreRegistry;
  forwardedHeaders?: Record<string, string>;
}): Promise<AgentConfig>

/**
 * Inspect a generation response for transfer tool calls.
 * Returns an A2ATaskResult if a transfer was detected, null otherwise.
 */
export function detectTransferResult(
  response: ResolvedGenerationResponse,
  textParts: string,
  taskId: string
): A2ATaskResult | null
```

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 8: Simplify generateTaskHandler

After phases 2-7, `createTaskHandler` becomes:

```ts
export const createTaskHandler = (
  config: TaskHandlerConfig,
  credentialStoreRegistry?: CredentialStoreRegistry
) => {
  return async (task: A2ATask): Promise<A2ATaskResult> => {
    try {
      // 1. Validate input parts
      const { textParts, hasImages, hasData } = validateTaskInput(task);
      if (!textParts.trim() && !hasImages && !hasData) {
        return failedResult('No content found in task input');
      }

      // 2. Build config and context
      const agentConfig = await buildAgentConfig({ taskHandlerConfig: config, credentialStoreRegistry, ... });
      const ctx = buildGenerationContext(agentConfig, config.executionContext, credentialStoreRegistry, task);

      // 3. Execute generation
      const response = await executeGeneration(ctx, task.input.parts, runtimeContext);

      // 4. Check for transfer
      const transferResult = detectTransferResult(response, textParts, task.id);
      if (transferResult) return transferResult;

      // 5. Return formatted result
      return buildSuccessResult(response);
    } catch (error) {
      return buildErrorResult(error);
    }
  };
};
```

~80 lines of pure orchestration.

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 9: Deduplicate ExecutionHandler Error Handling

**Current state:** 4 copies of ~35-line teardown blocks at lines 344-378, 611-661, 670-709, 717-757.

**Extract to:**

```ts
async function handleExecutionFailure(params: {
  errorMessage: string;
  sseHelper: StreamHelper;
  task: any;
  requestId: string;
  currentAgentId: string;
  agentName?: string;
  iterations: number;
  triggerEval?: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    resolvedRef: any;
  };
}): Promise<ExecutionResult> {
  return withTracedSpan(tracer, 'execution_handler.execute', {}, async (span) => {
    span.setAttributes({
      'ai.response.content': 'Hmm.. It seems I might be having some issues right now. Please clear the chat and try again.',
      'ai.response.timestamp': new Date().toISOString(),
      'subAgent.name': params.agentName,
      'subAgent.id': params.currentAgentId,
    });
    setSpanWithError(span, new Error(params.errorMessage));

    await params.sseHelper.writeOperation(errorOp(params.errorMessage, params.currentAgentId || 'system'));

    if (params.task) {
      await updateTask(runDbClient)({
        taskId: params.task.id,
        data: {
          status: 'failed',
          metadata: { ...params.task.metadata, failed_at: new Date().toISOString(), error: params.errorMessage },
        },
      });
    }

    await agentSessionManager.endSession(params.requestId);
    unregisterStreamHelper(params.requestId);

    if (params.triggerEval) {
      triggerConversationEvaluation(params.triggerEval).catch((e) =>
        logger.error({ error: e }, 'Failed to trigger evaluation (non-blocking)')
      );
    }

    return { success: false, error: params.errorMessage, iterations: params.iterations };
  });
}
```

Each of the 4 call sites becomes a single `return handleExecutionFailure({ ... })` call.

**Verification:** `pnpm typecheck && pnpm test --run`

---

### Phase 10: Delete Agent Class

1. Delete `agents-api/src/domains/run/agents/Agent.ts`
2. Verify all imports resolve to new locations:
   - Types → `types.ts`
   - `resolveGenerationResponse`, `hasToolCallWithPrefix` → `generationPipeline.ts`
   - `validateModel` → `modelConfig.ts`
3. Update test files:
   - `Agent.test.ts` → test extracted modules directly
   - `functionToolApprovals.test.ts` → updated imports
4. Update `relationTools.ts` import: `from './Agent'` → `from './types'`

**Verification:** `pnpm check` (full suite: lint + typecheck + test + format)

---

## 5. Execution Order & Dependencies

```
Phase 1 (spans)  ─────────────────────────────────────────┐
Phase 2 (types)  ──────────────────────────────┐          │
Phase 3 (tool resolvers) ─────────────────┐    │          │
Phase 4 (structure hints) ────────────┐    │    │          │
Phase 5 (model config) ──────────┐    │    │    │          │
                                  │    │    │    │          │
                                  └────┴────┴────┘          │
                                        │                   │
                                  Phase 6 (pipeline)        │
                                        │                   │
                                  Phase 7 (config builder)  │
                                        │                   │
                                  Phase 8 (simplify handler)│
                                        │                   │
Phase 9 (exec handler dedup) ←──────────┼───────────────────┘
                                        │
                                  Phase 10 (delete Agent.ts)
```

- **Phases 1-5** are independent. Can be done in any order, or in parallel.
- **Phase 6** depends on 2-5 (needs GenerationContext, tool resolvers, model config, structure hints).
- **Phases 7-8** depend on 6 (generateTaskHandler calls executeGeneration).
- **Phase 9** depends only on Phase 1 (uses `withTracedSpan`). Independent from 2-8.
- **Phase 10** depends on all others.

Each phase follows the pattern:
1. Create new file with extracted functions
2. Update `Agent.ts` to import and delegate (intermediate step — Agent still exists but thins)
3. Verify: `pnpm typecheck && pnpm test --run`

---

## 6. Parallel Delegation Readiness

### 6.1 How Delegation Works Today

`createDelegateToAgentTool` (in `relationTools.ts`) is a standard AI SDK tool. When the LLM calls `delegate_to_agent_x`:

1. Sends a **synchronous** A2A `sendMessage` to the target agent
2. **Blocks until the delegated agent fully completes**
3. Returns the complete result as a tool result
4. The LLM processes the result and decides next steps

This is fundamentally serial — one delegation at a time, full completion before the next.

### 6.2 What This Refactor Enables

| Blocker | Current State | After Refactor |
|---|---|---|
| Shared mutable state | `this.streamHelper`, `this.isDelegatedAgent` etc. — parallel delegations would fight over these | `GenerationContext` is an immutable object; create independent contexts per delegation |
| Tool wrapping in one place | Wrapping logic scattered across `getMcpTools`, `getFunctionTools`, etc. | `toolResolver.ts` is the single coordination point for tool lifecycle |
| Pluggable step hooks | `handleStopWhenConditions` and `handlePrepareStepCompression` exist but are tightly bound to `this` | Pipeline functions with explicit context — can inject "check parallel results" steps |
| Stream multiplexing | One `StreamHelper` per request; delegated agents suppress streaming entirely | `GenerationContext` explicitly carries `streamHelper` and `delegationId` — each parallel delegation can have its own tagged context |

### 6.3 Gaps for Future Parallel Delegation Work

These are **out of scope for this refactor** but documented here for planning:

**Gap 1: Non-blocking delegation tool.** `createDelegateToAgentTool` needs a variant that:
- Kicks off delegation without awaiting completion
- Returns a handle/delegation ID immediately
- Streams incremental results back via a channel the parent can read

This is a new tool mode in `relationTools.ts`. The refactored `toolResolver.ts` can wire it up identically.

**Gap 2: Stream multiplexer.** Currently one `StreamHelper` per SSE connection. Parallel streaming requires:
- Fan-in from multiple agent streams onto one user-facing connection (tagged by delegation ID)
- Parent agent's generation loop receiving partial results mid-generation

This is new infrastructure in `stream-helpers.ts` / `AgentSession.ts`. The refactored architecture makes it straightforward because `GenerationContext` explicitly carries stream identity.

**Gap 3: React-to-partial in generation loop.** The parent LLM needs to receive and react to partial delegation results during generation. This could work through `prepareStep` injecting partial results into the message history, which is already a pluggable function in the pipeline.

---

## 7. Verification Strategy

### Per-Phase

```bash
pnpm typecheck   # Types resolve correctly
pnpm test --run  # All existing tests pass
pnpm lint        # No new lint violations
```

### Final (after Phase 10)

```bash
pnpm check       # Full suite: lint + typecheck + test + format:check + env-descriptions + knip
```

### Regression Indicators

- All span attributes in SigNoz traces remain identical (same keys, same values)
- All SSE stream events remain identical (same order, same payloads)
- All `agentSessionManager.recordEvent` calls produce the same event data
- All tool approval flows behave identically (request → wait → approve/deny → execute/return)
- All conversation history messages stored with same structure
- All MCP connections cached and reused identically

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Test imports break during migration | High | Low | Each phase verifies `pnpm test --run`; fix imports incrementally |
| Subtle `this` binding bugs | Medium | Medium | Audit every `this.X` access; TypeScript will catch most issues at compile time |
| MCP client cache behavior changes | Low | High | Cache is now on `GenerationContext` instead of `this` — functionally identical since Agent was per-request; verify with MCP tool tests |
| Tool approval flow regression | Low | High | Approval is copy-pasted today; extracting to shared function reduces risk vs. maintaining two copies |
| Span attribute drift | Low | Medium | Compare SigNoz traces before/after on a test conversation |
