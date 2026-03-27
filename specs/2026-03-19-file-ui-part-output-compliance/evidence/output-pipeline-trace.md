---
title: Output Pipeline Trace — File Parts
description: End-to-end trace of how file parts flow from DB storage through API responses. Covers both /run and /manage endpoints, blob URI resolution, and the gap with Vercel AI SDK FileUIPart spec.
created: 2026-03-19
last-updated: 2026-03-19
---

## 1. Database Storage Format (MessageContent)

**Source:** `packages/agents-core/src/types/utility.ts:87-109`
**Confidence:** CONFIRMED

File parts are stored in `message.content.parts[]` as:
```typescript
{
  kind: 'file',
  data: 'blob://v1/t_{tenantId}/media/p_{projectId}/conv/c_{conversationId}/m_{messageId}/sha256-{hash}.{ext}',
  metadata: { mimeType: 'image/png', detail?: 'auto' | 'low' | 'high', filename?: string }
}
```

- `data` holds either a `blob://` URI (after upload) or could theoretically hold a raw URI
- `metadata.mimeType` holds the IANA media type
- `metadata.detail` holds OpenAI image detail level (optional)
- `metadata.filename` will hold original filename after PR #2709 merges

## 2. /run Conversations Endpoint — `toVercelMessage()`

**Source:** `agents-api/src/domains/run/routes/conversations.ts:62-115`
**Confidence:** CONFIRMED

```typescript
// Line 95-98
} else if (kind === 'file') {
  const { kind: _k, type: _t, ...rest } = p as Record<string, unknown>;
  parts.push({ type: 'file', ...rest });
}
```

**What this produces:**
```json
{
  "type": "file",
  "data": "blob://v1/t_tenant/media/...",
  "metadata": { "mimeType": "image/png" }
}
```

**Issues:**
1. `data` field should be `url` per Vercel FileUIPart spec
2. `metadata.mimeType` should be top-level `mediaType`
3. No blob URI resolution — clients receive unparseable `blob://` URIs
4. `filename` (from metadata) not promoted to top-level field

## 3. /manage Conversations Endpoint — resolveMessageBlobUris()

**Source:** `agents-api/src/domains/manage/routes/conversations.ts:184`
**Confidence:** CONFIRMED

The manage endpoint DOES call `resolveMessagesListBlobUris(messages)` which converts blob URIs to proxy URLs. However:
- It does NOT reshape the part structure (still uses `kind`/`data`/`metadata`)
- Output shape: `{ kind: 'file', data: 'http://api.example.com/manage/tenants/.../media/...', metadata: { mimeType: '...' } }`

## 4. resolveMessageBlobUris() Implementation

**Source:** `agents-api/src/domains/run/services/blob-storage/resolve-blob-uris.ts:9-32`
**Confidence:** CONFIRMED

- Only transforms `data` field from `blob://` to proxy URL
- Does NOT reshape part structure
- Filters out (drops) malformed blob keys with a warning
- Proxy URL format: `{apiBaseUrl}/manage/tenants/{tenantId}/projects/{projectId}/conversations/{conversationId}/media/{encodeURIComponent(tail)}`

## 5. Vercel AI SDK FileUIPart Spec

**Source:** https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart
**Confidence:** CONFIRMED

```typescript
type FileUIPart = {
  type: 'file';
  mediaType: string;   // IANA media type
  filename?: string;    // optional filename
  url: string;          // URL or Data URL
};
```

## 6. Vercel Stream Protocol File Part

**Source:** https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol#file-part
**Confidence:** CONFIRMED

```
data: {"type":"file","url":"https://example.com/file.png","mediaType":"image/png"}
```

## 7. Stream Helpers — No File Part Support

**Source:** `agents-api/src/domains/run/stream/stream-helpers.ts:13-48`
**Confidence:** CONFIRMED

The `StreamHelper` interface has no method for emitting file parts. Available methods: `writeRole`, `writeContent`, `streamData`, `streamText`, `writeError`, `complete`, `writeData`, `writeOperation`, `writeSummary`, and tool-streaming methods.

## 8. PR #2709 Does Not Touch Output Pipeline

**Source:** PR #2709 diff analysis
**Confidence:** CONFIRMED

PR #2709 modifies only:
- Input validation schemas (chat.ts types)
- Message part parsing (message-parts.ts)
- File upload/security infrastructure (image-* → file-* renames)
- Model input formatting (conversation-history.ts)

Does NOT modify: `toVercelMessage()`, `resolveMessageBlobUris()`, stream helpers, or manage conversations endpoint output.

## 9. Media Proxy Endpoint

**Source:** `agents-api/src/domains/manage/routes/conversations.ts:256-340`
**Confidence:** CONFIRMED

- Route: `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:id/media/:mediaKey`
- Validates against path traversal, null bytes, symlinks
- Returns file with `Content-Type` header and `Cache-Control: private, max-age=31536000, immutable`
- Handles 404 and 502 error cases
