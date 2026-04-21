---
title: Reactive Mid-Generation Compression + Artifact Exclusion
status: ready-for-implementation
created: 2026-04-14
finalized: 2026-04-14
baseline_commit: a074f63cd
owners:
  - tim
---

# Reactive Mid-Generation Compression + Artifact Exclusion

**Baseline commit:** a074f63cd
**Scope:** `agents-api` mid-generation compression + artifact inclusion paths.
**Out of scope:** conversation-history (pre-generation) compression; work-apps; eval service.

---

## 1. Problem Statement (SCR)

**Situation.** `agents-api` uses the Vercel AI SDK's multi-step `generateText` / `streamText` loops against Anthropic and OpenAI. Two compression strategies protect the context window: (A) **pre-generation conversation-history compression** runs once before the generation loop, triggered by a token-budget prediction; (B) **mid-generation compression** runs between steps via the AI SDK `prepareStep` callback, also triggered by token-budget prediction against the previous step's actual usage.

**Complication.** Mid-generation compression has two problems:

1. **Over-eager token-budget triggering.** Compression fires on prediction at 75–91% of the model's context (tiered by model size). This compresses many calls that would have succeeded. Each needless compression is costly: an extra LLM summarization call, destructive loss of detail (decisions, open questions, next_steps become the canonical representation of history), and injection of a synthetic user message that shifts the agent's state.
2. **Oversized tool results still reach the LLM.** Oversized detection happens at `artifact-utils.ts:72-114` (detection returns a warning string). The `_oversizedWarning` field is injected into `summaryData` at `BaseCompressor.ts:407` (during compression) and at `ArtifactService.ts:751` (during artifact persistence). These downstream writes affect artifact storage and compressor behavior — but the **initial tool execution path** (`tool-wrapper.ts:111`: `toModelOutput: ({ output }) => buildToolResultForModelInput(output)`) has no oversized-output check. The raw tool output reaches the LLM as-is. The only existing exclusion is `default-tools.ts:214-246`, which handles **retrieval via the `get_reference_artifact` tool**, not first-exposure tool results.

**Resolution.** Make mid-gen compression **reactive**: compress only when the LLM provider actually returns a context-overflow error. Implement via AI SDK `wrapLanguageModel` middleware so retry happens inside a single `doGenerate`/`doStream` call — the multi-step loop is not disturbed. Simultaneously, **exclude oversized tool outputs** at `tool-wrapper.ts`'s `toModelOutput` seam: run oversized detection on the raw tool output and substitute a structured error-shaped tool result (matching the shape at `default-tools.ts:214-246`) before the AI SDK sees the bloat. Pre-generation conversation-history compression is unchanged and acts as a safety net for cases where context accretes from non-tool-result sources (long user messages, long system prompts, etc.).

---

## 2. Goals & Non-Goals

### Goals

- Eliminate false-positive mid-generation compressions. Compression fires only on real provider overflow.
- Oversized artifacts never contribute bytes to the LLM prompt.
- Preserve the Vercel AI SDK multi-step loop (step counting, tool-call accumulation, `onStepFinish`, `prepareStep`) unchanged.
- Preserve streaming TTFT (time-to-first-token) within microseconds of an unwrapped model on the happy path.
- Cover Anthropic and OpenAI providers for overflow detection.

### Non-Goals (this spec)

- Changing pre-generation conversation-history compression (`NEVER`-tagged; the current behavior is the intended contract).
- Building an agent-callable artifact retrieval tool (`NOT NOW`; the stub does not advertise retrieval, but an equivalent tool can be added in a future spec without breaking this one).
- Supporting Bedrock / Azure / Google provider overflow detection (`NOT NOW`; initial providers are Anthropic and OpenAI, which cover current production paths).
- Introducing a feature flag / gradual rollout (`NEVER` for this change — user directive: swap wholesale).
- Auto-reducing `max_tokens` on retry (`NEVER`; operator config controls `max_tokens`).

---

## 3. Personas

- **Agent Builder (customer).** Builds agents via SDK or manage-ui. Expects agents to maintain coherent context across tool calls. Directly affected when compression loses detail on calls that would have succeeded.
- **End User (customer).** Chats with a deployed agent. Notices coherence loss as "the agent forgot what we were doing." Experience degrades when compression fires needlessly.
- **Platform Operator (internal).** Runs the agent runtime. Cares about per-request latency, LLM cost (every compression is an extra call), and observability.

---

## 4. Current State → Target State

### Current state
- `prepareStep` callback in `ai-sdk-callbacks.ts` triggers compression via `MidGenerationCompressor.isCompressionNeededFromActualUsage(totalTokens)` based on previous step's usage and a per-model threshold (75%/83%/91%). Compression summarizes message stack into a synthetic user message.
- `detectOversizedArtifact` in `artifact-utils.ts:72-114` only **detects** oversized data and returns a warning string. The `_oversizedWarning` gets injected into `summaryData` at `BaseCompressor.ts:407` (compression time) and `ArtifactService.ts:751` (artifact-persist time).
- Initial tool execution path: `tool-wrapper.ts:111` sets `toModelOutput: ({ output }) => buildToolResultForModelInput(output)`. Raw tool output is what reaches the LLM. No oversized check here.
- Retrieval path: `default-tools.ts:214-246` already returns a `retrieval_blocked` stub when `get_reference_artifact` is called on an oversized artifact. This works only for retrieval, not first-exposure.
- Non-streaming call at `generate.ts:318-320` and streaming call at `generate.ts:309` have no retry wrapper for overflow errors; `handleGenerationError` at `generate.ts:126-143` only cleans up compressor state.

### Target state
- `prepareStep` callback no longer triggers compression. The token-budget branch of `handlePrepareStepCompression` is removed. Existing `prepareStep` wiring at `generate.ts:85-98` is retained; only the compression branch goes away.
- The compression **mechanism** (`MidGenerationCompressor`, `ConversationCompressor`, `BaseCompressor`, etc.) remains — reused by the middleware retry path.
- The agent's language model is wrapped with `wrapLanguageModel({ model, middleware: [compressionRetryMiddleware(ctx)] })` **per-request** (closure captures the run-scoped compressor / compression context). Applied at both the non-streaming and streaming call sites.
- Middleware behavior:
  - `wrapGenerate`: try `doGenerate()` (nullary in `@ai-sdk/provider@3.0.4`). On `isContextOverflowError(err)`, compress `params.prompt` → call `options.model.doGenerate(modifiedParams)` once directly. Second failure propagates.
  - `wrapStream`: call `doStream()` internally; peek first chunk via async-iterator `.next()`. On pre-commit overflow, compress → `options.model.doStream(modifiedParams)` once. On commit, emit buffered first chunk + pipe rest; post-commit errors propagate.
- Oversized tool-output exclusion happens at the **initial tool execution seam**: `tool-wrapper.ts:111` wraps `toModelOutput` with an oversized check. If the raw output exceeds the 30% threshold, return a structured error-shaped tool result (matching `default-tools.ts:214-246`'s `retrieval_blocked` shape) instead of calling `buildToolResultForModelInput`. The LLM interprets this as a tool-level failure — no causal hallucination risk.
- `_oversizedWarning` injection is removed from both `BaseCompressor.ts:407` and `ArtifactService.ts:751`. `metadata.isOversized` remains as the filter signal on the stored artifact. Compressor's artifact-reference format (`conversations.ts:437-493`) stays as-is for conversation-history rebuild.

---

## 5. Architecture (Vertical Slice)

```
Agent request
  └─ buildInitialMessages() [unchanged — system + history + user only]
       └─ pass to generateText / streamText (model wrapped per-request)
            │
            └─ AI SDK multi-step loop
                 ├─ prepareStep callback  ← [CHANGED] token-budget branch removed from handlePrepareStepCompression
                 ├─ tool execute (per-call)
                 │   └─ toModelOutput hook at tool-wrapper.ts:111
                 │       ├─ [NEW] detect oversized raw output (30% of context window)
                 │       │         if oversized → return error-shaped tool result (retrieval_blocked-style)
                 │       └─ else → buildToolResultForModelInput(output) [unchanged]
                 ├─ step: calls doGenerate() / doStream() on wrapped model
                 │   └─ compressionRetryMiddleware (built per-request)  ← [NEW]
                 │       wrapGenerate:  try doGenerate();
                 │                       on overflow → compress params.prompt → options.model.doGenerate(modified)
                 │       wrapStream:    try doStream(); peek first chunk;
                 │                       pre-commit overflow → compress → options.model.doStream(modified)
                 │                       commit path → prepend buffered chunk, pipe rest; post-commit errors propagate
                 ├─ tool calls / text deltas flow out unchanged
                 └─ onStepFinish / final result
```

### New files
- `agents-api/src/domains/run/compression/compressionRetryMiddleware.ts` — factory returning a `LanguageModelV2Middleware` closed over the run's compressor / context (per-request construction).
- `agents-api/src/domains/run/compression/detectContextOverflow.ts` — provider-aware overflow discriminator.

### Changed files
- `agents-api/src/domains/run/agents/tools/tool-wrapper.ts` — wrap `toModelOutput` at line 111: detect oversized raw output; on oversized, return error-shaped stub; otherwise call `buildToolResultForModelInput`.
- `agents-api/src/domains/run/compression/BaseCompressor.ts` — remove `_oversizedWarning` injection at line 407.
- `agents-api/src/domains/run/artifacts/ArtifactService.ts` — remove `_oversizedWarning` injection at line 751 (keep `metadata.isOversized`).
- `agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts` — remove token-budget branch of `handlePrepareStepCompression`.
- `agents-api/src/domains/run/agents/generation/generate.ts` — wrap model with middleware at non-streaming (`:318-320`) and streaming (`:309`) call sites, via per-request factory. No try/catch around `generateText` / `streamText`.
- Tests: `agents-api/src/domains/run/artifacts/__tests__/OversizedArtifacts.test.ts` and `agents-api/src/domains/run/compression/__tests__/BaseCompressor.test.ts` — update cases asserting `_oversizedWarning` presence. New contract: LLM-facing exclusion lives at the tool-wrapper seam; `_oversizedWarning` no longer present in `summaryData`. `metadata.isOversized` remains the durable signal.

### Unchanged
- `agents-api/src/domains/run/agents/generation/conversation-history.ts` — `buildInitialMessages` does not iterate artifacts; no surgery needed here.
- `agents-api/src/domains/run/agents/generation/tool-result-for-model-input.ts` — function signature and logic unchanged; the oversized bypass happens at its caller (tool-wrapper).
- `agents-api/src/domains/run/data/conversations.ts` — conversation-history compression path and compact artifact-reference formatter at `:437-493`.
- `agents-api/src/domains/run/compression/ConversationCompressor.ts` — logic unchanged.
- `agents-api/src/domains/run/compression/MidGenerationCompressor.ts` — logic unchanged; no longer called from `prepareStep`, only from middleware retry.
- `agents-api/src/domains/run/artifacts/artifact-utils.ts` — `detectOversizedArtifact` detection unchanged; only the downstream warning-injection consumers change.
- `agents-api/src/domains/run/agents/tools/default-tools.ts` — `get_reference_artifact` retrieval-blocked path at `:214-246` is untouched.

---

## 6. Design Details

### 6.1 Overflow detection (`detectContextOverflow.ts`)

```ts
export function isContextOverflowError(err: unknown): boolean {
  if (!isAPICallErrorLike(err)) return false;
  if (err.statusCode === 413) return false;             // byte-limit, not overflow
  if (err.statusCode !== 400) return false;             // overflow is always 400

  // OpenAI: stable error code
  const oaiCode = extractOpenAICode(err);
  if (oaiCode === 'context_length_exceeded') return true;

  // Anthropic: message regex (no stable code)
  const msg = extractErrorMessage(err);
  if (/prompt is too long/i.test(msg)) return true;
  if (/input length and max_tokens exceed context limit/i.test(msg)) return true;

  return false;
}
```

Must emit a telemetry event on every regex hit so Anthropic wording drift is detectable.

### 6.2 Middleware (`compressionRetryMiddleware.ts`)

**Critical shape correction.** Per `@ai-sdk/provider@3.0.2` (the version declared in `agents-api/package.json` and `packages/ai-sdk-provider/package.json`; verified identical middleware contract in 3.0.4 via a diff of `dist/index.d.ts` between the two — the only delta is an unrelated `LanguageModelV2ProviderTool` → `LanguageModelV2ProviderDefinedTool` rename), `wrapGenerate` / `wrapStream` receive `doGenerate` / `doStream` as **nullary** functions — they bind the already-transformed params. To retry with modified params, call `options.model.doGenerate(modifiedOptions)` (or `options.model.doStream(modifiedOptions)`) directly.

```ts
export function createCompressionRetryMiddleware(ctx: AgentRunContext): LanguageModelV2Middleware {
  return {
    async wrapGenerate({ doGenerate, params, model }) {
      try {
        return await doGenerate();
      } catch (err) {
        if (!isContextOverflowError(err)) throw err;
        const compressedPrompt = await ctx.compressor.compressPrompt(params.prompt);
        // Retry once directly against the underlying model with modified params.
        // Any failure here (including second overflow) propagates.
        return await model.doGenerate({ ...params, prompt: compressedPrompt });
      }
    },

    async wrapStream({ doStream, params, model }) {
      const innerStream = await doStream();
      const peeked = await peekFirstChunk(innerStream);

      if (peeked.kind === 'overflow-pre-commit') {
        const compressedPrompt = await ctx.compressor.compressPrompt(params.prompt);
        return await model.doStream({ ...params, prompt: compressedPrompt });
      }

      if (peeked.kind === 'other-error-pre-commit') {
        throw peeked.error;
      }

      // Committed: first chunk is real. Return a stream that replays first chunk + pipes rest.
      return { stream: prependThenPipe(peeked.firstChunk, peeked.rest), ...peeked.meta };
    },
  };
}
```

Notes:
- Built **per-request** via the factory so the compressor / run context is in closure scope. The AI SDK model itself is constructed once per provider; the wrapped-for-this-request variant is produced inside the request handler.
- `peekFirstChunk` pulls exactly one chunk via async-iterator `.next()`:
  - First chunk is an error part and `isContextOverflowError(err)` → `overflow-pre-commit`.
  - First chunk is any error part otherwise → `other-error-pre-commit`.
  - First chunk is any real part → committed; return buffered chunk + the remaining async iterator.
- `prependThenPipe(chunk, rest)` is an async generator that yields `chunk` then for-awaits `rest`. **No `tee()`, no array buffering.**
- Post-commit errors mid-stream (first chunk already emitted) propagate to the outer consumer — not retried (see §14 R7).

### 6.3 Compression for middleware

The middleware reuses `MidGenerationCompressor` / `BaseCompressor` to compress the `params.prompt` (`LanguageModelV2Prompt` messages). `MidGenerationCompressor` is the compressor class used by today's `prepareStep` path — its summarization output format (`{high_level, user_intent, decisions, open_questions, next_steps, related_artifacts}`, wrapped in a synthetic user message) is reused unchanged. The middleware factory closes over a per-request compressor instance so it has access to the same run-scoped context (tenant, project, conversationId, session).

### 6.4 Oversized tool output exclusion

The surgery happens at the **initial tool execution seam** in `tool-wrapper.ts:111`:

```ts
// Before:
// toModelOutput: ({ output }: { output: unknown }) => buildToolResultForModelInput(output),

// After:
toModelOutput: ({ output }: { output: unknown }) => {
  const detection = detectOversizedArtifact(output, ctx.contextWindowSize, {
    toolCallId: currentToolCallId,
  });
  if (detection.isOversized) {
    return {
      type: 'json',
      value: {
        status: 'oversized',
        toolCallId: currentToolCallId,
        toolName,
        warning: '⚠️ Tool produced an oversized result that cannot be included in the conversation.',
        reason: formatOversizedRetrievalReason(detection.originalTokenSize, detection.contextWindowSize),
        toolInfo: { toolName, toolArgs: args, structureInfo: detection.structureInfo },
        recommendation:
          'Consider: 1) narrowing filters/queries on the next tool call, 2) asking the user to break down the request, 3) processing data differently.',
      },
    };
  }
  return buildToolResultForModelInput(output);
},
```

Why this shape:
- Matches the `retrieval_blocked` response shape already used by `default-tools.ts:214-246`. LLMs encountering a tool-call with a structured `status: 'oversized'` response interpret it as a tool-level failure with actionable guidance — not as content to regurgitate.
- The structured form carries `toolInfo` + `recommendation` so the LLM can correct its behavior on the next step (e.g., narrow the query).
- Uses AI SDK's `type: 'json'` tool-result shape so provider serialization is unaffected.

The `conversations.ts:437-493` compact text reference (`[Artifact: "name" (id: X) | ...]`) is still used by the conversation-history rebuild path on subsequent turns. The two representations are intentional: an in-turn tool failure vs. a historical reference.

### 6.5 Telemetry (OTel + logs)

New span attributes / log fields:
- `compression.trigger = 'overflow_retry' | 'conversation_history'`
- `compression.provider = 'anthropic' | 'openai'`
- `compression.detector = 'openai_code' | 'anthropic_regex' | 'heuristic_400'`
- `compression.retry_number = 0 | 1`
- `compression.outcome = 'success' | 'second_overflow' | 'other_error'`
- `artifact.excluded = true` with `artifact.id`, `artifact.original_tokens`, `artifact.context_window`
- `anthropic_overflow_regex_hit = true` (span attribute, not log field — keeps consistency with the other `compression.*` attributes and makes the drift signal queryable via Jaeger/OTel tag search)

All of the above are **span attributes** (not log fields). Emit on the step span inside the middleware retry path, and on the tool-call span for `tool.result.oversized_excluded`.

---

## 7. User Journeys

### 7.1 Agent Builder — oversized tool result
1. Builder writes a tool that occasionally returns very large payloads.
2. Agent runs; tool executes; raw output is detected as oversized at `tool-wrapper.ts:111`'s wrapped `toModelOutput`.
3. **Before:** Raw output flows through `buildToolResultForModelInput` into the LLM's tool-result message. The LLM consumes the bloat; downstream token-budget compression fires; context is lost.
4. **After:** LLM receives a structured tool result with `status: 'oversized'`, a recommendation to narrow the query, and the tool args that caused the overflow. The LLM corrects on the next step (narrower query, different approach) instead of drowning in the content.

### 7.2 End User — long conversation hits real overflow
1. User has long conversation; input grows close to context limit.
2. LLM call fires; provider returns 400 + overflow message.
3. **Before:** Proactive compression likely fired many steps earlier; no guarantee it prevented overflow. If overflow still happened, hard fail.
4. **After:** Middleware catches the overflow, compresses prompt, retries once. User sees a normal response. No visible latency impact on successful steps (no pre-emptive compression on false positives).

### 7.3 Platform Operator — observability
1. Operator queries Jaeger for compression events.
2. **Before:** Can't distinguish false-positive from necessary compressions.
3. **After:** `compression.trigger = 'overflow_retry'` attribute makes reactive compressions countable and attributable. Alert threshold on Anthropic regex drift via `anthropic_overflow_regex_hit` attribute. `tool.result.oversized_excluded` attribute counts tool-wrapper-level exclusions.

---

## 8. Blast Radius

| Surface | Impact | Notes |
|---|---|---|
| Agent runtime behavior | **High** | Mid-gen compression rate drops; occasional overflow retries appear. |
| LLM cost | **Reduced** | Fewer compression calls. No change to successful generations. |
| LLM latency | **Reduced** (median) / **increased** (overflow tail) | Median step no longer includes compression summarization. Overflow steps now pay compress+retry. Net expected positive. |
| Agent coherence / output quality | **Improved** | Compression destructively summarizes. Fewer compressions = more detail retained. |
| Conversation-history compression | **No change** | Path untouched. |
| Work-apps / evals | **No change** | Out of scope. |
| Public SDK / API | **No change** | Internal runtime refactor. |
| Database schema | **No change** | Artifact `metadata.isOversized` already exists. |
| `prepareStep` callback | **Behavior change** | Token-budget branch removed; callback still runs for other pre-step logic. |

---

## 9. Requirements with Acceptance Criteria

### R1. Oversized raw tool outputs do not contribute content to LLM prompt
**AC:** When `detectOversizedArtifact(rawOutput, contextWindowSize)` returns `isOversized === true` inside the wrapped `toModelOutput` at `tool-wrapper.ts:111`, the returned AI SDK tool-result payload is the structured `{ status: 'oversized', toolInfo, recommendation, ... }` object — `buildToolResultForModelInput(output)` is not called for that output. No raw output bytes appear in the LLM prompt.
**Verifiable via:** Unit test on the wrapped tool with an oversized-fixture output; assert (1) the returned tool result has `status === 'oversized'`, (2) `buildToolResultForModelInput` was not called (spy), (3) no field of the returned payload contains the raw output.

### R2. Mid-generation compression fires only on provider-signaled overflow
**AC:** `prepareStep` callback no longer calls `compressor.safeCompress()` based on token-budget prediction. Compression during a generation only occurs inside `compressionRetryMiddleware.wrapGenerate` / `wrapStream` after `isContextOverflowError(err) === true`.
**Verifiable via:** Unit test confirming `handlePrepareStepCompression` no longer checks `isCompressionNeededFromActualUsage`. Integration test with mocked model that never throws → no compression events recorded.

### R3. Overflow detection distinguishes OpenAI, Anthropic, and excludes 413
**AC:** `isContextOverflowError` returns `true` for OpenAI 400 + `context_length_exceeded`, for Anthropic 400 + known overflow messages; returns `false` for 413 `request_too_large`, for generic 400s without overflow indicators, and for non-API errors.
**Verifiable via:** Unit test matrix in `detectContextOverflow.test.ts`.

### R4. Middleware preserves multi-step loop (observable side effects)
**AC:** With middleware active on a deterministic mock model that never throws, a 3-step agent run observes identical **step count**, **tool-call ordering** (by tool name and input args), **`onStepFinish` invocation count**, and **`prepareStep` invocation count** — compared to an unwrapped run. Final message text equality is **not** asserted (provider outputs are non-deterministic even with seeded mocks).
**Verifiable via:** Integration test with a mock `LanguageModelV2` that returns a fixed sequence of steps. Assert the four structural invariants above.

### R5. Middleware retries once on overflow
**AC:** On first overflow, compression runs and the underlying call is re-invoked with compressed prompt. On a second overflow (or any other error) during the retry, the error propagates to the outer loop. Exactly one retry is attempted.
**Verifiable via:** Unit test on middleware with a mocked `doGenerate` that throws overflow then succeeds; a second test where it throws overflow twice (expect propagation).

### R6. Streaming happy-path uses O(1) peek, no buffering
**AC:** Middleware `wrapStream` uses async-iterator `.next()` for first-chunk peek and a prepend-then-pipe async generator for emission. `tee()`, array accumulation, and any batching of subsequent chunks are not present.
**Verifiable via:** Code review enforced by a test that asserts specific patterns: (1) `peekFirstChunk` is exported and uses `.next()`, (2) the returned stream for committed path is an async generator, not a `ReadableStream` from `tee()`, (3) no use of `Array.from` / array buffering on the inner stream.

### R7. Post-commit mid-stream errors propagate (not retried)
**AC:** If the first chunk is a real delta and a later chunk is an error, the error flows through to the outer consumer. No retry attempt.
**Verifiable via:** Streaming integration test with a mock provider that emits one text delta then an overflow error chunk.

### R8. Telemetry emitted
**AC:** OTel attributes on relevant spans: `compression.trigger`, `compression.provider`, `compression.detector`, `compression.retry_number`, `compression.outcome`, `artifact.excluded` (with ids/sizes), `anthropic_overflow_regex_hit`.
**Verifiable via:** Test that intercepts OTel exporter and asserts attributes.

---

## 10. Decision Log

| ID | Decision | Type | Reversibility | Confidence | Status |
|---|---|---|---|---|---|
| DEC-01 | Retry budget = 1 | Technical | Reversible | HIGH | **LOCKED** |
| DEC-02 | Terminal failure = hard fail (no aggressive truncation, no model switch) | Product+Technical | Reversible | HIGH | **LOCKED** |
| DEC-03 | No artifact retrieval tool in scope; stub advertises no retrieval path | Product | Reversible | HIGH | **LOCKED** |
| DEC-04 | Swap wholesale; no feature flag | Product | Reversible (via revert) | HIGH | **LOCKED** |
| DEC-05 | Do not auto-reduce `max_tokens` on retry | Technical | Reversible | HIGH | **LOCKED** |
| DEC-06 | Implement via `wrapLanguageModel` middleware; do NOT wrap outer `generateText` / `streamText` | Technical | **1-way door** | HIGH | **LOCKED**. Rationale: an outer try/catch that re-invokes `generateText` would reset the multi-step state. At step N>1, a retry would lose completed tool calls from steps 1..N-1 and re-execute them, violating tool-call idempotency assumptions and producing incorrect observable behavior. Middleware intercepts at the per-step `doGenerate`/`doStream` boundary so only the failing step retries; steps 1..N-1 remain committed. |
| DEC-07 | Stream peek via async-iterator `.next()` + prepend-pipe generator; no `tee()`, no array buffering | Technical | Reversible | HIGH | **LOCKED** |
| DEC-08 | Initial provider scope = Anthropic + OpenAI | Technical | Reversible | HIGH | **DIRECTED** — extend per-provider as needed |
| DEC-09 | Use `conversations.ts:437-493` compact text reference for conversation-history rebuild (unchanged); use structured error-shaped tool result (matching `default-tools.ts:214-246`) for initial tool execution exclusion | Technical | Reversible | HIGH | **LOCKED** — two representations for two contexts (historical reference vs in-turn tool failure) |
| DEC-10 | Remove `_oversizedWarning` from `summaryData` at both `BaseCompressor.ts:407` and `ArtifactService.ts:751`; `metadata.isOversized` remains the durable signal | Technical | Reversible | HIGH | **LOCKED** |
| DEC-11 | Do NOT use AI SDK `transformParams` middleware hook (the canonical **proactive** message-shaping primitive). | Technical | Reversible | HIGH | **LOCKED**. Rationale: `transformParams` fires unconditionally before every call — it's another proactive shaping point, which is exactly what this spec is moving away from. `wrapGenerate`/`wrapStream` let us react to real provider errors and do nothing on the happy path. Recorded explicitly so future contributors don't "correct" toward `transformParams`. |
| DEC-12 | Oversized exclusion seam = `tool-wrapper.ts:111` wrapped `toModelOutput`. Not `buildToolResultForModelInput` (doesn't iterate artifacts) and not `buildInitialMessages` (doesn't touch artifacts). | Technical | Reversible | HIGH | **LOCKED** — verified via code trace during audit resolution |
| DEC-13 | Middleware construction is **per-request** via factory `createCompressionRetryMiddleware(ctx)`; the closure captures the run-scoped compressor / context. Not a module-level constant. | Technical | Reversible | HIGH | **LOCKED** — required because compressor is run-scoped but `wrapLanguageModel` happens at model level |
| DEC-14 | Pre-generation conversation-history compression (unchanged) acts as the safety net for non-tool-result context growth (long user messages, long system prompts). Reactive mid-gen retry handles the tool-result-bloat case. | Product+Technical | Reversible | HIGH | **DIRECTED** |

**Resolution status key:** LOCKED = do not change without re-opening decision. DIRECTED = recommended default; implementers may adjust with rationale. DELEGATED = implementer chooses.

---

## 11. Open Questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| OQ-01 | Is there observed production/staging evidence of false-positive compression rate? | Product | P2 | Deferred — belongs to observability work after ship; will become visible via new `compression.trigger` attribute. |
| OQ-02 | Do we want an alert on `anthropic_overflow_regex_hit` frequency to catch Anthropic wording drift? | Technical | P2 | Deferred to ops/alerting; telemetry is emitted, alert threshold is not a spec-time decision. |
| OQ-03 | Should the reference stub wording be customizable via system prompt or env? | Product | P2 | Deferred; default wording is sufficient for initial ship. |

No P0 open questions remain. All In Scope items are fully decided.

---

## 12. Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | Anthropic's overflow message strings (`"prompt is too long"`, `"input length and max_tokens exceed context limit"`) remain stable over the near-term. | MEDIUM | Telemetry on regex hits; alert on drift. |
| A2 | AI SDK `wrapLanguageModel` + `LanguageModelV2Middleware` remain the correct interception layer through the next minor versions of `ai` / `@ai-sdk/*`. | HIGH | Pin AI SDK minor version in package.json; CI catches breakages. |
| A3 | Overflow for Anthropic/OpenAI almost always occurs pre-stream (before any content part is emitted). Post-commit mid-stream overflow is rare. | HIGH | Informed by provider behavior; hard-fail path covers the rare case. |
| A4 | The existing `ConversationCompressor` output format is suitable for the middleware's retry-compression call. | HIGH | Reused unchanged. |

---

## 13. Risks / Unknowns

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Anthropic changes overflow wording; regex stops matching. | Overflow stops being detected; we hard-fail on retries that would have been caught. | LOW–MEDIUM | Telemetry on regex hits + heuristic 400-fallback; alert on drop in hits after deploy. |
| AI SDK streaming error delivery regresses (known issues #4099, #4726). | Mid-stream overflow not caught by middleware. | LOW | Covered by R7 — post-commit errors propagate. Pre-commit path (the common case) handled. |
| Removing proactive compression exposes calls that previously succeeded via compression to real overflow rejections. | Some flows that never hit overflow before (because compression fired early) now hit it and need the retry path. | MEDIUM | Expected and correct by design. Retry path handles them. Watch `compression.outcome = 'second_overflow'` rate post-deploy. |
| Oversized artifact reference stub confuses the LLM into hallucinating content. | Agent output quality degradation. | LOW | Stub wording is explicit that content is unavailable; LLM prompt engineering norms treat bracketed placeholders as non-content. Monitor user feedback. |
| End-User visibility gap: when a tool result is excluded mid-turn, the End User sees the LLM's subsequent "I couldn't retrieve that" response with no UI indicator that exclusion happened. | UX confusion; user cannot distinguish exclusion from tool failure. | MEDIUM | Telemetry emits `tool.result.oversized_excluded`. Surfacing this to end-user UI (chat stream or status indicator) is out of scope for this spec — flag as a candidate for the manage-ui / chat-consumer surface team. Operators can see it in Jaeger immediately. |

---

## 14. Verification Plan

- **Unit tests** (`agents-api/src/__tests__/` or adjacent `__tests__/` directories):
  - `detectContextOverflow.test.ts` — R3 matrix (OpenAI code, Anthropic regex, 413 exclusion, non-API errors).
  - `compressionRetryMiddleware.test.ts` — R5 (one retry), R4 (pass-through structural invariants), R6 (async-iterator `.next()` peek, prepend-then-pipe generator, no `tee()`/array buffering).
  - `tool-wrapper.test.ts` (new or extended) — R1 (oversized raw output → error-shaped stub via wrapped `toModelOutput`; non-oversized output → existing `buildToolResultForModelInput` path).
  - `ai-sdk-callbacks.test.ts` — R2 (`handlePrepareStepCompression` no longer calls `MidGenerationCompressor.isCompressionNeededFromActualUsage`).
  - Update `OversizedArtifacts.test.ts` and `BaseCompressor.test.ts` — assert `_oversizedWarning` is NOT present in `summaryData`; assert `metadata.isOversized === true` still functions as the durable signal.
- **Integration tests:**
  - Scripted 3-step agent with mocked `LanguageModelV2`: no-overflow run + run with one injected overflow + run with two injected overflows. Assert step count equality (R4), retry count (R5), propagation on second overflow (R5 second case).
  - Streaming: mock `LanguageModelV2StreamResult` emitting an overflow error as first chunk → middleware retries with compressed prompt → second `doStream` returns a working stream → outer consumer sees normal deltas.
  - Streaming: mock stream emitting a text delta first then an overflow error chunk → error propagates to outer consumer unmodified (R7). Tool state captured before the error remains committed.
- **Telemetry test:** intercept OTel exporter; assert attributes per R8.
- **Manual / cookbook:** run an agent in `agents-cookbook/` with a tool that returns an oversized payload; confirm via Jaeger span attributes that `tool.result.oversized_excluded = true` and no `compression.trigger = 'prepareStep_budget'` attribute appears (that code path is removed).
- **Regression:** existing tests for `ConversationCompressor` / `getConversationHistoryWithCompression` must still pass unchanged.
- **Docs check:** `agents-docs/` surfaces compression behavior to Agent Builders only at a high level (current search turns up no dedicated compression page). During implementation, grep `agents-docs/content/` for mentions of "compression", "context window", or "oversized" and update if stale. Public SDK/API contract does not change, so no new doc page is mandatory — but if an existing page describes the current proactive behavior, correct it.
- **Pre-push:** `pnpm check` (lint + typecheck + test + format:check).
- **Changeset:** `pnpm bump patch --pkg agents-api "Make mid-generation compression reactive to provider overflow errors and exclude oversized artifacts from LLM context"`.

---

## 15. Future Work

| Item | Tier | Why not now | Triggers to revisit |
|---|---|---|---|
| Agent-callable artifact retrieval tool (e.g., `get_artifact_full(id)`) | **Explored** | Out of this spec's scope; stub informs the LLM content is unavailable without advertising a retrieval path. Designing a safe retrieval API (permissions, token budget of retrieved content, recursion prevention) is its own scope. | Agent builders report repeated frustration with "content unavailable"; product decision to support in-turn full-artifact access. **Migration note:** when added, update the oversized stub's `recommendation` field to mention the retrieval tool (e.g., "retrieve via `get_artifact_full(id)`"). This is a backward-compatible addition — no breaking change required. |
| Traces UI surfacing for `tool.result.oversized_excluded` and `compression.outcome = 'second_overflow'` attributes | **Identified** | Telemetry is emitted; UI treatment is a manage-ui surface concern and belongs to a different team. Without UI, operators discover via Jaeger queries. | First operator report of "I couldn't see which tool call was excluded"; or agent-builder feedback. |
| Enriched oversized-stub metadata for debugging | **Noted** | Current stub matches existing `retrieval_blocked` shape for consistency. Potential additions: `docsUrl`, truncation of `toolArgs` to prevent multi-KB dumps in Traces, human-readable token context ("~42K tokens, 30% of 140K limit"). | Consistent reports from agent builders about difficulty debugging exclusions in Traces UI. |
| Bedrock / Azure / Google overflow detection | **Identified** | Initial providers are Anthropic + OpenAI; other providers are not currently in production paths for this runtime. | Add a provider to production; extend `detectContextOverflow` with per-provider branch. |
| Alert on `anthropic_overflow_regex_hit` frequency + drift detection | **Identified** | Alerting thresholds are an ops concern, not a spec-time decision. Telemetry is in place. | First Anthropic model rev where hit-rate drops unexpectedly after deploy. |
| Customizable reference stub wording | **Noted** | Default wording is sufficient for initial ship; customization adds surface area without demonstrated need. | Customer request or specific localization/branding requirement. |
| Metric separating "compression was necessary" (second-overflow-on-retry-prevented) from total compression count | **Noted** | Emergent from telemetry; can be derived without code changes once attributes are flowing. | Ops dashboards being built. |
| Retry budget ladder (compress-mild → compress-aggressive → fail) instead of single retry | **Identified** | DEC-01 locks the initial design at one retry. Evidence that second compression meaningfully improves success rate is absent — likely dominated by `max_tokens` budget per A1 (Anthropic). | `compression.outcome = 'second_overflow'` rate exceeds a threshold (e.g., >5% of retries) for 2+ weeks post-ship. Revisit with data. |

---

## 16. Agent Constraints

**SCOPE (implementation touches):**
- `agents-api/src/domains/run/compression/compressionRetryMiddleware.ts` (new)
- `agents-api/src/domains/run/compression/detectContextOverflow.ts` (new)
- `agents-api/src/domains/run/agents/tools/tool-wrapper.ts` (wrap `toModelOutput` at line 111)
- `agents-api/src/domains/run/compression/BaseCompressor.ts` (remove `_oversizedWarning` injection at line 407)
- `agents-api/src/domains/run/artifacts/ArtifactService.ts` (remove `_oversizedWarning` injection at line 751)
- `agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts` (remove token-budget branch of `handlePrepareStepCompression`)
- `agents-api/src/domains/run/agents/generation/generate.ts` (middleware wiring at both `:318-320` non-streaming and `:309` streaming call sites)
- `agents-api/src/domains/run/artifacts/__tests__/OversizedArtifacts.test.ts` (update assertions: `_oversizedWarning` no longer present)
- `agents-api/src/domains/run/compression/__tests__/BaseCompressor.test.ts` (update assertions)
- New test files adjacent to the new source files.
- Changeset file under `.changeset/`.

**EXCLUDE (do not touch):**
- `agents-api/src/domains/run/agents/generation/conversation-history.ts` — artifacts are not assembled here; no change needed.
- `agents-api/src/domains/run/agents/generation/tool-result-for-model-input.ts` — function signature and logic unchanged; bypass happens at its caller.
- `agents-api/src/domains/run/data/conversations.ts` — conversation-history path, including compact reference at `:437-493`.
- `agents-api/src/domains/run/compression/ConversationCompressor.ts` — logic unchanged.
- `agents-api/src/domains/run/compression/MidGenerationCompressor.ts` — logic unchanged.
- `agents-api/src/domains/run/artifacts/artifact-utils.ts` — `detectOversizedArtifact` reused; no changes required.
- `agents-api/src/domains/run/agents/tools/default-tools.ts` — `get_reference_artifact` retrieval-blocked path stays as-is.
- Any `agents-work-apps` or `agents-api/src/domains/evals/` files.
- Any `agents-manage-ui` files — this is runtime-only.
- Any database migrations — no schema change.

**STOP_IF:**
- A proposed change would require modifying `MidGenerationCompressor` or `ConversationCompressor` internal logic (not just calling them).
- The installed `@ai-sdk/provider` version does not expose `options.model` in `wrapGenerate` / `wrapStream`, making per-request retry with modified params impossible (re-open DEC-06).
- Removing `_oversizedWarning` from `summaryData` breaks a downstream consumer outside `agents-api/src/domains/run/` (check full repo for usages before deleting).
- The oversized-stub shape in §6.4 needs to match a different tool-result contract than `default-tools.ts:214-246` uses.

**ASK_FIRST:**
- Choice of where exactly to wire the per-request `wrapLanguageModel` factory call — inside the existing model construction site in `generate.ts` vs a new helper. Present both options with specific file/line.
- Any divergence from the error-shaped stub contract in §6.4 (field names, status value, presence of `toolInfo` / `recommendation`).
- Per-request vs per-call middleware construction if there is a perf concern (today DEC-13 says per-request).

---

## 17. References

- Evidence: `evidence/current-compression-triggers.md`, `evidence/oversized-artifact-handling.md`, `evidence/provider-overflow-signals.md`, `evidence/middleware-approach.md`
- Changelog: `meta/_changelog.md`
- Audit: `meta/audit-findings.md`
- Design challenge: `meta/design-challenge.md`
