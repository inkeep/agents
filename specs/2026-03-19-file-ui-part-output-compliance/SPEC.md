# FileUIPart Output Compliance — Spec

**Status:** Approved
**Owner(s):** Andrew
**Last updated:** 2026-03-19
**Links:**
- Predecessor: PR #2709 (`pdf/support`) — fixes input pipeline
- Evidence: `./evidence/output-pipeline-trace.md`
- Vercel AI SDK spec: https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart
- SSE analysis: `../2026-03-19-sse-conversation-history/` (evaluated and rejected SSE-first history delivery — REST is superior for caching, compression, error handling)

---

## 1) Problem statement
- **Who is affected:** SDK consumers using the Vercel AI SDK `useChat()` / `useAssistant()` hooks, and any client consuming the `/run/conversations/{id}` endpoint
- **What pain:** File parts (images, PDFs) returned from the conversations endpoint don't match the Vercel AI SDK `FileUIPart` spec. Clients receive `{ type: 'file', data: 'blob://...', metadata: { mimeType } }` when they expect `{ type: 'file', mediaType, url }`. The `blob://` URIs are not resolvable by any client.
- **Why now:** PR #2709 adds PDF file support to the input pipeline. Once PDFs flow through the system, the broken output pipeline becomes more visible — clients will see more file parts they can't render.
- **Current workaround:** The manage endpoint (`/manage/conversations/{id}`) resolves blob URIs to proxy URLs, but still uses the wrong field names. The `/run` endpoint doesn't resolve at all.

## 2) Goals
- G1: `/run/conversations/{id}` returns file parts matching Vercel AI SDK `FileUIPart` shape: `{ type: 'file', mediaType: string, url: string, filename?: string }`
- G2: Blob URIs are resolved to proxy HTTP URLs before reaching clients
- G3: Clean break to spec-compliant shape — no legacy field names

## 3) Non-goals
- NG1: Presigned URL generation — proxy pattern is correct and preferred
- NG2: Streaming file parts from model responses — model outputs rarely contain file parts; can be added later
- NG3: Changes to the database storage format — `MessageContent` shape stays as-is
- NG4: Changes to the input pipeline — covered by PR #2709
- NG5: SSE-based history delivery — analyzed and rejected (REST wins on compression, caching, error handling; see linked analysis)
- NG6: `/manage` endpoint reshaping — manage UI uses `useChat` (hits `/run`), not the manage conversations API

## 4) Personas / consumers
- **P1: Vercel AI SDK client** — Uses `useChat()` with our API as backend. Expects `FileUIPart` shape in message parts. This is the primary target.
- **P2: Direct API consumer** — Calls `/run/v1/conversations/{id}` directly. May or may not depend on exact field names, but `blob://` URIs are broken for everyone.

## 5) User journeys

### P1: Vercel AI SDK client — render image from conversation history
1. User sends message with image attachment → processed correctly (PR #2709)
2. Client calls `GET /run/v1/conversations/{id}` to load history
3. **Today:** Response contains `{ type: 'file', data: 'blob://...', metadata: { mimeType: 'image/png' } }` → SDK doesn't recognize this shape → image not rendered
4. **After fix:** Response contains `{ type: 'file', mediaType: 'image/png', url: 'https://api.example.com/manage/tenants/.../media/...' }` → SDK renders image correctly

### P1: Failure/recovery
- If blob URI resolution fails (malformed key): part is filtered out, image silently missing — this is existing behavior, acceptable
- If proxy endpoint returns 404: client shows broken image — existing behavior, no change

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | R1: File parts use `url` field instead of `data` | `toVercelMessage()` output has `url: string` for file parts | Field rename |
| Must | R2: File parts use top-level `mediaType` instead of `metadata.mimeType` | `toVercelMessage()` output has `mediaType: string` at top level | Field rename |
| Must | R3: Blob URIs resolved in `/run` conversations endpoint | No `blob://` URIs in API responses | Bug fix |
| Should | R4: `filename` promoted to top-level field | `toVercelMessage()` output has `filename?: string` when available | New field, additive |

### Non-functional requirements
- **Performance:** No additional latency — blob resolution is string manipulation, not I/O
- **Security:** Proxy URLs go through authenticated endpoints — no change to auth model
- **Operability:** Log when blob URI resolution fails (already exists)

## 7) Success metrics & instrumentation
- **Metric:** Vercel AI SDK clients can render file parts from conversation history without custom parsing
- **Instrumentation:** Existing logging in `resolveMessageBlobUris` covers resolution failures

## 8) Current state (how it works today)

### Storage → Output transformation

```
DB: { kind: 'file', data: 'blob://...', metadata: { mimeType: 'image/png' } }
        │
        ├─── /run endpoint ──► toVercelMessage() ──► { type: 'file', data: 'blob://...', metadata: { mimeType } }
        │                      (no blob resolution)    ← BROKEN: blob:// not client-resolvable
        │
        └─── /manage endpoint ──► resolveMessageBlobUris() ──► { kind: 'file', data: 'http://proxy/...', metadata: { mimeType } }
                                  (blob resolved, but wrong field names)    ← WRONG SHAPE: data/metadata instead of url/mediaType
```

### Key constraints
- `MessageContent` type is shared across many consumers — DB storage format must not change
- `resolveMessageBlobUris()` operates on `MessageContent` (uses `kind: 'file'` and `part.data`) — any reshaping must happen after or alongside resolution
- The `/manage` media proxy endpoint uses `/manage/tenants/...` path — both endpoints resolve to the same proxy

## 9) Proposed solution (vertical slice)

### Approach: Resolve blob URIs, then reshape in `toVercelMessage()`

**Step 1:** Add blob URI resolution to `/run` conversations route — call `resolveMessagesListBlobUris()` on messages before passing to `toVercelMessage()`, same as manage endpoint does.

**Step 2:** Update `toVercelMessage()` file part handling — reshape from internal format to `FileUIPart`:

```typescript
// Before (current):
} else if (kind === 'file') {
  const { kind: _k, type: _t, ...rest } = p as Record<string, unknown>;
  parts.push({ type: 'file', ...rest });
}

// After:
} else if (kind === 'file') {
  const url = typeof p.data === 'string' ? p.data : undefined;
  const meta = p.metadata as Record<string, unknown> | undefined;
  const mediaType = typeof meta?.mimeType === 'string' ? meta.mimeType : undefined;
  const filename = typeof meta?.filename === 'string' ? meta.filename : undefined;
  parts.push({
    type: 'file',
    ...(url && { url }),
    ...(mediaType && { mediaType }),
    ...(filename && { filename }),
  });
}
```

### Files to modify
1. `agents-api/src/domains/run/routes/conversations.ts` — add `resolveMessagesListBlobUris()` import + call before `toVercelMessage()`, update file part reshaping in `toVercelMessage()`
2. `agents-api/src/__tests__/run/routes/conversations.test.ts` — update test assertions for new file part shape

### Alternatives considered

**Option A: Reshape inside `resolveMessageBlobUris()`** — mutate the part structure during blob resolution.
- Rejected: Conflates blob resolution (data concern) with API contract formatting (presentation concern). Would also affect manage endpoint.

**Option B: SSE-first history delivery** — stream conversation history through the chat SSE stream.
- Rejected after detailed analysis: REST wins on compression (5x smaller with gzip), caching (304 on revisit = 0 bytes), error handling (atomic responses), and conversation switching. SSE adds implementation complexity with no meaningful performance gain. See `specs/2026-03-19-sse-conversation-history/`.

**Chosen: Reshape in `toVercelMessage()` after blob resolution** — keeps blob resolution and API formatting as separate concerns. Minimal code change (~10 lines).

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Clean break — output only `FileUIPart` fields, no backward-compat `data`/`metadata` | T | No | **Decided** | No evidence of any client using old field names. Manage UI confirmed clean (A2). Feature is new enough that no legacy consumers exist. Avoids dual-format confusion. | evidence/output-pipeline-trace.md, A1, A2 | Cleaner response, spec-compliant |
| D2 | Reshape in `toVercelMessage()`, not in `resolveMessageBlobUris()` | T | No | **Decided** | Keeps blob resolution separate from API contract formatting | evidence/output-pipeline-trace.md §4 | — |
| D3 | No streaming file part support in this scope | T | No | **Decided** | Model outputs rarely contain file parts; no current use case | evidence/output-pipeline-trace.md §7 | — |
| D4 | REST over SSE for history delivery | T | No | **Decided** | REST wins on compression (5x), caching (304), error handling (atomic), simplicity | SSE analysis in sibling spec | Fix REST endpoint, don't build SSE history |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should we include backward-compat fields or clean-break? | T | P0 | Yes | Clean break — no evidence of legacy consumers | **Resolved → D1** |
| Q2 | Should `/manage` endpoint also reshape? | P | P1 | No | Manage UI uses `useChat` (hits `/run`). No file-part code in manage UI. | **Resolved — not needed** |
| Q3 | Does OpenAPI snapshot need updating? | T | P1 | No | Schema uses `z.record(z.string(), z.unknown())` — fully untyped. No change needed. | **Resolved — no** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | No external client depends on `data` field name for file parts | MEDIUM | Manage UI confirmed clean. SDK consumers expect `FileUIPart`. Widget code uses SDK. | — | Active (accepted risk — low likelihood, clean break is correct call) |
| A2 | Manage UI has no file-part-specific rendering code | CONFIRMED | Grepped entire `agents-manage-ui/src` — zero matches for mimeType, mediaType, kind.*file, type.*file | — | Confirmed |
| A3 | PR #2709 will merge before this work begins | HIGH | PR is in review | Before implementation | Active |

## 13) In Scope (implement now)

All decisions made. Resolution completeness gate:
- [x] All decisions that affect this item have been made (D1-D4)
- [x] No 3P dependency selections needed
- [x] Architectural viability validated (reshape in existing function, add one import + call)
- [x] Integration confirmed (resolveMessagesListBlobUris already works in manage endpoint)
- [x] Acceptance criteria verifiable (test file part shape in response)
- [x] No dependency on Future Work items

**Deliverables:**
1. Fix `toVercelMessage()` to output `{ type: 'file', mediaType, url, filename? }` (R1, R2, R4)
2. Add `resolveMessagesListBlobUris()` call in `/run` conversations route handler (R3)
3. Update tests for new output shape
4. Changeset for `agents-api` (patch — bug fix)

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Unknown client depends on `data` field | Low | Medium | Feature is new, no evidence of consumers. If discovered, can add `data` back (reversible). | — |

## 15) Future Work

### Explored
- **Streaming file parts in new responses**
  - What we learned: StreamHelper has no `writeFile()` method. Vercel protocol supports native `file` event type with `{ url, mediaType }`.
  - Recommended approach: Add `writeFile(params: { url: string, mediaType: string })` to StreamHelper interface + implementations
  - Why not in scope now: No current use case — model outputs are text/tool-calls, not files
  - Triggers to revisit: When agents start returning file attachments in responses (e.g., generated PDFs, charts)

- **SSE-based conversation history delivery**
  - What we learned: Technically feasible (clean injection window exists in both stream routes), but REST is superior on every efficiency dimension — compression (5x), caching (304s), error handling (atomic), conversation switching.
  - Why not in scope: Solves a problem that doesn't exist (HTTP/2 eliminates round-trip overhead) while creating real problems (no caching, no compression, complex error handling)
  - Triggers to revisit: If real-time history sync is needed (new messages from other agents appearing live) — that's a push notification feature, not history loading
  - Full analysis: `specs/2026-03-19-sse-conversation-history/`

### Noted
- **`/manage` endpoint `FileUIPart` alignment** — could reshape manage output too for consistency, but manage UI uses `useChat` (which hits `/run`), so low priority
