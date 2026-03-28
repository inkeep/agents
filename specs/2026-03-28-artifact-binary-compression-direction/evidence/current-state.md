# Current State Evidence

## Verified Facts

- The current branch sanitizes inline binary payloads into blob-backed storage.
- The current branch creates separately addressable artifact rows for extracted binary payloads.
- Trace emission includes binary child count and ids; the manage UI route was patched to query and expose those attributes.
- Compression currently operates at `toolCallId` granularity.
- Multiple text blocks from one tool call are currently kept inside one combined tool-result artifact for compression/summarization.
- The current branch uses `metadata.derivedFrom` for extracted binary lineage.
- Oversized detection currently evaluates the raw pre-sanitized payload, which can leave the stored structured artifact with stale oversized/retrieval-blocked metadata.

## Source Inputs

- [artifact-binary-compression-findings.md](/Users/mike/src/agents-artifact_service_binary_refs/specs/artifact-binary-compression-findings.md)
- `git diff origin/main...HEAD`
- inspection of current branch files under:
  - `agents-api/src/domains/run/artifacts/`
  - `agents-api/src/domains/run/services/blob-storage/`
  - `agents-api/src/domains/run/session/`
  - `agents-manage-ui/src/app/api/traces/conversations/[conversationId]/`

