# Inline Text Document Attachments

## Status

Implemented on `feat/txt_attachments`.

## Problem Statement

The run APIs currently support inline image attachments and inline PDF attachments. This feature extends user attachments to include inline base64 text documents: `.txt`, Markdown, HTML, CSV, and `.log`-style files. The requested constraint is explicit:

- Inline base64 only
- No remote URLs for these document types

The goal is to let end users attach lightweight text documents to a chat request and have those documents included in model input and conversation persistence without widening the remote-file attack surface.

## Goals

- Accept inline base64 text document attachments in both run chat APIs.
- Persist those attachments safely without storing raw base64 in the database.
- Replay persisted attachments correctly in conversation history and downstream model input.
- Preserve the existing restriction against remote URLs for non-image document attachments.

## Non-Goals

- Support remote HTTP/HTTPS URLs for `.txt` or Markdown attachments.
- Support remote HTTP/HTTPS URLs for text-like documents.
- Change image attachment behavior.
- Add rich document rendering in the UI; this feature is about ingestion and model input, not browser-side preview semantics.

## Current State

### Verified behavior

- OpenAI-style chat request validation accepts inline base64 text document data URIs for:
  - `text/plain`
  - `text/markdown`
  - `text/html`
  - `text/csv`
  - `text/x-log`
- Vercel-style `parts[].type = 'file'` accepts the same text MIME types, but only as inline base64 data URIs.
- Inline file byte normalization currently admits:
  - allowed image formats via byte sniffing
  - `application/pdf` via a PDF signature check
  - allowed text document MIME types via MIME allowlist plus UTF-8 / text-safety validation
- Persisted user file parts are rewritten to blob storage and stored in conversation message parts as URI-backed files with `mimeType` metadata.
- Conversation-history model input mapping currently forwards:
  - images as AI SDK image parts
  - PDFs as AI SDK file parts
  - allowed text document MIME types as XML-tagged text blocks
- External PDF URLs remain supported. Remote text document URLs remain blocked to avoid widening the remote-file fetch surface.

### Remaining gaps / follow-up opportunities

- The server still relies on the submitter-provided MIME type for text documents rather than inferring type from filename extension.
- `text/html` is injected as raw HTML source, not rendered page text.
- Additional text-like formats such as JSON and XML are still out of scope.

### Persistence and replay model for v1

Text attachments should mirror the existing image/PDF attachment flow through ingestion and storage:

1. accept inline base64 input
2. validate and normalize the payload
3. upload the decoded bytes to blob storage
4. persist only a URI-backed file part plus MIME metadata in the conversation message record

Text attachments should diverge from the image/PDF flow only at generation-time replay:

- images continue to replay as image parts
- PDFs continue to replay as file parts
- accepted text document attachments are resolved from blob storage and injected transiently into model input as canonical XML-tagged text blocks

The text attachment contents must not be persisted into:

- database message rows
- stored conversation message text
- durable conversation-history text snapshots

The persisted source of truth remains the blob-backed file attachment record. Prompt injection is a transient generation concern only.

## Candidate Scope

### In Scope

- Request schema changes for:
  - OpenAI-style content items
  - Vercel-style message parts
- Inline file security and MIME allowlist updates for:
  - `text/plain`
  - `text/markdown`
  - `text/html`
  - `text/csv`
  - `text/x-log`
- A dedicated text-attachment size cap of `256 KB` decoded bytes per attachment
- Blob upload and persistence for these MIME types
- Conversation-history and generation-path mapping so persisted text documents reach the model
- Tests covering request validation, security checks, blob rewrite, persistence, and generation input

### Explicitly Deferred

- `application/json`
- `application/xml` / `text/xml`
- Any remote URL support for non-image documents
- Any HTML rendering, DOM extraction, or sanitization pipeline beyond raw text decoding
- Any MIME autodetection from filename extension on the server

## Product Surface Area

- Run API: `POST /run/v1/chat/completions`
- Chat API: `POST /run/api/chat`
- Conversation retrieval APIs returning persisted file parts
- OpenAPI schema and generated docs for run endpoints
- SDK/provider-facing behavior through the AI SDK message content passed to models
- Prompt formatting conventions for attached text documents

## Internal Surface Area

- Request schemas in `agents-api/src/domains/run/types/chat.ts`
- Message part extraction in `agents-api/src/domains/run/utils/message-parts.ts`
- Inline file validation in `agents-api/src/domains/run/services/blob-storage/file-content-security.ts`
- Blob upload and persisted-message conversion in `agents-api/src/domains/run/services/blob-storage/file-upload.ts`
- Conversation-history replay in `agents-api/src/domains/run/agents/generation/conversation-history.ts`
- Generation telemetry in `agents-api/src/domains/run/agents/generation/generate.ts`
- Shared MIME/data-URI constants in `packages/agents-core/src/constants/allowed-file-formats.ts`

## Audience Impact

- Builder
  - Next publish / next deploy impact on run API request contracts
  - Potentially breaking only if we change existing validation semantics; additive support should be non-breaking
- Platform User
  - Next deploy impact if any first-party UI starts emitting these file parts later
- Contributor
  - Immediate impact in tests and type contracts

## Technical Direction

### Baseline implementation shape

1. Expand shared allowed-file-format constants to include text document MIME types and data URI matching.
2. Update OpenAI-style file content validation to allow inline text document data URIs, not just PDF.
3. Keep the no-remote-URL rule for non-image document attachments.
4. Extend inline file normalization:
   - images continue using byte sniffing
   - PDFs continue using signature checks
   - text documents use MIME allowlist plus UTF-8 / text-safety validation
5. Persist accepted files to blob storage and continue storing only URI-backed message parts in the database.
6. Extend conversation-history mapping so accepted text documents reach model input instead of being dropped.
7. Standardize model-input mapping so all accepted text documents are injected as XML-tagged text blocks for every provider.
8. Add route, service, and agent-generation tests for the new MIME types and canonical injection behavior.

### Canonical text attachment injection template for v1

When a text attachment is prepared for model input, append it to the user message content as a distinct text block using this canonical template:

```xml
<attached_file filename="<filename-or-unnamed>" media_type="<mime-type>">
<decoded utf-8 text content>
</attached_file>
```

Formatting rules:

- One injected block per attachment
- Preserve original attachment order
- Use `unnamed.txt` when filename metadata is absent for `text/plain`
- Use `unnamed.md` when filename metadata is absent for `text/markdown`
- Use `unnamed.html` when filename metadata is absent for `text/html`
- Use `unnamed.csv` when filename metadata is absent for `text/csv`
- Use `unnamed.log` when filename metadata is absent for `text/x-log`
- Insert the attachment blocks after the primary user text and before any tool-generated or system-added context
- Do not wrap the attachment body in markdown code fences, because the content itself may already contain Markdown fences
- Normalize line endings to `\n` before injection
- Do not attempt HTML/Markdown rendering; inject raw decoded text only
- For `text/html`, inject raw HTML source, not rendered page text
- The server does not infer MIME type from filename extension; the submitter-provided MIME type controls handling

Rationale:

- Simpler code path
- Consistent behavior across providers
- No provider detection logic
- Less coupling to AI SDK or provider capability changes

### Security constraints

- No remote fetching for text document attachments
- Enforce a dedicated `256 KB` decoded-byte limit for text attachments
- Reject malformed base64
- Reject non-text binary payloads masquerading as allowed text document MIME types
- Avoid any browser-side rendering requirement that could create XSS pressure for this feature
- Do not persist decoded text attachment contents into conversation rows or message text fields

## Key Risks

- Provider compatibility may differ across model backends even if our internal AI SDK types allow generic file parts.
- Text sniffing is weaker than image/PDF signature sniffing; the acceptance rule must be conservative enough to reject opaque binary data.
- Token usage may grow sharply if large text attachments are replayed directly into model context.
- The injection path must be deterministic, because any divergence in labeling/formatting changes prompt behavior across providers.
- Standardizing on injection may leave some provider-native file handling quality on the table, but it minimizes operational and compatibility risk.
- Treating `text/html` as raw source may not match end-user expectations if they expect webpage understanding instead of source understanding.
- CSV and log files can expand prompt usage quickly despite the byte cap.

## Acceptance Criteria

1. OpenAI-style chat requests can submit inline base64 `text/plain`, `text/markdown`, `text/html`, `text/csv`, and `text/x-log` file attachments.
2. Vercel-style chat requests can submit inline base64 file parts for the same MIME types.
3. Remote URLs for these document types are rejected or dropped; only inline base64 is accepted.
4. Accepted text document attachments are uploaded to blob storage and persisted as URI-backed file parts, not raw base64.
5. Persisted text document attachments are replayed into generation input instead of being dropped.
6. Text document attachments are always injected into model input as `<attached_file ...>` XML blocks, regardless of provider.
7. The injected plain text form preserves enough metadata for the model to distinguish message text from attachment text, including filename when available.
8. Decoded text attachment contents are not persisted into database conversation content or stored conversation-history text.
9. Malformed base64, payloads over `256 KB` decoded bytes, and binary payloads mislabeled as text are rejected.
10. Existing image and PDF attachment behavior remains unchanged.

## Test Plan

- Route tests for both chat endpoints accepting the new text document MIME types
- Security tests for:
  - malformed base64
  - oversized payloads
  - binary bytes mislabeled as text
- File upload tests verifying blob rewrite and persisted MIME metadata
- Agent generation tests verifying:
  - text document parts are injected into XML attachment blocks for all providers
  - injected text follows the canonical template exactly
- Conversation retrieval tests verifying returned file parts preserve MIME metadata
- Persistence tests verifying text attachment contents are not written into DB message text/content fields

## Open Questions

1. Is `256 KB` the right default cap for decoded text attachments, or do we want a lower limit for stricter prompt-budget protection?
2. Do we want server-side MIME fallback from filename extension for cases like `.log` uploaded as `text/plain` or with a missing/generic media type?
3. Is this scope limited to API ingestion, or do we also want first-party manage/chat UIs to expose authoring or preview support in a later project?

## Recommendation

The implemented version is:

- accept inline base64 only
- keep remote URLs disallowed
- support `text/plain`, `text/markdown`, `text/html`, `text/csv`, and `text/x-log`
- set a dedicated `256 KB` decoded-byte cap for text attachments
- inject accepted text documents as XML-tagged text blocks for all providers

If we later decide provider-specific file support is worth the extra complexity, we can revisit preserving MIME-specific file parts. The main follow-up decision is whether to add server-side MIME fallback from filename extension for clients that omit or underspecify text media types.
