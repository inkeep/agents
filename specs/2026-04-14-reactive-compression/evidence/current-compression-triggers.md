---
name: current-compression-triggers
description: Map of all compression trigger points in agents-api, proactive vs reactive
sources:
  - agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts
  - agents-api/src/domains/run/agents/generation/generate.ts
  - agents-api/src/domains/run/data/conversations.ts
  - agents-api/src/domains/run/compression/ConversationCompressor.ts
  - agents-api/src/domains/run/compression/BaseCompressor.ts
  - agents-api/src/domains/run/utils/model-context-utils.ts
---

# Evidence: Current Compression Triggers

**Date:** 2026-04-14
**Baseline commit:** a074f63cd

## Key files referenced

- `agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts:11-191` — `handlePrepareStepCompression()` mid-generation trigger
- `agents-api/src/domains/run/agents/generation/generate.ts:85-98` — AI SDK `prepareStep` wiring
- `agents-api/src/domains/run/agents/generation/generate.ts:318-320` — the `generateText` call site (no retry wrapper)
- `agents-api/src/domains/run/agents/generation/generate.ts:126-143` — `handleGenerationError` (cleanup only, no recovery)
- `agents-api/src/domains/run/data/conversations.ts:380-432` — `getConversationHistoryWithCompression` pre-generation entry
- `agents-api/src/domains/run/compression/ConversationCompressor.ts:62-80` — `isCompressionNeeded()` token-budget check
- `agents-api/src/domains/run/utils/model-context-utils.ts:175-265` — `getCompressionConfigForModel` thresholds
- `agents-api/src/domains/run/compression/BaseCompressor.ts:116-157` — `estimateTokens()`, `calculateContextSize()`

## Findings

### Finding: Mid-generation compression is fully proactive

**Confidence:** CONFIRMED
**Evidence:** `ai-sdk-callbacks.ts:11-191`

```ts
// handlePrepareStepCompression() runs via AI SDK prepareStep callback before every step
compressionNeeded = compressor.isCompressionNeededFromActualUsage(totalTokens)
// where totalTokens = actualInputTokens + actualOutputTokens from previous step
```

The check runs **before** each step based on the previous step's actual token usage. If no reliable usage is available, falls back to character-based estimation. Triggers compression when `remaining <= safetyBuffer`.

**Implications:** Every step pays a prediction check. Compression fires on prediction, not on real overflow. False positives compress context the LLM would have successfully consumed.

### Finding: Compression thresholds are budget-based, per model tier

**Confidence:** CONFIRMED
**Evidence:** `model-context-utils.ts:175-265`

```ts
// Small models (<100K): threshold=0.85, bufferPct=0.1  → fires at ~75% of context
// Medium models (100K-500K): threshold=0.9, bufferPct=0.07  → fires at ~83%
// Large models (>500K): threshold=0.95, bufferPct=0.04  → fires at ~91%
```

Env overrides: `AGENTS_COMPRESSION_HARD_LIMIT`, `AGENTS_COMPRESSION_SAFETY_BUFFER`, `AGENTS_COMPRESSION_ENABLED`.

**Implications:** At ~75% of context on small models, we always compress even if the real call would succeed.

### Finding: No provider-error recovery exists around generateText

**Confidence:** CONFIRMED
**Evidence:** `generate.ts:318-320` + `generate.ts:126-143`

```ts
// generate.ts:318-320
const result = await generateText({ ... })  // called once, no retry wrapping
// generate.ts:126-143
handleGenerationError() // cleans up compressor state, propagates error
```

There is no try/catch around the LLM call that distinguishes context-overflow errors from other failures. All provider errors propagate and the generation fails.

**Implications:** A reactive strategy currently has no seam. One must be added — either around the outer call (breaks the multi-step loop) or as AI SDK middleware around `doGenerate`/`doStream` (preserves the loop).

### Finding: Conversation-history compression is separate and works as expected

**Confidence:** CONFIRMED
**Evidence:** `conversations.ts:380-432` + `ConversationCompressor.ts:62-80`

Called via `getConversationHistoryWithCompression()` from `agents/generation/conversation-history.ts:79, 93` before the generation loop starts. Uses `isCompressionNeeded()` on the full history.

**Implications:** This path is explicitly out of scope for this spec. It runs once pre-generation and user confirms behavior is correct.

### Finding: Compression result is injected as a user message mid-stream

**Confidence:** CONFIRMED
**Evidence:** `ai-sdk-callbacks.ts:147-174`

After `compressor.safeCompress()` succeeds, a synthetic user message containing `{high_level, user_intent, decisions, open_questions, next_steps, related_artifacts}` is injected. Stop instructions are added based on compression cycle count.

**Implications:** Compression is not just pruning — it is a destructive summarization that loses detail. This is why false-positive compressions are expensive: every needless compression loses real context.

## Gaps / follow-ups

- Rate of false-positive compressions in production is not measured in code — would need Jaeger/OTel query against current telemetry.
- No metric distinguishes "compression prevented overflow" vs "compression fired on a call that would have succeeded."
