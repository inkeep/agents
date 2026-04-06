---
title: Compression Cost Analysis
type: evidence
sources:
  - agents-api/src/domains/run/compression/BaseCompressor.ts
  - agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts
  - agents-api/src/domains/run/constants/execution-limits/defaults.ts
  - agents-api/src/domains/run/agents/generation/tool-result-for-model-input.ts
  - agents-api/src/domains/run/artifacts/artifact-utils.ts
---

## Compression Triggers

Mid-generation compression fires in `handlePrepareStepCompression()` (ai-sdk-callbacks.ts:36-56):
- Uses actual token counts from last step: `actualInputTokens + actualOutputTokens`
- Fires when: `remaining <= safetyBuffer` where `remaining = hardLimit - actualContextTokens`

Default thresholds (defaults.ts):
- COMPRESSION_HARD_LIMIT: 120,000 tokens
- COMPRESSION_SAFETY_BUFFER: 20,000 tokens
- Trigger point: ~100,000 tokens

Model-aware adjustments (model-context-utils.ts:175-186):
- Small models (<100K): 85% utilization, 10% buffer
- Medium models (100K-500K): 90% utilization, 7% buffer
- Large models (>500K): 95% utilization, 4% buffer

## Cost Per Compression Cycle

1. **Extra LLM call**: `distillConversation()` called from BaseCompressor.ts:513. Generates structured summary with high_level, user_intent, decisions, open_questions, next_steps, related_artifacts.

2. **Detail loss**: Full conversation replaced with summarized findings. Tool results converted to artifact references. Nuance and intermediate reasoning lost.

3. **Stop instructions injected**: After 2+ compressions, "STOP ALL TOOL CALLS" appended (ai-sdk-callbacks.ts:137-144) — limits agent capability.

## Tool Result Size Management

Three-layer defense, all lossy:
1. **Truncation**: 100K char limit per text part (tool-result-for-model-input.ts:4). Data silently dropped.
2. **Oversized blocking**: >30% of context window (artifact-utils.ts:92). `retrievalBlocked: true` — data becomes completely inaccessible.
3. **Compression**: Triggers extra LLM call, replaces details with summaries.

## Impact

Every large tool result that enters context either:
- Gets truncated (loses data)
- Triggers compression (loses time + fidelity + costs an LLM call)
- Gets oversized-blocked (loses access entirely)

A tool that filters data BEFORE it enters context avoids all three.
