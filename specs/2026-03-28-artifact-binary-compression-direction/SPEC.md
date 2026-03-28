# Artifact Binary Compression Direction

## 1. Problem Statement

Binary-bearing tool results currently force the artifact system into an awkward state:
- compression operates at `toolCallId` granularity
- binary extraction creates additional artifacts
- the current branch models those extracted artifacts with parent/child lineage
- oversized detection is based on pre-sanitized payload size, which becomes semantically stale after binary stripping

The result is a mismatch between:
- how the system stores and retrieves artifacts
- how compression and prompting reason about them
- how we want agents to consume them

This spec defines the preferred abstraction before this branch merges.

## 2. Goals

- Make binary-bearing tool results fit the artifact model cleanly.
- Use `toolCallId` as the primary grouping abstraction.
- Avoid baking parent/child lineage into prompt or retrieval logic unless it clearly earns its keep.
- Preserve the useful parts of the current branch:
  - binary sanitization into blob-backed storage
  - separately addressable binary artifacts
  - trace visibility for binary extraction
- Define a path for binary artifact context that does not require per-binary model summarization.

## 3. Non-Goals

- Fix token counting for base64-heavy payloads in this pass.
- Finalize retrieval-time enforcement for blob-backed binary artifacts.
- Redesign the full compression prompt or distillation prompt in this pass.
- Remove every use of `derivedFrom` from the broader system.

## 4. Current State

- The current branch successfully sanitizes inline binary payloads into blob storage.
- The current branch creates separate artifact rows for extracted binary payloads.
- Compression works at tool-call granularity, not per text block.
- Multiple text blocks from one tool call are currently summarized as one combined structured result.
- Trace emission for binary extraction works; the trace UI query bug has already been fixed.
- The branch currently uses `metadata.derivedFrom` to express parent/child lineage for extracted binaries.
- Oversized detection is currently based on the raw pre-sanitized payload, which can incorrectly block the stored parent artifact after binary content has been stripped.

## 5. Target State

- A tool call can produce an artifact set.
- The artifact set is grouped primarily by `toolCallId`.
- Artifacts in that set are modeled as peer outputs.
- One peer artifact may serve as the structured or manifest-like representation of the tool result.
- Other peer artifacts may represent extracted binaries or future chunked representations.
- Optional explicit roles may distinguish artifact purpose.
- Prompting and compression should reason about “multiple artifacts from one tool call,” not parent/child topology.

## 6. Proposed Direction

### 6.1 Core abstraction

Adopt:
- artifact set per `toolCallId`
- peer artifacts
- optional `artifactRef` links
- optional lightweight artifact roles

Do not adopt as the primary model:
- required parent/child relationships
- lineage-dependent reconstruction logic
- prompt behavior that depends on “parent oversized, child relevant”

### 6.2 Artifact roles

Likely roles:
- `structured_result`
- `binary_attachment`
- `manifest`
- `chunk`

Decision:
- roles should be inferred initially from current artifact shape and MIME type
- do not add explicit role metadata in this iteration unless the inference path proves too brittle

### 6.3 Binary artifact context

Binary artifact context should come from the tool-call result as a whole, not from assumed JSON ancestry.

Cheap context sources:
- metadata on the binary block itself
- tool-call-level synthesis over the combined non-binary content
- ordinal or other correlation signals only when available and trustworthy

Constraint:
- do not make MCP block order a required contract for descriptor synthesis
- we need to work with third-party MCP servers whose content ordering details we do not control

This implies:
- no per-text-block summary model is required
- no default per-binary model summarization is required

### 6.4 Oversized semantics

Longer term, separate:

1. Diagnostic raw-payload size
- why compression happened

2. Retrieval enforcement
- whether a stored structured artifact is safe to hydrate into context
- whether a blob-backed binary artifact is safe to resolve at retrieval time

For now, stale parent oversized marking is acceptable as a testing aid but should not become the semantic model.

## 7. In Scope

- Decide the primary abstraction for binary-bearing tool results before merge.
- Remove `derivedFrom` from this binary-artifact flow before merge.
- Keep artifact roles inferred initially rather than introducing explicit role metadata now.
- Establish the direction for binary-context synthesis.
- Align the spec with the current branch’s actual scope and design freedom.

## 8. Out of Scope

- Full implementation of retrieval-time blob enforcement
- Full distillation prompt rewrite
- Full migration plan for any unrelated uses of `derivedFrom`
- General artifact architecture beyond the binary-bearing tool-result case

## 9. Risks / Unknowns

- If roles remain implicit, compaction and retrieval logic may accrete brittle shape-based heuristics.
- If roles are made explicit too early, we may create a contract before we know the stable role taxonomy.
- If descriptor synthesis relies too heavily on ordinal matching, some tools may produce ambiguous binary/text alignment.
- If we keep lineage in this flow, the branch may harden a topology that does not match the desired long-term model.

## 10. Decision Log

| Status | Type | Decision |
|---|---|---|
| Confirmed | Cross-cutting | Use `toolCallId` as the primary grouping abstraction for binary-bearing tool results. |
| Confirmed | Technical | Treat extracted binary artifacts as peer outputs, not required children. |
| Confirmed | Technical | Remove `derivedFrom` from this binary-artifact flow before merge rather than preserving lineage as a core concept. |
| Confirmed | Technical | Infer artifact roles initially from artifact shape and MIME type rather than adding explicit role metadata in this iteration. |
| Confirmed | Technical | Derive binary context from tool-call-level non-binary content plus block-local metadata, not parent JSON ancestry. |
| Confirmed | Technical | Do not depend on MCP block order as a required descriptor-synthesis contract; use broader correlation signals when available. |

## 11. Open Questions

| ID | Type | Priority | Blocking | Question |
|---|---|---|---|---|
| OQ-1 | Technical | P1 | No | What retrieval-time enforcement model should apply to blob-backed binary artifacts? |
| OQ-2 | Technical | P1 | No | What correlation signals should descriptor synthesis prefer when ordinal is absent, ambiguous, or untrustworthy? |

## 12. Assumptions

| ID | Confidence | Assumption | Verification Path |
|---|---|---|---|
| A-1 | High | The current branch is still unmerged enough that `derivedFrom` can be removed from this flow without compatibility burden from `main`. | Verified against `git diff origin/main...HEAD`. |
| A-2 | High | Compression currently treats multiple text blocks from one tool call as one combined structured result. | Verified from code inspection and discussion. |

## 13. Future Work

- Revisit token counting after the forced-compression testing path is no longer needed.
- Define retrieval-time blob size enforcement.
- If needed, evolve compression/distillation prompts to speak in artifact-set language explicitly.
