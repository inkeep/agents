# Binary Attachment Artifact Direction

## 1. Problem Statement

Binary files currently enter the system in two different ways:
- as user-attached files on chat messages
- as binary-bearing MCP/tool result content

Those binaries are visible to the model on the turn where they first appear, but they do not have a
clean, first-class continuity model across subsequent turns. Persisted conversation history is
primarily text-oriented, while the current branch’s binary extraction flow mostly activates after
binary data has already been embedded inside artifact payloads.

This creates three problems:
- multi-turn follow-up on a prior binary input is unreliable
- the system has to “extract binaries back out” of structured payloads later
- prompt/history/compression behavior is reasoning about a representation that is not the real
  long-term abstraction we want

This spec defines the preferred abstraction before this branch merges.

## 2. Goals

- Make binary files first-class artifacts at the moment they enter the system.
- Preserve same-turn model visibility for newly introduced binaries.
- Support later-turn follow-up on prior binaries through artifact references and lazy hydration.
- Use `toolCallId` as the primary grouping abstraction.
- Use explicit top-level references like:
  - “this message has attachment artifact X”
  - “this tool result produced attachment artifact Y”
- Avoid baking parent/child lineage into prompt or retrieval logic unless it clearly earns its keep.
- Preserve the useful parts of the current branch:
  - binary sanitization into blob-backed storage
  - separately addressable binary artifacts
  - trace visibility for binary extraction and hydration
- Define a path for binary artifact context that does not require per-binary model summarization or
  repeated full binary reinjection on later turns.

## 3. Non-Goals

- Fix token counting for base64-heavy payloads in this pass.
- Finalize retrieval-time enforcement for blob-backed binary artifacts.
- Redesign the full compression prompt or distillation prompt in this pass.
- Remove every use of `derivedFrom` from the broader system.
- Make prior binary files automatically inline-visible on every later turn.

## 4. Current State

- User uploads are persisted as blob-backed message parts.
- MCP/tool result binaries are visible on the current turn and can be persisted in tool-result
  message content.
- Persisted conversation history reconstruction is text-first and does not re-inject prior file
  parts into model context on later turns.
- The current branch successfully sanitizes inline binary payloads into blob storage.
- The current branch creates separate artifact rows for extracted binary payloads after those
  binaries have already appeared inside artifact data.
- Compression works at tool-call granularity, not per text block.
- Multiple text blocks from one tool call are currently summarized as one combined structured result.
- Trace emission for binary extraction works; the trace UI query bug has already been fixed.
- The branch currently uses `metadata.derivedFrom` to express parent/child lineage for extracted binaries.
- Oversized detection is currently based on the raw pre-sanitized payload, which can incorrectly block the stored parent artifact after binary content has been stripped.

## 5. Target State

- A binary file becomes a first-class artifact as soon as it enters the system.
- The current turn still passes that binary inline to the model.
- Subsequent turns do not depend on conversation-history reinjection of raw file parts.
- Instead, subsequent turns expose prior binaries through artifact references plus lazy hydration
  through `get_reference_artifact`.
- A user message can own an attachment artifact set.
- A tool call can produce an artifact set.
- Artifact sets are grouped primarily by ingress event:
  - message attachment set for user-provided files
  - `toolCallId` artifact set for tool-produced outputs
- Artifacts in a set are modeled as peer outputs.
- One peer artifact may serve as the structured or manifest-like representation of the tool result.
- Other peer artifacts may represent binary attachments or future chunked representations.
- Prompting and compression should reason about explicit attachment artifacts and artifact sets, not
  parent/child topology.

## 6. Proposed Direction

### 6.1 Core abstraction

Adopt:
- eager artifact creation for binary ingress
- same-turn inline delivery plus later-turn artifact retrieval
- explicit top-level attachment references from messages and tool results
- artifact set per `toolCallId`
- artifact set per user message attachment event
- peer artifacts
- optional `artifactRef` links
- optional lightweight artifact roles

Do not adopt as the primary model:
- “binary lives only in persisted message history” as the continuity mechanism
- required parent/child relationships
- lineage-dependent reconstruction logic
- prompt behavior that depends on “parent oversized, child relevant”
- “bury binary in arbitrary artifact JSON, then rescue it later” as the normal flow

### 6.2 Ingress model

For user-uploaded binaries:
- same turn:
  - pass the file to the model inline
  - persist the chat message as today
  - create one or more attachment artifacts immediately
  - persist an explicit top-level reference from the message to those attachment artifacts
- later turns:
  - expose the attachment artifacts in `available_artifacts`
  - allow the model to lazy-load them with `get_reference_artifact`

For MCP/tool-returned binaries:
- same turn:
  - pass the file content to the model inline as today
  - persist the tool-result message as today
  - create one or more attachment artifacts immediately
  - persist an explicit top-level reference from the tool result to those attachment artifacts
- later turns:
  - expose the related artifacts through the tool-call artifact set
  - allow the model to lazy-load them with `get_reference_artifact`

### 6.3 Artifact roles

Likely roles:
- `structured_result`
- `binary_attachment`
- `manifest`
- `chunk`

Decision:
- roles should be inferred initially from current artifact shape and MIME type
- do not add explicit role metadata in this iteration unless the inference path proves too brittle

### 6.4 Reference structure

Prefer explicit top-level structures over deep embedded references.

Prefer:
- message metadata or message parts that say “this message has attachment artifact X”
- tool-result metadata or tool-result content that says “this tool result produced attachment artifact Y”

Avoid:
- artifact references hidden deep inside arbitrary structured JSON payloads
- flows that require reading a parent artifact’s nested JSON to discover the true binary attachment
  topology

The child-artifact extraction machinery from the current branch is not part of the target design and
should be removed before merge unless a concrete migration blocker appears.

### 6.5 Binary artifact context

Binary artifact context should come from the tool-call result as a whole, not from assumed JSON ancestry.

Cheap context sources:
- metadata on the binary block itself
- tool-call-level synthesis over the combined non-binary content
- message-level attachment context for user-uploaded files
- ordinal or other correlation signals only when available and trustworthy

Constraint:
- do not make MCP block order a required contract for descriptor synthesis
- we need to work with third-party MCP servers whose content ordering details we do not control

This implies:
- no per-text-block summary model is required
- no default per-binary model summarization is required

### 6.6 Oversized semantics

Longer term, separate:

1. Diagnostic raw-payload size
- why compression happened

2. Retrieval enforcement
- whether a stored structured artifact is safe to hydrate into context
- whether a blob-backed binary artifact is safe to resolve at retrieval time

For now, stale parent oversized marking is acceptable as a testing aid but should not become the semantic model.

## 7. In Scope

- Decide the primary abstraction for binary-bearing tool results before merge.
- Decide the primary abstraction for binary-bearing user attachments before merge.
- Shift the branch direction toward ingress-time attachment artifact creation.
- Prefer explicit top-level attachment references from messages/tool results.
- Remove `derivedFrom` from this binary-artifact flow before merge.
- Keep artifact roles inferred initially rather than introducing explicit role metadata now.
- Establish the direction for binary-context synthesis.
- Align the spec with the current branch’s actual scope and design freedom.

## 8. Out of Scope

- Full implementation of retrieval-time blob enforcement
- Full distillation prompt rewrite
- Full migration plan for any unrelated uses of `derivedFrom`
- General artifact architecture beyond the binary-bearing tool-result case
- Automatic later-turn full binary reinjection into prompt history

## 9. Risks / Unknowns

- If roles remain implicit, compaction and retrieval logic may accrete brittle shape-based heuristics.
- If roles are made explicit too early, we may create a contract before we know the stable role taxonomy.
- If descriptor synthesis relies too heavily on ordinal matching, some tools may produce ambiguous binary/text alignment.
- If we keep lineage in this flow, the branch may harden a topology that does not match the desired long-term model.
- If message attachments and tool attachments use materially different reference shapes, the model may
  face two competing mental models for “binary from a prior turn.”
- If attachment artifacts are created eagerly without stable naming or dedupe rules, artifact volume
  may grow faster than expected.

## 10. Decision Log

| Status | Type | Decision |
|---|---|---|
| Confirmed | Cross-cutting | Use `toolCallId` as the primary grouping abstraction for binary-bearing tool results. |
| Confirmed | Cross-cutting | Treat binary ingress as artifact creation time, not something that is discovered only later inside artifact payloads. |
| Confirmed | Product | Preserve same-turn inline model visibility for newly introduced binaries. |
| Confirmed | Product | Use artifact-backed continuity for later-turn follow-up on prior binaries. |
| Confirmed | Technical | Prefer explicit top-level attachment references from messages and tool results over deep embedded references inside arbitrary artifact JSON. |
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
| OQ-3 | Technical | P1 | No | What exact persisted reference shape should user messages and tool results use for top-level attachment artifacts? |
| OQ-4 | Technical | P2 | No | What dedupe policy should apply when the same binary appears multiple times within one message, one tool call, or across a conversation? |

## 12. Assumptions

| ID | Confidence | Assumption | Verification Path |
|---|---|---|---|
| A-1 | High | The current branch is still unmerged enough that `derivedFrom` can be removed from this flow without compatibility burden from `main`. | Verified against `git diff origin/main...HEAD`. |
| A-2 | High | Compression currently treats multiple text blocks from one tool call as one combined structured result. | Verified from code inspection and discussion. |
| A-3 | High | Persisted conversation history alone is not the right long-term continuity mechanism for prior binary files. | Verified from code inspection and discussion. |

## 13. Future Work

- Revisit token counting after the forced-compression testing path is no longer needed.
- Define retrieval-time blob size enforcement.
- If needed, evolve compression/distillation prompts to speak in artifact-set language explicitly.
- Normalize message-attachment artifact references and tool-result attachment references into one
  durable prompt-facing model.
