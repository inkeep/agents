---
title: Write Path Part Kinds Analysis
description: What part kinds actually reach responseParts in executionHandler.ts at persistence time. Finding: only 'text' and 'data' — never 'file'.
created: 2026-03-17
last-updated: 2026-03-17
---

## Finding: responseParts contains only 'text' and 'data' kinds

**Confidence: CONFIRMED** — verified from source code types and all code paths.

### StreamPart type (IncrementalStreamParser.ts:29-33)

```typescript
export interface StreamPart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
}
```

The type itself constrains to only two kinds.

### Where parts are added to allStreamedContent

| Location | Kind | What creates it |
|---|---|---|
| IncrementalStreamParser.ts:215 | `'text'` | processObjectDelta() — text from structured output |
| IncrementalStreamParser.ts:373 | `'text'` | finalize() — remaining buffer |
| IncrementalStreamParser.ts:390 | `'text'` | finalize() — pending text buffer |
| IncrementalStreamParser.ts:490 | `'text'` or `'data'` | streamPart() — generic part handler |
| IncrementalStreamParser.ts:254 | `'data'` | streamComponent() via artifactParser |

### Artifact parts (generateTaskHandler.ts:499-504)

```typescript
const parts: Part[] = (response.formattedContent?.parts || []).map((part: any): Part => {
  if (part.kind === 'data') {
    return { kind: 'data' as const, data: part.data };
  }
  return { kind: 'text' as const, text: part.text };
});
```

Also collapses to only 'text' and 'data'.

### Do agents emit file parts?

**No.** File parts only appear in user message input (image uploads via chat route). They are checked in generateTaskHandler.ts:63-72 for model capability validation but never appear in the response artifacts or streamedContent.

### Implication

The lossy mapping in executionHandler.ts:527-531 (`kind: part.kind === 'text' ? 'text' : 'data'`) is **functionally correct for the current system** — it maps the only two kinds that actually exist. The "preserve-all" fix would be a defensive/forward-compatibility improvement, not a bug fix.
