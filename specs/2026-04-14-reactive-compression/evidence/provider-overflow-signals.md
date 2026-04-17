---
name: provider-overflow-signals
description: How Anthropic, OpenAI, and the Vercel AI SDK signal context-window-exceeded errors
sources:
  - https://docs.anthropic.com/en/api/errors
  - https://platform.openai.com/docs/guides/error-codes
  - https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
  - https://github.com/vercel/ai (issues #4099, #4726, #8193, #12595)
---

# Evidence: Provider Overflow Signals

**Date:** 2026-04-14

## Key sources referenced

- Anthropic Messages API error taxonomy
- OpenAI Chat Completions error codes
- Vercel AI SDK error-handling docs + known issues
- LibreChat #1572 (adaptive buffer retry pattern)
- AI SDK discussion #8193 (maintainer recommendation: `prepareStep` over retry-on-error)

## Findings

### Finding: OpenAI has a stable discriminator; Anthropic does not

**Confidence:** CONFIRMED
**Evidence:** Official docs

**OpenAI:** HTTP 400, `error.code === "context_length_exceeded"`, `type: "invalid_request_error"`, `param: "messages"`. Stable and documented.

**Anthropic:** HTTP 400, `type: "invalid_request_error"`, message-text-based only. Known message strings:
- `"prompt is too long"`
- `"input length and max_tokens exceed context limit"`

No distinct `code` field. Message string drift is a risk — Anthropic may change wording without breaking API version.

**Implications:** Detection helper must be provider-aware. Anthropic detection needs telemetry on regex hits so we can catch wording drift early. Add a test matrix covering both providers.

### Finding: 413 request_too_large is NOT context overflow

**Confidence:** CONFIRMED
**Evidence:** Anthropic docs — Cloudflare byte-level limit (~32 MB)

**Implications:** Overflow detector must explicitly exclude status 413. Treating it as overflow would cause infinite compression loops on bloated binary inputs.

### Finding: Vercel AI SDK normalizes errors but not overflow codes

**Confidence:** CONFIRMED
**Evidence:** AI SDK error-handling docs + source

AI SDK throws `AI_APICallError` with fields: `statusCode`, `responseBody`, `data`, `cause`, `isRetryable`. No normalized `code` or `type` for overflow.

- `isRetryable` is `false` for 400s — the SDK's built-in retry does not help.
- To detect overflow, inspect `responseBody` or `cause` per-provider.

**Implications:** Our `isContextOverflowError(err)` helper must:
1. Narrow to `AI_APICallError` / similar with `statusCode === 400`.
2. For OpenAI providers: check `code === "context_length_exceeded"`.
3. For Anthropic providers: regex match on message.
4. Fall back to `statusCode === 400 && messageHeuristic` for other providers.
5. Explicitly exclude `statusCode === 413`.

### Finding: Streaming errors surface on three channels

**Confidence:** CONFIRMED
**Evidence:** AI SDK issues #4099, #4726

`streamText` errors can arrive via:
1. Thrown from the `streamText` call (pre-stream).
2. `onError` callback.
3. `fullStream` error chunks (mid-stream after a 200).

Known issues where errors are swallowed or crash despite try/catch — must instrument all three channels.

**Implications:** For our design, we intercept at the model-middleware layer (`wrapStream`), not at `streamText`. At the middleware level, there are two surfaces: thrown from `doStream`, or an error chunk emitted into the returned stream. Handling both via peek-first-chunk logic is sufficient.

### Finding: max_tokens counts toward Anthropic overflow math

**Confidence:** CONFIRMED
**Evidence:** Anthropic error message `"input length and max_tokens exceed context limit"`

If input + `max_tokens` > context window, Anthropic rejects. Compressing the input alone may still fail if `max_tokens` is large.

**Implications:** If a compression retry still fails for this reason, the hard-fail surfaces cleanly. We do NOT auto-reduce `max_tokens` on retry — operator config controls it (user directive).

### Finding: No canonical first-party retry pattern exists; prior art favors prepareStep shaping

**Confidence:** CONFIRMED
**Evidence:** AI SDK discussion #8193; LibreChat #1572; Cline #499, #4419

AI SDK maintainers recommend pre-shaping messages via `prepareStep` / `toModelMessage` rather than retry-on-error. Our design intentionally differs: we want reactive (error-driven) behavior because proactive shaping is what's currently over-eager.

LibreChat's pattern (adaptive buffer, catch, grow reserved buffer, retry) is closest to our approach.

**Implications:** Our approach is justified but not conventional. Document the rationale in the spec so future contributors don't "correct" back to proactive shaping.

### Finding: AI SDK middleware (wrapLanguageModel) is the correct interception point

**Confidence:** CONFIRMED
**Evidence:** AI SDK `wrapLanguageModel` API + `LanguageModelV2Middleware` type

Middleware implements `wrapGenerate(params, doGenerate)` and `wrapStream(params, doStream)`. The middleware can call `doGenerate`/`doStream` multiple times internally and return a single promise/stream to the outer loop. The multi-step `generateText` loop is unaware.

**Implications:** This preserves the Vercel AI SDK multi-step loop entirely, meeting the user's critical constraint that we MUST NOT break that loop.

## Gaps / follow-ups

- Bedrock / Azure / Google providers have divergent error shapes. Initial scope: Anthropic + OpenAI. Future work: extend detection per-provider.
- Streaming mid-stream error delivery reliability in AI SDK is imperfect — integration tests should cover each channel.
