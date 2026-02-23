# Plan: Decompose Agent.ts & Improve Span Instrumentation

## Goal

Eliminate the `Agent` class entirely. Replace it with a pipeline of focused, stateless modules coordinated by `generateTaskHandler`. Extract a `withTracedSpan` helper to eliminate boilerplate span instrumentation across all files.

## Guiding Principles

- **No behavioral changes** — this is a pure structural refactor. All inputs/outputs, stream events, span attributes, and error handling remain identical.
- **Explicit data flow** — replace `this.X` implicit state with a `GenerationContext` object threaded through functions.
- **Each file does one thing** — every new module has a single, testable responsibility.
- **Don't split for splitting's sake** — only create separate files when there's genuinely distinct infrastructure or shared logic that warrants it.
- **Instrumentation is declarative** — span creation/error/cleanup handled by a reusable helper, not copy-pasted everywhere.

## Phase 1: Span Instrumentation Helper

**Problem:** 20+ instances of this pattern across Agent.ts, executionHandler.ts, AgentSession.ts, ResponseFormatter.ts, ContextResolver.ts:

```ts
return tracer.startActiveSpan('some.operation', { attributes: { ... } }, async (span) => {
  try {
    // ... business logic ...
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
    // sometimes: await flushBatchProcessor();
  }
});
```

**Solution:** Add `withTracedSpan` to `packages/agents-core/src/utils/tracer-factory.ts`:

```ts
export async function withTracedSpan<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions & { flushAfter?: boolean },
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
```

Also add a sync variant `emitSpan` for fire-and-forget spans (used heavily in approval flow):

```ts
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

**Files changed:**
- `packages/agents-core/src/utils/tracer-factory.ts` — add `withTracedSpan`, `emitSpan`
- `packages/agents-core/src/utils/tracer.ts` — re-export
- `agents-api/src/domains/run/utils/tracer.ts` — re-export

## Phase 2: Extract GenerationContext Type

Create the shared context object that replaces `this.*` state.

**Extend existing file: `agents-api/src/domains/run/agents/types.ts`**

```ts
export interface GenerationContext {
  config: AgentConfig;
  executionContext: FullExecutionContext;
  conversationId?: string;
  streamRequestId?: string;
  streamHelper?: StreamHelper;
  isDelegated: boolean;
  delegationId?: string;
  sessionId: string;
  credentialStoreRegistry?: CredentialStoreRegistry;
  credentialStuffer?: CredentialStuffer;
  contextResolver?: ContextResolver;
}
```

This replaces 16 `this.*` fields. Every extracted module takes `GenerationContext` (or a subset) as its first argument.

## Phase 3: Extract Tool Resolver

**Why one file instead of four:** All tool types (MCP, function, relation, default) share the same wrapping infrastructure (`wrapToolWithStreaming`, `sanitizeToolsForAISDK`) and the same approval flow (`handleToolApproval`). Relation tools (~80 lines), default tools (~120 lines), and function tools (~150 lines) are individually small and don't have distinct infrastructure to justify their own files. Splitting them would just create tiny files that all import the same helpers from each other.

**New file: `agents-api/src/domains/run/agents/toolResolver.ts`**

Contains all shared tool infrastructure + the small tool builders:

- `wrapToolWithStreaming()` — streaming lifecycle wrapper used by all tool types
- `sanitizeToolsForAISDK()` — tool name sanitization
- `handleToolApproval()` — shared approval flow (deduplicated from MCP + function tools, ~130 lines saved)
- `resolveFunctionTools()` — function tool resolution + sandbox execution
- `buildRelationTools()` — transfer/delegate relation tool construction
- `buildDefaultTools()` — artifact retrieval, skill loading, compress_context tools
- `createRelationToolName()`, `getRelationshipIdForTool()` — name/relationship helpers
- `resolveAllTools()` — parallel tool loading orchestrator (currently `loadToolsAndPrompts`)

**Why MCP is separate:** MCP tool resolution has ~500 lines of genuinely distinct infrastructure — client caching, connection locks, credential stuffing, Composio URL building, tool overrides with JSON transformation, connection health checks. None of this is shared with other tool types. It's called by `toolResolver.ts` but knows nothing about function/relation/default tools.

**New file: `agents-api/src/domains/run/agents/mcpToolResolver.ts`**

MCP-specific infrastructure only:

- `resolveMcpTools()` — top-level MCP tool resolution (iterates MCP tools, wraps results)
- `resolveSingleMcpTool()` — single tool resolution with credential/cache logic
- `createMcpConnection()` — connection establishment with error handling
- `convertToMCPToolConfig()` — DB McpTool → MCPToolConfig conversion
- `applyToolOverrides()` — schema/description/transformation overrides
- MCP client cache + connection lock management (Maps passed in, not instance state)

~500 lines extracted.

## Phase 4: Extract Artifact Structure Hints

**New file: `agents-api/src/domains/run/utils/structureHints.ts`**

Extracts from Agent.ts:
- `enhanceToolResultWithStructureHints()` → `enhanceToolResultWithStructureHints(result, toolCallId, artifactComponents)`
- Inner helpers: `findAllPaths`, `findCommonFields`, `findUsefulSelectors`, `findNestedContentPaths`

~265 lines extracted. This is pure data analysis with zero dependency on agent state — it only needs `result`, `toolCallId`, and `artifactComponents`.

## Phase 5: Extract Model Config

**New file: `agents-api/src/domains/run/agents/modelConfig.ts`**

Extracts from Agent.ts:
- `getPrimaryModel()` → `getPrimaryModel(models)`
- `getStructuredOutputModel()` → `getStructuredOutputModel(models)`
- `getSummarizerModel()` → `getSummarizerModel(models)`
- `validateModel()` → `validateModel(modelString, modelType)`
- `configureModelSettings()` → `configureModelSettings(config)`

~100 lines. These are pure functions of the models config with no dependencies on agent state.

## Phase 6: Extract Generation Pipeline

Replace the `generate()` method with a pipeline of functions.

**New file: `agents-api/src/domains/run/agents/generationPipeline.ts`**

This is the core replacement for `Agent.generate()`. Exports a single function:

```ts
export async function executeGeneration(
  ctx: GenerationContext,
  userParts: Part[],
  runtimeContext: RuntimeContext
): Promise<ResolvedGenerationResponse>
```

Internally calls the focused helpers in sequence:
1. `setupGenerationContext()` — set stream helper, conversation ID
2. `resolveAllTools()` — from `toolResolver.ts`, calls MCP/function/relation/default in parallel
3. `buildSystemPrompt()` — prompt assembly (already mostly standalone via `SystemPromptBuilder`)
4. `buildConversationHistory()` — history retrieval
5. `configureModelSettings()` — from `modelConfig.ts`
6. `buildMessages()` — system + history + user content
7. `setupCompression()` — compressor initialization
8. `runGeneration()` — `streamText`/`generateText` call
9. `formatResponse()` — response formatting

Also contains (private to this file):
- `buildDataComponentsSchema()`
- `handleStreamGeneration()`
- `processStreamEvents()`
- `handlePrepareStepCompression()`
- `handleStopWhenConditions()`
- `buildInitialMessages()`
- `buildUserMessageContent()`
- `formatFinalResponse()`
- `resolveGenerationResponse()`
- `hasToolCallWithPrefix()`
- `formatToolResult()`

## Phase 7: Extract AgentConfig Builder

**Refactor: `agents-api/src/domains/run/agents/generateTaskHandler.ts`**

Extract the ~110-line inline AgentConfig construction (lines 193-300) into:

**New file: `agents-api/src/domains/run/agents/agentConfigBuilder.ts`**

```ts
export async function buildAgentConfig(params: {
  executionContext: FullExecutionContext;
  subAgentId: string;
  baseUrl: string;
  apiKey?: string;
  // ... other task handler config fields
  credentialStoreRegistry?: CredentialStoreRegistry;
}): Promise<AgentConfig>
```

Also extract the transfer detection logic (lines 394-499) into:

```ts
export function detectTransferResult(response: ResolvedGenerationResponse, textParts: string): A2ATaskResult | null
```

This shrinks `createTaskHandler` from ~490 lines to ~80 lines of orchestration.

## Phase 8: Simplify generateTaskHandler

After all extractions, `createTaskHandler` becomes a thin orchestrator:

```ts
export const createTaskHandler = (config, credentialStoreRegistry?) => {
  return async (task: A2ATask): Promise<A2ATaskResult> => {
    // 1. Validate input
    // 2. Build AgentConfig (from agentConfigBuilder)
    // 3. Build GenerationContext
    // 4. Set delegation status on context
    // 5. Call executeGeneration(ctx, parts, runtimeContext)
    // 6. Check for transfer (detectTransferResult)
    // 7. Return formatted result
    // 8. Cleanup
  };
};
```

No `new Agent()`. No class. Just functions.

## Phase 9: Deduplicate ExecutionHandler Error Handling

**Refactor: `agents-api/src/domains/run/handlers/executionHandler.ts`**

Extract the 4 duplicated teardown blocks into:

```ts
async function handleExecutionFailure(params: {
  errorMessage: string;
  sseHelper: StreamHelper;
  task: any;
  requestId: string;
  currentAgentId: string;
  agentName?: string;
  iterations: number;
  triggerEval?: { tenantId; projectId; conversationId; resolvedRef };
}): Promise<ExecutionResult>
```

This consolidates 4 × ~35 lines into 1 × ~35 lines called 4 times. Uses `withTracedSpan` from Phase 1 internally.

## Phase 10: Delete Agent Class

After all phases complete, `Agent.ts` is deleted entirely. Its exports (`AgentConfig`, `DelegateRelation`, `ExternalAgentRelationConfig`, etc.) move to `types.ts`. The `resolveGenerationResponse` and `hasToolCallWithPrefix` utility functions move to `generationPipeline.ts`.

**Exports migration:**
- Types (`AgentConfig`, `DelegateRelation`, `ExternalAgentRelationConfig`, `TeamAgentRelationConfig`, `ToolType`, `ResolvedGenerationResponse`) → `agents-api/src/domains/run/agents/types.ts`
- `resolveGenerationResponse` → `agents-api/src/domains/run/agents/generationPipeline.ts`
- `hasToolCallWithPrefix` → `agents-api/src/domains/run/agents/generationPipeline.ts`
- `validateModel` → `agents-api/src/domains/run/agents/modelConfig.ts`

## New File Inventory

| File | Responsibility | Lines (est) |
|---|---|---|
| `agents-core/.../tracer-factory.ts` | `withTracedSpan`, `emitSpan` additions | +40 |
| `agents/types.ts` (extend) | `GenerationContext` + migrated types | +60 |
| `agents/toolResolver.ts` | All tool resolution: wrapping, approval, function/relation/default tools, orchestration | ~600 |
| `agents/mcpToolResolver.ts` | MCP-specific: client caching, connections, credentials, overrides | ~500 |
| `utils/structureHints.ts` | Artifact structure hint analysis | ~265 |
| `agents/modelConfig.ts` | Model selection + validation | ~100 |
| `agents/generationPipeline.ts` | Core generation orchestration | ~400 |
| `agents/agentConfigBuilder.ts` | AgentConfig construction + transfer detection | ~150 |

## Files Modified

| File | Change |
|---|---|
| `Agent.ts` | **Deleted** |
| `generateTaskHandler.ts` | Rewritten to use pipeline functions (~80 lines) |
| `executionHandler.ts` | Deduplicated error handling (~-100 lines) |
| `relationTools.ts` | Import types from `types.ts` instead of `Agent.ts` |
| `Agent.test.ts` | Updated imports, test function modules directly |
| `functionToolApprovals.test.ts` | Updated imports |

## Execution Order

Phases 1-5 are independent extractions — can be done in any order without breaking anything. Each phase:
1. Create new file with extracted functions
2. Update Agent.ts to import and delegate to new file
3. Run `pnpm typecheck && pnpm test --run` to verify

Phase 6 depends on 2-5. Phase 7-8 depend on 6. Phase 9 is independent. Phase 10 is last.

## Verification

After each phase:
```bash
pnpm typecheck   # types still check
pnpm test --run  # existing tests pass
pnpm lint        # no new lint issues
```

After Phase 10 (final):
```bash
pnpm check       # full verification suite
```
