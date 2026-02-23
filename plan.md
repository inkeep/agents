# Plan: Decompose Agent.ts & Improve Span Instrumentation

## Goal

Eliminate the `Agent` class entirely. Replace it with a pipeline of focused, stateless modules coordinated by `generateTaskHandler`. Extract a `withTracedSpan` helper to eliminate boilerplate span instrumentation across all files.

## Guiding Principles

- **No behavioral changes** — this is a pure structural refactor. All inputs/outputs, stream events, span attributes, and error handling remain identical.
- **Explicit data flow** — replace `this.X` implicit state with a `GenerationContext` object threaded through functions.
- **Each file does one thing** — every new module has a single, testable responsibility.
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

**New file: `agents-api/src/domains/run/agents/types.ts`** (extend existing):

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

## Phase 3: Extract Tool Approval Handler

**Problem:** ~130 lines of identical approval logic duplicated between `getMcpTools` (lines 898-1029) and `getFunctionTools` (lines 1531-1658).

**New file: `agents-api/src/domains/run/agents/toolApproval.ts`**

Exports:

```ts
export async function handleToolApproval(params: {
  toolName: string;
  toolCallId: string;
  args: unknown;
  ctx: GenerationContext;
}): Promise<{ approved: boolean; reason?: string }>
```

Contains the full approval flow: emit `tool.approval_requested` span, stream approval request (or publish via `toolApprovalUiBus` for delegated agents), `waitForApproval`, emit approved/denied span, return result.

**Impact:** Removes ~130 duplicated lines from Agent.ts. Both MCP and function tool wrappers call the same function.

## Phase 4: Extract Tool Resolvers

Split the 3 tool-loading methods into focused modules.

### 4a: MCP Tool Resolver

**New file: `agents-api/src/domains/run/agents/mcpToolResolver.ts`**

Extracts from Agent.ts:
- `getMcpTools()` → `resolveMcpTools(ctx, sessionId, streamRequestId)`
- `getMcpTool()` → `resolveSingleMcpTool(ctx, tool, clientCache, connectionLocks)`
- `createMcpConnection()` → `createMcpConnection(tool, serverConfig)`
- `convertToMCPToolConfig()` → `convertToMCPToolConfig(tool, headers)`
- `applyToolOverrides()` → `applyToolOverrides(originalTools, mcpTool)`
- MCP client cache + connection lock management (simple Map passed in, not instance state)

~600 lines extracted.

### 4b: Function Tool Resolver

**New file: `agents-api/src/domains/run/agents/functionToolResolver.ts`**

Extracts from Agent.ts:
- `getFunctionTools()` → `resolveFunctionTools(ctx, sessionId, streamRequestId)`
- Uses `handleToolApproval` from Phase 3 instead of inline approval logic

~280 lines extracted (shrinks to ~150 with shared approval handler).

### 4c: Relation Tool Builder

**New file: `agents-api/src/domains/run/agents/relationToolBuilder.ts`**

Extracts from Agent.ts:
- `getRelationTools()` → `buildRelationTools(ctx, runtimeContext, sessionId)`
- `#createRelationToolName()` → `createRelationToolName(prefix, targetId)`
- `#getRelationshipIdForTool()` → `getRelationshipIdForTool(config, toolName, toolType)`

~80 lines extracted.

### 4d: Default Tool Builder

**New file: `agents-api/src/domains/run/agents/defaultToolBuilder.ts`**

Extracts from Agent.ts:
- `getDefaultTools()` → `buildDefaultTools(ctx, streamRequestId)`
- `getArtifactTools()` → `buildArtifactRetrievalTool(ctx)`
- `#createLoadSkillTool()` → `buildLoadSkillTool(skills)`
- `compress_context` tool creation

~120 lines extracted.

## Phase 5: Extract Tool Streaming Wrapper

**New file: `agents-api/src/domains/run/agents/toolStreamingWrapper.ts`**

Extracts from Agent.ts:
- `wrapToolWithStreaming()` → `wrapToolWithStreaming(ctx, toolName, toolDef, streamRequestId, toolType, options)`
- `sanitizeToolsForAISDK()` → `sanitizeToolsForAISDK(tools)`

~200 lines extracted. Used by all 4 tool resolvers.

## Phase 6: Extract Artifact Structure Hints

**New file: `agents-api/src/domains/run/utils/structureHints.ts`**

Extracts from Agent.ts:
- `enhanceToolResultWithStructureHints()` → `enhanceToolResultWithStructureHints(result, toolCallId, artifactComponents)`
- Inner helpers: `findAllPaths`, `findCommonFields`, `findUsefulSelectors`, `findNestedContentPaths`

~265 lines extracted. This is pure data analysis with zero dependency on agent state — it only needs `result`, `toolCallId`, and `artifactComponents`.

## Phase 7: Extract Generation Pipeline

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
2. `loadAllTools()` — calls MCP, function, relation, default tool resolvers in parallel
3. `buildSystemPrompt()` — prompt assembly (already mostly standalone via `SystemPromptBuilder`)
4. `buildConversationHistory()` — history retrieval
5. `configureModelSettings()` — model selection, timeouts
6. `buildMessages()` — system + history + user content
7. `setupCompression()` — compressor initialization
8. `runGeneration()` — `streamText`/`generateText` call
9. `formatResponse()` — response formatting

Each of these is a focused function in the same file or imported from existing modules.

Also extracts:
- `buildDataComponentsSchema()` → stays here or in utils
- `handleStreamGeneration()` → `handleStreamGeneration(ctx, streamResult, sessionId, contextId, hasStructuredOutput)`
- `processStreamEvents()` → `processStreamEvents(streamResult, parser)`
- `handlePrepareStepCompression()` → `handlePrepareStepCompression(stepMessages, compressor, originalMessageCount, fullContextSize)`
- `handleStopWhenConditions()` → `handleStopWhenConditions(ctx, steps)`
- `configureModelSettings()` → `configureModelSettings(config)`
- `buildInitialMessages()` → `buildInitialMessages(systemPrompt, conversationHistory, userMessage, imageParts)`
- Model getters (`getPrimaryModel`, `getStructuredOutputModel`, `getSummarizerModel`) → `agents-api/src/domains/run/agents/modelConfig.ts`

## Phase 8: Extract AgentConfig Builder

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

## Phase 9: Simplify generateTaskHandler

After all extractions, `createTaskHandler` becomes a thin orchestrator:

```ts
export const createTaskHandler = (config, credentialStoreRegistry?) => {
  return async (task: A2ATask): Promise<A2ATaskResult> => {
    // 1. Validate input
    // 2. Build AgentConfig (from agentConfigBuilder)
    // 3. Build GenerationContext
    // 4. Set delegation status
    // 5. Call executeGeneration(ctx, parts, runtimeContext)
    // 6. Check for transfer (detectTransferResult)
    // 7. Return formatted result
    // 8. Cleanup
  };
};
```

No `new Agent()`. No class. Just functions.

## Phase 10: Deduplicate ExecutionHandler Error Handling

**Refactor: `agents-api/src/domains/run/handlers/executionHandler.ts`**

Extract the 4 duplicated teardown blocks into:

```ts
async function handleExecutionFailure(params: {
  errorMessage: string;
  span?: Span;
  sseHelper: StreamHelper;
  task: any;
  requestId: string;
  currentAgentId: string;
  agentName?: string;
  iterations: number;
  triggerEval?: { tenantId; projectId; conversationId; resolvedRef };
}): Promise<ExecutionResult>
```

This consolidates 4 × ~35 lines into 1 × ~35 lines called 4 times.

## Phase 11: Delete Agent Class

After all phases complete, `Agent.ts` is deleted entirely. Its exports (`AgentConfig`, `DelegateRelation`, `ExternalAgentRelationConfig`, etc.) move to `types.ts`. The `resolveGenerationResponse` and `hasToolCallWithPrefix` utility functions move to appropriate utility files.

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
| `agents/toolApproval.ts` | Shared tool approval flow | ~130 |
| `agents/mcpToolResolver.ts` | MCP tool resolution + client management | ~500 |
| `agents/functionToolResolver.ts` | Function tool resolution + sandbox | ~150 |
| `agents/relationToolBuilder.ts` | Transfer/delegate relation tools | ~80 |
| `agents/defaultToolBuilder.ts` | Default tools (artifact, skill, compress) | ~120 |
| `agents/toolStreamingWrapper.ts` | Tool streaming lifecycle + sanitization | ~200 |
| `utils/structureHints.ts` | Artifact structure hint analysis | ~265 |
| `agents/generationPipeline.ts` | Core generation orchestration | ~400 |
| `agents/modelConfig.ts` | Model selection + validation | ~100 |
| `agents/agentConfigBuilder.ts` | AgentConfig construction from project data | ~150 |

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

Phases 1-6 are independent extractions — can be done in any order (and some in parallel) without breaking anything. Each phase:
1. Create new file with extracted functions
2. Update Agent.ts to import and delegate to new file
3. Run `pnpm typecheck && pnpm test --run` to verify

Phase 7 depends on 2-6. Phase 8-9 depend on 7. Phase 10 is independent. Phase 11 is last.

## Verification

After each phase:
```bash
pnpm typecheck   # types still check
pnpm test --run  # existing tests pass
pnpm lint        # no new lint issues
```

After Phase 11 (final):
```bash
pnpm check       # full verification suite
```
