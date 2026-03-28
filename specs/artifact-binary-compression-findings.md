# Artifact Binary Compression: Current Direction

## Scope

This note captures the current design and implementation direction for binary-bearing tool results and artifact compression in this branch.

The main scenario that drove this work was a Zendesk `read_ticket(...)` result containing:
- structured ticket data
- multiple image attachments
- enough inline/base64 content to trigger artifact compression

## What We Know

### Binary extraction works

The current branch successfully:
- sanitizes inline binary payloads into blob-backed storage
- creates separately addressable artifact rows for extracted binary payloads
- surfaces binary extraction in tracing

### Trace visibility works after the UI fix

The trace bug was in query selection, not span emission.

The branch now exposes:
- `artifact.binary_child_count`
- `artifact.binary_child_ids`

in the trace UI via:
- [route.ts](/Users/mike/src/agents-artifact_service_binary_refs/agents-manage-ui/src/app/api/traces/conversations/[conversationId]/route.ts)

### Compression currently works at tool-call granularity

Compression does **not** summarize each text block separately.

For a single tool call:
- the compressor creates one artifact keyed by `toolCallId`
- the full tool result is stored as one combined payload
- multiple text blocks remain grouped inside that payload
- distillation sees one artifact-backed tool-result entry per tool call

Design consequence:
- there is no existing per-text-block compression model to preserve
- any future binary-context extraction should be an explicit tool-call-level synthesis step

### Oversized detection is currently wrong for binary/base64-heavy results

Today, oversized detection is based on the raw pre-sanitized tool result.

That means:
- inline base64 inflates token estimates
- the parent structured artifact can be marked oversized and retrieval-blocked even after binary payloads have been stripped out

This is acceptable for now because it helps force compression and exercise the new binary-artifact path, but it is not the correct long-term behavior.

## Design Decisions

### 1. The primary unit is the tool call, not a parent/child artifact tree

The strongest relationship is:
- multiple artifacts produced by one `toolCallId`

Not:
- one parent artifact with child artifacts

Why:
- grouping, retrieval, and prompting are naturally tool-call-centric
- the current branch already treats compression at tool-call granularity
- parent/child is a branch-local implementation detail, not a good long-term abstraction

### 2. `derivedFrom` should not become a design pillar

Current conclusion:
- do not preserve `derivedFrom` just because this branch introduced it for binary extraction
- if possible, remove it from this new flow before merge

Reasoning:
- provenance questions here are really “what did this tool call produce?”
- cleanup, debugging, and retrieval are also tool-call-centric
- the current branch is still unmerged, so we are not constrained by backward compatibility with this lineage model

Important nuance:
- this does **not** necessarily mean deleting every use of `derivedFrom` from the broader system
- it means we should avoid making it core to this binary-artifact design

### 3. Artifacts should be modeled as peer outputs with roles

Preferred model:
- artifact set per `toolCallId`
- peer artifacts, not required parent/child relationships
- optional cross-artifact references (`artifactRef`)
- lightweight artifact roles if needed

Likely roles:
- `structured_result`
- `binary_attachment`
- `manifest`
- `chunk`

We may already infer some of this from shape and MIME type today, but an explicit role field is likely cleaner if heuristics become brittle.

### 4. One structured artifact may act as a manifest peer

We still want one artifact that represents the structured/textual side of the tool result.

That artifact can act as a manifest-like peer by carrying:
- the structured result
- refs to binary artifacts
- any compact descriptor metadata we derive for those binaries

This is a role distinction, not a lineage distinction.

### 5. Binary context should come from the tool-call result, not “the parent JSON”

Binary extraction here is better understood as:
- tool result contains heterogeneous content blocks
- some are text/structured
- some are file/image-like
- binary artifacts are created from those file/image-like blocks

So the right context sources are:
- block-local metadata
- ordinal / block order
- the combined non-binary content from the same tool call

Not:
- assumed JSON ancestry
- parent/child storage topology

## Implementation Direction

### Keep

Keep the parts of the branch that already look correct:
- sanitizing inline binary payloads into blob storage
- creating separately addressable binary artifacts
- exposing binary extraction in traces
- allowing one tool call to yield multiple artifacts

### Change

Before merge, prefer to move toward:
- peer artifacts grouped by `toolCallId`
- no core logic that depends on reconstructing a tree
- no agent-facing language that depends on parent/child terminology
- optional explicit artifact roles if shape-based inference is not robust enough

### Compression / distillation direction

Compression and distillation should think in terms of:
- one tool call
- multiple artifact outputs
- different artifact roles or representations

Not:
- oversized parent plus relevant children

If we later want better binary descriptors, the right approach is:
- synthesize them at the tool-call level from the combined non-binary content
- attach them to binary peer artifacts

Not:
- summarize each text block separately
- or summarize each binary artifact by default

### Oversized / retrieval direction

Longer term, the system should distinguish:

1. Diagnostic size information
- how large the original raw tool result was
- why compression happened

2. Retrieval enforcement
- whether the stored structured artifact is safe to rehydrate into context
- whether resolving a blob-backed binary artifact is safe at retrieval time

The current pre-sanitization parent oversized flag is useful for testing, but semantically stale once binaries have been stripped.

## Prompting Direction

The agent should be told:
- these artifacts came from the same tool call
- they represent different usable outputs of that call
- use the artifacts that are relevant to the user’s unresolved task

The agent should **not** be taught to reason primarily in terms of:
- parent artifact
- child artifact
- lineage topology

## Branch Context

This design space is still largely contained within the current unmerged branch.

That means:
- we are not obligated to preserve branch-local choices like `derivedFrom`
- this is the right point to simplify the model before it hardens

## Open Questions

1. Should artifact roles be explicit metadata, or inferred from existing artifact shape/MIME type?
2. What is the right retrieval-time enforcement model for blob-backed binary artifacts?
3. How should tool-call-level descriptor synthesis align binary attachments to descriptors:
   - ordinal only
   - explicit block metadata when available
   - both
