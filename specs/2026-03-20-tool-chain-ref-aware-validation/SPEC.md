# Tool-Chain Ref-Aware Schema Validation — Retrospective Speclet

**Date:** 2026-03-20
**Type:** Retrospective (code already written)
**Status:** Implemented, tests passing

---

## Executive Summary

Agents support multi-step tool chaining where a tool call's arguments can reference the output of a prior tool call via sentinel objects (`{ $tool: "call_id", $path: "result.field" }`). Before this change, two failure modes existed:

1. **Schema rejection at call time.** The AI SDK validates tool arguments against each tool's input schema. Sentinel refs are not valid values for most schema types (e.g., `{ $tool: "..." }` is not a `string`), so the SDK would reject chained tool calls before they ever reached the executor — silently, with no visibility in OTEL, session events, or conversation history.

2. **Invalid resolved args after resolution.** When sentinel refs were resolved to their actual values, the resolved args were validated against the widened (ref-accepting) schema, not the original strict schema — meaning invalid resolved values could pass through to execution.

### What Was Built

**Ref-aware schema widening (`ref-aware-schema.ts`):** A recursive JSON Schema transformer that wraps every value-position node with `anyOf: [<original schema>, <sentinel ref schema>]`. The AI SDK sees a schema that accepts both real values and sentinel refs, so it never rejects a tool call at parse time for containing a ref.

**Base schema preservation:** The original (pre-widened) schema is retained as `baseInputSchema` on each tool definition. After sentinel refs are resolved by `ArtifactParser`, the resolved args are validated against `baseInputSchema` — catching cases where resolution produced an invalid value.

**Invalid tool call observability (`handleInvalidToolResultsFromStep`):** A new `onStepFinish` callback catches `tool-error` content parts emitted by the AI SDK for schema-validation failures. For each one it emits an OTEL span, records session events for the SSE feed, and persists a message to conversation history — giving the same visibility as a normal tool call that errors during execution.

**Image schema simplification:** Removed the redundant `encoding: 'base64'` field from the `ImageInput` type and schema; encoding is now implicit.

### Architecture

```
AI SDK call time:
  args (may contain $tool refs)
    → validated against refAwareInputSchema  ← always passes for valid refs
    → execute() called

tool-wrapper execute():
  args
    → parseEmbeddedJson()           ← unescape embedded JSON
    → ArtifactParser.resolveArgs()  ← swap $tool refs for real values
    → validate against baseInputSchema  ← catches bad resolved values
    → originalExecute(resolvedArgs)

onStepFinish callback:
  step.content[].type === 'tool-error'
    → OTEL span + session event + DB message  ← visibility for SDK-level rejections
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where to widen the schema | Value-position nodes only (properties, items, additionalProperties) — not structural nodes (anyOf/oneOf/allOf) | Prevents double-wrapping of combinators; sentinel refs are only valid as leaf values |
| Validation timing | After resolution, using `baseInputSchema` | Widened schema can't catch bad resolved values; original schema is the correct constraint |
| Error surface for SDK-level rejections | `onStepFinish` hook | `execute()` is never called for these errors; the only observation point is the step result |
| `encoding` field on image objects | Removed | Field was always `'base64'`; carrying it added schema surface with zero information |

### What's Not Covered

- **Partial resolution failures** (a ref resolves but the resolved value fails validation for only some fields) — surfaced as a thrown error, bubbles up as a normal tool execution failure.
- **Circular or missing refs** — handled upstream by `ArtifactParser`, not in scope here.
- **Ref-aware schema for A2A tool proxies** — not touched; those tools go through a different path.
