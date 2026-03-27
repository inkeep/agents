## 2026-03-19

### Changes
- **Spec created:** FileUIPart output compliance — follow-up to PR #2709
- **evidence/output-pipeline-trace.md:** Created — full end-to-end trace of file part output pipeline
- **World model built:** from prior conversation analysis of Vercel AI SDK spec vs our implementation

### Pending (carried forward)
- D1-D3: Initial decision batch presented, awaiting user input

## 2026-03-19 (session 2)

### Changes
- **D1 decided:** Clean break — no backward-compat fields. No evidence of legacy consumers.
- **D2 decided:** Reshape in `toVercelMessage()`, not `resolveMessageBlobUris()`
- **D3 decided:** No streaming file parts in scope
- **D4 created & decided:** REST over SSE for history delivery — SSE analyzed and rejected
- **Q1 resolved → D1:** Clean break
- **Q2 resolved:** Manage UI uses `useChat` (hits `/run`), no file-part code — reshape not needed
- **Q3 resolved:** OpenAPI schema is untyped `z.record()` — no change needed
- **A2 confirmed:** Grepped manage UI — zero file-part references
- **R5 removed:** Backward compat no longer needed (D1)
- **G3 updated:** Changed from "no breaking change" to "clean break to spec-compliant shape"
- **Status → Approved:** All P0 questions resolved, scope frozen, ready for implementation
- **SSE spec created and evaluated:** `specs/2026-03-19-sse-conversation-history/` — concluded REST is superior

### Pending (carried forward)
- None — spec is approved and ready for implementation
