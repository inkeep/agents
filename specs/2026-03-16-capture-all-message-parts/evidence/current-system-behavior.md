---
title: Current System Behavior - Message Part Persistence
description: Traces the write path (streaming → DB) and read path (DB → GET /conversations) for all message part kinds. Documents what's captured, what's lost, and where.
created: 2026-03-16
last-updated: 2026-03-16
---

## Write Path: How Parts Flow from Streaming to Database

### Agent Response Persistence (executionHandler.ts:518-537)

After AI SDK generation completes, executionHandler extracts `responseParts` from either:
- `streamedContent.parts` (from IncrementalStreamParser.allStreamedContent) — preferred
- `artifacts.flatMap(a => a.parts)` — fallback

Then maps ALL parts to only two kinds, **losing original structure**:

```typescript
// executionHandler.ts:527-531 (CURRENT - after US-001 fix uses 'kind')
parts: responseParts.map((part: any) => ({
    kind: part.kind === 'text' ? 'text' : 'data',
    text: part.kind === 'text' ? part.text : undefined,
    data: part.kind === 'data' ? JSON.stringify(part.data) : undefined,
})),
```

**Confidence: CONFIRMED** — verified from source code.

### What IncrementalStreamParser Captures

`allStreamedContent: StreamPart[]` where `StreamPart = TextPart | FilePart | DataPart`

Parts are added via:
- `processTextChunk()` → TextPart (kind: 'text')
- `streamPart()` → any StreamPart (text, file, or data)

**Tool calls are NOT captured.** They go directly from `tool-wrapper.ts` to the stream helper, bypassing the parser entirely.

**Confidence: CONFIRMED** — verified from source code (IncrementalStreamParser.ts:37, 215, 390, 490).

### Tool Call Flow (tool-wrapper.ts)

Tool calls flow through this sequence, called directly on the StreamHelper:
1. `writeToolInputStart({toolCallId, toolName})` — line 114
2. `writeToolInputDelta({toolCallId, inputTextDelta})` — line 117 (16-byte chunks)
3. `writeToolInputAvailable({toolCallId, toolName, input, providerMetadata?})` — line 120
4. `writeToolOutputAvailable({toolCallId, output})` — line 240

These are fire-and-forget to the SSE/Vercel stream. However, **AgentSession records these events**:
- `recordEvent('tool_call', subAgentId, {toolName, input, toolCallId, ...})` — line 142
- `recordEvent('tool_result', subAgentId, {toolName, output, toolCallId, duration, ...})` — line 223

**Confidence: CONFIRMED** — verified from source code.

### Image/File Upload Path

User-uploaded images flow through `image-upload.ts`:
1. Base64 or URL → downloaded/normalized → uploaded to blob storage (S3/Vercel Blob/local)
2. Stored as `blob://v1/t_{tenant}/media/...` URI in message content
3. Original bytes are **never persisted** in the database

File parts in the DB look like:
```json
{ "kind": "file", "data": "blob://v1/t_xyz/media/p_abc/conv/c_123/m_msg/sha256-hash.png", "metadata": {"mimeType": "image/png"} }
```

**Note:** `resolve-blob-uris.ts` can convert blob URIs to proxy URLs, but this is NOT called in the GET /conversations read path currently.

**Confidence: CONFIRMED** — verified from source code (image-upload.ts, resolve-blob-uris.ts).

---

## Read Path: GET /conversations → toVercelMessage()

### Current Behavior (after US-001/002/003 fixes)

`toVercelMessage()` in conversations.ts now handles:
- **Text**: extracted from `content.text` or text parts → `{ type: 'text', text }`
- **Data parts**: `kind: 'data'` (or legacy `type: 'data'`) → `{ type: 'data', data: parsed }` with JSON parsing
- **File parts**: `kind: 'file'` → `{ type: 'file', ...rest }`
- **Tool calls**: `content.tool_calls[]` → `{ type: 'tool-invocation', toolCallId, toolName, args, state: 'result' }`

### What's Still Missing

| Content Type | Streamed Live? | Stored in DB? | Returned by GET? | Gap |
|---|---|---|---|---|
| Text | Yes | Yes | Yes | None |
| Data/Artifacts | Yes | Yes (but collapsed to kind:'data') | Yes (after fix) | None |
| File/Images | N/A (user upload) | Yes (blob URI) | Yes (after fix) | Blob URI not resolved to proxy URL |
| Tool Calls | Yes | **No** (never persisted) | Dead code path | **Write path doesn't persist** |
| Tool Results | Yes | No | N/A | **Write path doesn't persist** |
| Operations | Yes | No | N/A | Ephemeral by design |
| Summaries | Yes | No | N/A | Ephemeral by design |

### Other Consumers of content.parts

Multiple internal consumers read `content.parts`:
- `extractMessageText()` in conversations.ts DAL — filters for `kind === 'text'`
- `resolve-blob-uris.ts` — processes `kind === 'file'` parts
- `ResponseFormatter.ts` — filters `kind === 'text'` and `kind === 'data'`
- `reconstructMessageText()` in conversations.ts — uses `type: 'text'` and `type: 'data'` (legacy)
- Artifact compression — extracts `kind === 'data'` parts

**Confidence: CONFIRMED** — verified from source code.
