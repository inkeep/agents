---
name: middleware-approach
description: Why wrapLanguageModel middleware preserves the multi-step loop and how stream-peek works without latency
sources:
  - https://sdk.vercel.ai/docs/ai-sdk-core/middleware
  - https://sdk.vercel.ai/docs/reference/ai-sdk-core/wrap-language-model
---

# Evidence: AI SDK Middleware Approach

**Date:** 2026-04-14

## Findings

### Finding: wrapLanguageModel makes retry invisible to the multi-step loop

**Confidence:** CONFIRMED
**Evidence:** AI SDK docs for `wrapLanguageModel` + `LanguageModelV2Middleware`

The AI SDK calls `doGenerate` / `doStream` once per step. A middleware intercepts this single call and can internally invoke the underlying implementation as many times as it needs before returning. From the outer `generateText` / `streamText` perspective, each step gets one awaited result — step counting, tool-call accumulation, `onStepFinish`, `prepareStep` all behave as if nothing happened.

**Contrast with outer try/catch around generateText:** that would reset step counters, tool state, and onStepFinish side effects. This is what the user explicitly rejected.

**Implications:** The middleware is the only correct interception layer for a reactive retry that preserves the loop.

### Finding: wrapStream returns a promise of a stream — retry happens before outer consumption

**Confidence:** CONFIRMED
**Evidence:** AI SDK streaming API contract

`wrapStream(params, doStream)` returns `Promise<{ stream: ReadableStream<LanguageModelV2StreamPart>, ... }>`. The outer consumer awaits the promise BEFORE consuming the stream. Inside the middleware we can:

1. Call `doStream(params)` internally.
2. Peek the first chunk via async-iterator `.next()`.
3. If the first chunk is an error AND it's a context-overflow error → discard the inner stream, compress `params.prompt`, call `doStream` again, return the fresh stream.
4. If the first chunk is a real delta → return a wrapper stream that replays the buffered first chunk, then pipes the rest unchanged.

**Implications:** Retry happens before any bytes reach the outer consumer. Latency on happy path is unchanged — we inspect the first chunk (microseconds) and forward.

### Finding: Once any delta is emitted downstream, retry is unsafe

**Confidence:** INFERRED (from AI SDK semantics)

Once a text delta or tool-call has been emitted to the outer consumer, that state is committed:
- Tool calls may have been captured by `onStepFinish`-like callbacks.
- Text may have been displayed to the end user.
- The outer consumer is iterating the stream.

Attempting a retry at this point would require the outer consumer to somehow "undo" those side effects, which is not possible.

**Implications:** Post-commit mid-stream errors are hard fail. Only pre-commit errors (first-chunk errors) are eligible for retry. This covers the important case: Anthropic/OpenAI almost always fail overflow pre-stream (the provider rejects before any tokens are generated), so the pre-commit retry path catches the vast majority of overflow scenarios.

### Finding: Latency impact of first-chunk peek is negligible

**Confidence:** INFERRED (from async-iterator semantics)

The outer consumer is already awaiting the first chunk from the provider — that wait-time is unavoidable network latency. The middleware uses it to:
1. Await the first chunk (already happening).
2. Inspect the chunk type (microseconds of JS object property access).
3. Forward via a prepend-then-pipe async generator.

No batching, no buffering beyond the already-in-memory first chunk, no delay between subsequent chunks.

**Anti-pattern to avoid:** using `fullStream.tee()` or buffering to an array — these would add copy/buffering overhead. Use async-iterator `.next()` + prepend.

**Implications:** TTFT (time-to-first-token) is within microseconds of an unwrapped model. Safe to apply universally.
