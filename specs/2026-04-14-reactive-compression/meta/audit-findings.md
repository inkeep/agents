# Audit Findings

**Artifact:** `/Users/timothycardona/inkeep/agents/specs/2026-04-14-reactive-compression/SPEC.md`
**Audit date:** 2026-04-14
**Baseline commit verified:** `a074f63cd` (HEAD matches baseline — no drift)
**Total findings:** 10 (3 High, 4 Medium, 3 Low)

---

## High Severity

### [H] Finding 1: Spec repeatedly names `ConversationCompressor` as the mid-generation compressor; the actual class is `MidGenerationCompressor`

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** SPEC.md §4 "Target state", §5 "Unchanged", §6.3 "Compression for middleware", Decision Log context; evidence/current-compression-triggers.md lines 26, 80
**Issue:** The spec asserts `ConversationCompressor` is the compression mechanism reused by the middleware and that `isCompressionNeededFromActualUsage` is on it. In fact, the mid-generation compression mechanism is a separate class — `MidGenerationCompressor` — which extends `BaseCompressor` alongside `ConversationCompressor`. `handlePrepareStepCompression` imports and uses `MidGenerationCompressor` (ai-sdk-callbacks.ts:3). `isCompressionNeededFromActualUsage` is a `MidGenerationCompressor` method, not a `ConversationCompressor` method.
**Current text:**
- §4 target state: "The compression **mechanism** (`ConversationCompressor`, `BaseCompressor`, etc.) remains — reused by the middleware."
- §5 Unchanged: "`agents-api/src/domains/run/compression/ConversationCompressor.ts` — logic intact, reused by middleware retry."
- §6.3: "The middleware reuses `ConversationCompressor` / `BaseCompressor` to compress the `params.prompt`…"
- evidence/current-compression-triggers.md: `ConversationCompressor.ts:62-80 — isCompressionNeeded()` cited as the mid-generation trigger source.
**Evidence:**
- `agents-api/src/domains/run/compression/` contains three files: `BaseCompressor.ts`, `ConversationCompressor.ts`, `MidGenerationCompressor.ts`.
- `MidGenerationCompressor.ts:16` — `export class MidGenerationCompressor extends BaseCompressor`.
- `ConversationCompressor.ts:21` — `export class ConversationCompressor extends BaseCompressor`.
- `ai-sdk-callbacks.ts:3` — `import type { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';` and `handlePrepareStepCompression` takes `compressor: MidGenerationCompressor | null`.
- `isCompressionNeededFromActualUsage` is referenced on the mid-gen compressor in tests (`__tests__/ai-sdk-callbacks.test.ts:76, 95, 105, 115`).
- `ConversationCompressor.ts:62-80` actually defines `isCompressionNeeded(messages)` — a different method used by conversation-history compression.
**Status:** CONTRADICTED
**Suggested resolution:** Replace `ConversationCompressor` with `MidGenerationCompressor` in §4 "Target state", §5 "Unchanged", §6.3, and the evidence file. Also reconsider which compressor class STOP_IF rules in §16 protect — the current rule ("modifying `ConversationCompressor` behavior") may guard the wrong class, since the middleware will actually call `MidGenerationCompressor`.

---

### [H] Finding 2: `_oversizedWarning` is not injected at `artifact-utils.ts:72-114`; injection happens in `BaseCompressor.ts:407` and `ArtifactService.ts:751`

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** SPEC.md §1 Complication (2), §4 Current state; evidence/oversized-artifact-handling.md lines 36-47
**Issue:** The spec and evidence say `_oversizedWarning` is injected into `summaryData` at `artifact-utils.ts:72-114`. The function at that range (`detectOversizedArtifact`) only *returns* an `OversizedDetectionResult` with a top-level `oversizedWarning` field (no underscore). The actual `_oversizedWarning` injection into `summaryData` occurs at two callsites: `BaseCompressor.ts:407` (`summaryData._oversizedWarning = oversized.oversizedWarning`) and `ArtifactService.ts:751` (`_oversizedWarning: oversizedDetection.oversizedWarning` inside `enhancedSummaryData`).
**Current text:**
- §1: "flagged with `metadata.isOversized = true`, and receive a `_oversizedWarning` text field — but the field is added **inside** `summaryData`"
- §4 current state: "`detectOversizedArtifact` in `artifact-utils.ts` detects >30% artifacts and injects `_oversizedWarning` into `summaryData`."
- evidence/oversized-artifact-handling.md: cites `artifact-utils.ts:72-114` for the injection.
**Evidence:** `artifact-utils.ts:109` sets `result.oversizedWarning = …` on the returned detection object. The field is named `oversizedWarning` (no leading underscore). The underscore-prefixed `_oversizedWarning` is only applied downstream when the detection result is merged into `summaryData` at `BaseCompressor.ts:407` and `ArtifactService.ts:751`. Grep confirms these are the only production sites that assign `_oversizedWarning`.
**Status:** CONTRADICTED (imprecise enough to mislead implementation)
**Suggested resolution:** In §1 and §4, point to `BaseCompressor.ts:407` + `ArtifactService.ts:751` as the sites where `_oversizedWarning` is actually injected into `summaryData`. Update DEC-10 and STOP_IF in §16 ("Removing the `_oversizedWarning` field breaks a downstream consumer") to list both injection sites — otherwise the implementer will only look at `artifact-utils.ts` and miss `ArtifactService.ts:751` (which is in the SCOPE of the spec's removal: "remove `_oversizedWarning` injection") but is NOT in the SCOPE file list in §16. Add `ArtifactService.ts` to SCOPE or reframe the removal as a `BaseCompressor.ts` + `ArtifactService.ts` change.

---

### [H] Finding 3: `buildInitialMessages` does not fetch or inline artifacts — spec's architecture diagram and R1 are misaligned with actual code

**Category:** FACTUAL / INCOHERENT
**Source:** T1 (codebase)
**Location:** SPEC.md §4 target state, §5 architecture diagram, §6.4, R1 acceptance criterion; evidence/oversized-artifact-handling.md line 25
**Issue:** The spec's architecture diagram and §4 target state both place `buildInitialMessages()` as the function that fetches `ArtifactService.getContextArtifacts` and filters oversized artifacts. But the actual `buildInitialMessages` at `conversation-history.ts:171-191` has the signature `(systemPrompt, conversationHistory, userMessage, fileParts)` and only pushes `system` + `user` text messages plus file parts. It does not fetch artifacts, does not take any artifact input, and is not in the artifact-inlining path. Artifact handling at message-build time lives elsewhere (ArtifactService is called during conversation history assembly via `getConversationHistoryWithCompression` in `conversations.ts`, not in `buildInitialMessages`).
**Current text:**
- §5 diagram: "`conversation-history.ts → buildInitialMessages()` ├─ fetch artifacts (ArtifactService.getContextArtifacts) ├─ [NEW] filter out artifacts where metadata.isOversized === true"
- §4 target state: "`buildToolResultForModelInput` and `buildInitialMessages` **filter out oversized artifacts** before building content parts…"
- R1 AC: "Unit test on `buildToolResultForModelInput` + `buildInitialMessages` with an oversized fixture artifact; assert AI SDK content parts."
- §6.4: "In `buildToolResultForModelInput` and `buildInitialMessages`: `for (const artifact of artifacts) { … }`"
**Evidence:**
- `conversation-history.ts:171-191` — actual `buildInitialMessages` signature and body do not reference artifacts. No call to `ArtifactService.getContextArtifacts` in the file.
- `grep ArtifactService /Users/timothycardona/inkeep/agents/agents-api/src/domains/run/agents/generation/conversation-history.ts` returns no matches.
- `buildToolResultForModelInput` at `tool-result-for-model-input.ts:123-171` also does not iterate `for (const artifact of artifacts)` — it takes a single `output: unknown` parameter and maps MCP content items. Artifact filtering as written in §6.4 would not fit its current shape.
- The `conversations.ts:437-493` compact-reference format the spec points to is in `getConversationHistoryWithCompression`, not `buildInitialMessages`. The in-repo artifact-to-content path runs through conversation history serialization + tool result serialization, and oversized `summaryData` reaches the model via tool-result mapping when the stored artifact carries `_oversizedWarning` in its `summaryData`.
**Status:** INCOHERENT / CONTRADICTED — the spec's artifact-exclusion surgery targets the wrong functions.
**Suggested resolution:** Rewrite §4 target state, §5 diagram, §6.4, and R1 to target the actual artifact-to-content seam. Investigate which callsite actually turns an artifact's `summaryData` into AI SDK content parts (likely during tool-result mapping or inside `getConversationHistoryWithCompression` / `formatMessagesAsConversationHistory`). The fix should land at the seam where oversized `summaryData` becomes prompt content, not inside `buildInitialMessages`. This likely also changes the SCOPE file list in §16.

---

## Medium Severity

### [M] Finding 4: §5 architecture lists `conversation-history.ts` as a changed file but no artifact-fetch or filter code lives there to change

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §5 Changed files, §16 SCOPE
**Issue:** §5 asserts `conversation-history.ts` needs a "same filter during initial message assembly," and §16 puts it in SCOPE. But as shown in Finding 3, nothing in `conversation-history.ts` currently fetches or inlines artifacts — there's no filter to add there. Keeping it in SCOPE without the actual seam creates a misleading work list.
**Current text:** §5 "`conversation-history.ts` — same filter during initial message assembly."
**Evidence:** See Finding 3 citations.
**Status:** INCOHERENT
**Suggested resolution:** Depends on the resolution of Finding 3. If the true seam turns out to be in a different file, replace `conversation-history.ts` in §5/§16 with that file.

---

### [M] Finding 5: `generate.ts:318-320` citation points to `generateText` but spec's claim about "no retry wrapper" applies equally to `streamText` at line 309 — the wrapper will wrap both

**Category:** COHERENCE / FACTUAL
**Source:** L4 (evidence fidelity)
**Location:** SPEC.md §4 current state; evidence/current-compression-triggers.md line 22
**Issue:** The spec cites only `generateText` at `generate.ts:318-320` as the "no retry wrapper" site. But `generate.ts:309` calls `streamText` on the same config under the `shouldStream` branch. The middleware wraps the model and therefore covers both paths, but the current-state description reads as if only `generateText` is unwrapped.
**Current text:** §4: "`generateText` call at `generate.ts:318-320` has no retry wrapper for overflow errors"
**Evidence:** `generate.ts:308-320`:
```
if (shouldStream) {
  const streamResult = streamText(generationConfig as Parameters<typeof streamText>[0]);
  rawResponse = await handleStreamGeneration(...);
} else {
  rawResponse = (await generateText(...));
}
```
**Status:** INCOHERENT (minor but implementer-relevant)
**Suggested resolution:** Note both call sites in §4 current state, or rephrase as "The call sites at `generate.ts:308-320` (both `streamText` and `generateText`) have no retry wrapper."

---

### [M] Finding 6: `prepareStep` wiring is cited at `generate.ts:85-98` in evidence, but the spec's §5 shows it wired in `ai-sdk-callbacks.ts`; actual wiring location differs

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** evidence/current-compression-triggers.md line 21
**Issue:** Evidence cites `generate.ts:85-98` as the AI SDK `prepareStep` wiring. At the baseline commit, lines 85-98 are inside `buildGenerationConfig` (or similar), and `prepareStep` is wired at `generate.ts:85-98` — verified. But the spec's §6.3 / §6.4 refactor surface is `ai-sdk-callbacks.ts` (the callback body), while the *wiring* is in `generate.ts`. Not contradicted, just worth confirming the implementer knows both locations exist.
**Current text:** evidence/current-compression-triggers.md: "`generate.ts:85-98` — AI SDK `prepareStep` wiring"
**Evidence:** `generate.ts:85-98` shows `prepareStep: async ({ messages: stepMessages, steps }) => { return await handlePrepareStepCompression(...) }`. Matches the claim. Citation verified.
**Status:** CONFIRMED on citation but note for implementer: the token-budget branch of `handlePrepareStepCompression` in `ai-sdk-callbacks.ts:11-191` is the code to remove; `generate.ts:85-98` wiring remains (the callback still runs for other logic per §5).
**Suggested resolution:** Clarify in §5 that `generate.ts:85-98` wiring is untouched; only the body in `ai-sdk-callbacks.ts` changes. Not a blocker; the spec already says "callback still runs for other pre-step logic" in §8.

---

### [M] Finding 7: §6.2 middleware pseudocode contains an admitted shape mismatch with the actual AI SDK API

**Category:** COHERENCE
**Source:** L3 (missing conditionality) / L4
**Location:** SPEC.md §6.2
**Issue:** The pseudocode in §6.2 says:
> `return await doGenerate({ ...params, prompt: compressedPrompt });`
> `// NOTE: AI SDK's wrapGenerate provides doGenerate without args; adapt to whatever shape the runtime exposes; conceptually: retry with modified prompt.`

The inline NOTE admits the proposed call shape is not how the SDK actually exposes `doGenerate` — `wrapGenerate` provides `doGenerate` without args, so re-invoking with modified params requires a different mechanism (e.g., wrapping the params at middleware entry and re-calling a closed-over implementation, or invoking via the `model` reference). This is a load-bearing detail: if the shape is truly incompatible, DEC-06 "1-way door" is not yet architecturally validated — precisely the thing STOP_IF(2) says to escalate on.
**Current text:** §6.2 pseudocode + inline NOTE as quoted above.
**Evidence:** AI SDK `LanguageModelV2Middleware` `wrapGenerate({ doGenerate, doStream, params, model })` — the `doGenerate` typically takes no arguments; re-invocation with modified params is done by intercepting `params` before the first call, not by re-calling `doGenerate(params)`. The spec's own STOP_IF clause 2 anticipates this risk. The spec presents the approach as LOCKED with HIGH confidence (DEC-06) while the mechanism is not actually confirmed to work.
**Status:** INCOHERENT — HIGH-confidence locked 1-way-door decision rests on a pseudocode sketch whose inline NOTE flags an API-shape uncertainty.
**Suggested resolution:** Before finalization, resolve the re-invocation shape. Either (a) confirm via AI SDK source that `wrapGenerate` exposes a re-callable path with modified params and update §6.2 with the correct shape, or (b) downgrade DEC-06 confidence and keep STOP_IF(2) as the explicit escalation trigger. The spec cannot be both LOCKED/HIGH and carrying an inline "adapt to whatever shape the runtime exposes" note.

---

## Low Severity

### [L] Finding 8: R4 acceptance criterion overclaims "identical" final message text

**Category:** COHERENCE (L2 / L3)
**Location:** SPEC.md R4
**Issue:** R4 requires "identical: step count, tool-call ordering, `onStepFinish` invocations, `prepareStep` invocations, and final message text — compared to an unwrapped run for cases where no overflow occurs." LLM outputs are non-deterministic; asserting text equality is not verifiable even in no-overflow runs unless the test mocks the provider. The other fields (counts, orderings, invocation counts) are testable.
**Current text:** R4 AC as quoted.
**Evidence:** Standard LLM non-determinism; temperature=0 does not guarantee byte-identical outputs across calls.
**Status:** INCOHERENT (verifiability)
**Suggested resolution:** Replace "final message text" with "final message structure" or scope the equality claim to "when the provider is mocked to return identical responses." The intent — middleware is side-effect-free on the happy path — can be tested via mock.

---

### [L] Finding 9: R6 says "unit-level, not load test" benchmark — not a reliable way to verify "within microseconds"

**Category:** COHERENCE (L3 — missing conditionality)
**Location:** SPEC.md R6
**Issue:** R6 AC specifies "a benchmark test comparing TTFT distributions (unit-level, not load test)." Microsecond-level deltas are below the noise floor of most JS unit benchmarks (GC, V8 tiering). The intent is defensible but the AC reads as a falsifiable unit test — it isn't.
**Current text:** R6 AC.
**Evidence:** Node.js microbenchmark variance is typically >100μs; asserting <microseconds delta is not reproducible without specialized tooling.
**Status:** INCOHERENT (verifiability)
**Suggested resolution:** Either (a) downgrade R6 to a structural assertion ("first-chunk peek uses `.next()` and prepend-pipe; no `.tee()`, no array buffering — verified by source inspection / lint rule / test hook") and drop the benchmark, or (b) reframe the benchmark goal as "no regression > X ms at p99 over N iterations" with a concrete threshold.

---

### [L] Finding 10: DEC-04 is tagged "1-way within scope" but the change is actually reversible — it's wholesale swap, not a burn-the-bridge decision

**Category:** COHERENCE (L2 — confidence/reversibility labeling)
**Location:** SPEC.md §10 Decision Log, DEC-04
**Issue:** DEC-04 "Swap wholesale; no feature flag" is labeled "1-way door within scope." Swapping wholesale is a deployment strategy; it is reversible via revert. Calling it 1-way conflates "no gradual rollout" with "no going back." The distinction matters because STOP_IF / audit readers will treat DEC-04 as requiring the same evidence rigor as DEC-06 (true 1-way).
**Current text:** DEC-04 Reversibility column: "1-way within scope."
**Evidence:** A feature flag decision is by definition reversible (revert the commit or re-add the flag).
**Status:** INCOHERENT (labeling)
**Suggested resolution:** Retag DEC-04 as "Reversible" with a note "wholesale swap — revert via code, not via runtime flag." Keep the LOCKED status.

---

## Confirmed Claims (summary)

- **Baseline commit drift:** HEAD (`a074f63cd`) matches the spec's baseline commit — no drift.
- **File existence of all citations:** All cited files exist at stated paths at baseline.
- **ai-sdk-callbacks.ts:11-191 (`handlePrepareStepCompression`):** Exists, range is accurate, logic matches the prose description (token-budget trigger, compressor.safeCompress, synthetic user message injection).
- **artifact-utils.ts:72-114 (`detectOversizedArtifact`):** Exists, range accurate, 30% threshold (`Math.floor(contextWindowSize * 0.3)`) confirmed at line 94.
- **model-context-utils.ts:175-265:** Compression parameters (threshold/bufferPct tiers) match evidence (75%/83%/91%).
- **conversations.ts:437-493:** Compact artifact-reference pattern (`[Artifact: "<name>" (id: X) | description | summary]`, 300/1000 char truncation) confirmed as described.
- **ArtifactService.ts:147-187 (`getContextArtifacts`):** Exists at the cited range.
- **ArtifactService.ts:337-407 (`getArtifactSummary`):** Exists at the cited range.
- **ArtifactService.ts:412-483 (`getArtifactFull`):** Exists at the cited range.
- **BaseCompressor.ts:116-157:** `estimateTokens` and `calculateContextSize` confirmed in the cited region.
- **generate.ts:85-98 (prepareStep wiring):** Confirmed — matches evidence claim.
- **generate.ts:126-143 (handleGenerationError):** Confirmed.
- **External (OpenAI):** 400 + `context_length_exceeded` + `type: invalid_request_error` — confirmed via OpenAI community error library and standard error shape (multiple sources).
- **External (Anthropic):** 400 + "prompt is too long" / "input length and max_tokens exceed context limit" — confirmed via Anthropic error community + GitHub issues (anthropics/claude-code #42, #476).
- **External (413):** Anthropic byte-level limit via Cloudflare is a separate error class from context-overflow — consistent with spec's exclusion.
- **R3 / R5 / R7 / R8:** Verifiable as specified via unit/integration tests — the acceptance criteria are well-formed.
- **Evidence sources frontmatter:** All `sources:` files in the four evidence files exist.

## Unverifiable Claims

- **`wrapLanguageModel` / `LanguageModelV2Middleware` exact re-invocation shape** — Finding 7 above: the spec itself flags this as uncertain inline. Needs direct source inspection of the installed `ai` SDK version to confirm DEC-06 holds.
- **AI SDK streaming issues #4099, #4726, #8193, #12595 specifics** — referenced in evidence frontmatter but not spot-checked in this audit; the general claim (streaming errors can surface on three channels) is consistent with AI SDK public docs.
- **Anthropic wording stability (A1):** explicitly labeled MEDIUM confidence; unverifiable by nature.

---

## Coverage gaps (spec vs. evidence)

- **Evidence mentions binary payload sanitization** in `BaseCompressor.ts:43-68` (distinct from artifact exclusion) as a "do-not-conflate" note — the spec does not reference this, which is appropriate. No gap.
- **Evidence notes `MidGenerationCompressor` was not foregrounded** — but the class is exactly the one the spec most depends on (per Finding 1). This is a real gap: the evidence reports the correct import line (`ai-sdk-callbacks.ts:11-191`) but labels the mechanism as `ConversationCompressor`. The spec then propagates the mislabel.
- **ArtifactService.ts:751 is the second injection site for `_oversizedWarning`** — not in evidence, not in spec SCOPE. Spec will underscope the removal without it (Finding 2).
- **The true artifact-content-to-prompt seam** — evidence identifies "artifacts are serialized as structured AI SDK content blocks, inlined" (oversized-artifact-handling.md Finding 2) but the exact function that inlines oversized `summaryData` into the final prompt is not pinpointed in either evidence or spec. Finding 3's root cause.
