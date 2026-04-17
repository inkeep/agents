---
name: oversized-artifact-handling
description: How oversized artifacts currently reach the LLM and why they trigger compression cascades
sources:
  - agents-api/src/domains/run/artifacts/artifact-utils.ts
  - agents-api/src/domains/run/artifacts/ArtifactService.ts
  - agents-api/src/domains/run/agents/generation/tool-result-for-model-input.ts
  - agents-api/src/domains/run/agents/generation/conversation-history.ts
  - agents-api/src/domains/run/data/conversations.ts
---

# Evidence: Oversized Artifact Handling

**Date:** 2026-04-14
**Baseline commit:** a074f63cd

## Key files referenced

- `agents-api/src/domains/run/artifacts/artifact-utils.ts:72-114` — `detectOversizedArtifact()` detection
- `agents-api/src/domains/run/artifacts/ArtifactService.ts:147-187` — `getContextArtifacts()` fetch
- `agents-api/src/domains/run/artifacts/ArtifactService.ts:337-407` — `getArtifactSummary()` for LLM
- `agents-api/src/domains/run/artifacts/ArtifactService.ts:412-483` — `getArtifactFull()` for full content
- `agents-api/src/domains/run/agents/generation/tool-result-for-model-input.ts:123-171` — `buildToolResultForModelInput()` serialization
- `agents-api/src/domains/run/agents/generation/conversation-history.ts:128-169` — `buildTextAttachmentPart()`
- `agents-api/src/domains/run/agents/generation/conversation-history.ts:171-200` — `buildInitialMessages()`
- `agents-api/src/domains/run/data/conversations.ts:437-493` — existing compact reference pattern

## Findings

### Finding: Oversized detection and warning injection are split across three files (corrected during audit)

**Confidence:** CONFIRMED
**Evidence:** `artifact-utils.ts:72-114`, `BaseCompressor.ts:407`, `ArtifactService.ts:751`

- `detectOversizedArtifact()` at `artifact-utils.ts:72-114` **only detects**. It returns `{ isOversized, retrievalBlocked, originalTokenSize, contextWindowSize, oversizedWarning (string), structureInfo }`. Threshold: `Math.floor(contextWindowSize * 0.3)` (30%).
- `_oversizedWarning` field is injected into `summaryData` at two downstream sites:
  - `BaseCompressor.ts:407` — during compression artifact enhancement.
  - `ArtifactService.ts:751` — during `persistArtifact`, attached to the artifact-saved event payload.

**Implications:** `_oversizedWarning` on `summaryData` affects compression output and artifact-save events. It does NOT appear in the initial LLM-facing tool result — that path is separate (see next finding).

### Finding: The LLM-facing oversized seam is the tool-wrapper's `toModelOutput` (corrected during audit)

**Confidence:** CONFIRMED
**Evidence:** `tool-wrapper.ts:111`

```ts
// tool-wrapper.ts:111
toModelOutput: ({ output }: { output: unknown }) => buildToolResultForModelInput(output),
```

Every AI-SDK-wrapped tool sets `toModelOutput` to this function. When the AI SDK serializes the tool result into the message stream, this hook runs on the raw tool output. There is **no oversized check here today** — raw outputs of any size flow through `buildToolResultForModelInput` (which caps text parts at `MAX_TOOL_RESULT_TEXT_PART_CHARS = 100_000` as a coarse char limit, not token limit, and does not exclude).

**Implications:** This is THE surgery site for Change A. Wrap `toModelOutput` to detect oversized raw outputs and return a structured error-shaped tool result (matching the `default-tools.ts:214-246` `retrieval_blocked` contract) instead of serializing the bloat.

### Finding: A retrieval-path exclusion already exists (for comparison)

**Confidence:** CONFIRMED
**Evidence:** `default-tools.ts:214-246`

The `get_reference_artifact` builtin tool checks `metadata.isOversized || metadata.retrievalBlocked` and returns a structured `{ status: 'retrieval_blocked', warning, reason, toolInfo, recommendation }` response. This is our template for the initial-execution exclusion in §6.4.

**Implications:** Consistent shape between initial-execution exclusion and retrieval exclusion. LLMs that have seen one will correctly interpret the other.

### Finding: Tool outputs flow to the LLM via `toModelOutput` → `buildToolResultForModelInput`

**Confidence:** CONFIRMED
**Evidence:** `tool-result-for-model-input.ts:123-171`

`buildToolResultForModelInput` takes a single tool output (`unknown`) and returns an AI SDK `ToolResultForModelInput`. Outputs are classified by shape: if the output has a `content: []` array (MCP-style), items are mapped to `text | image-data | image-url | file-data | file-url` content parts. Otherwise returned as `type: 'json'`.

**Important:** the function does NOT iterate over artifacts or reference `metadata.isOversized`. It receives whatever the tool returned. The oversized check must happen at the CALLER (`tool-wrapper.ts:111`) — not inside `buildToolResultForModelInput`.

**Implications:** Change A must wrap `toModelOutput` at `tool-wrapper.ts:111`. `buildToolResultForModelInput`'s signature and logic stay unchanged.

### Finding: A compact reference pattern already exists in conversation history rebuild

**Confidence:** CONFIRMED
**Evidence:** `conversations.ts:437-493`

During conversation-history compression preparation, tool results are replaced with compact references:
```
[Artifact: "<name>" (id: X) | <description> | <summary>]
```
Tool args truncated at 300 chars, summaries truncated at 1000 chars.

**Implications:** This format stays in use for **conversation-history rebuild** (historical references on subsequent turns). For the initial tool execution oversize exclusion, we use a different shape — the structured `retrieval_blocked`-style tool result (see next finding) — because the two contexts have different semantics (in-turn tool failure vs. historical reference).

### Finding: No agent-callable tool exists today for fetching full artifact content by ID

**Confidence:** CONFIRMED (absence confirmed by tool catalog review)
**Evidence:** `ArtifactService.getArtifactFull()` at `ArtifactService.ts:412-483` exists as an internal method but is not exposed as an agent tool. Tool discovery searches did not find any `get_artifact`-like builtin.

**Implications:** The reference stub must NOT advertise a retrieval path. Stub wording: `[Artifact "<name>" (id: <id>) — content omitted (~<N>K tokens, exceeds context budget). Content unavailable in this turn.]`

### Finding: Artifact data model fields

**Confidence:** CONFIRMED
**Evidence:** `ArtifactService.ts:899-906`

Key fields: `artifactId`, `toolCallId`, `name`, `description`, `type`, `data` (summaryData vs fullData), `metadata` (`isOversized`, `retrievalBlocked`, `originalTokenSize`, `contextWindowSize`, `toolName`, `toolArgs`).

**Implications:** `metadata.isOversized` is the filter signal for Change A. No schema change required.

## Gaps / follow-ups

- Binary payload sanitization in `BaseCompressor.ts:43-68` replaces image/file data with `[binary payload omitted]` for token estimation only — this is distinct from our artifact-exclusion logic and should not be conflated.
