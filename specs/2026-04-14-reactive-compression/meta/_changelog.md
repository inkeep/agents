# Changelog

Append-only record of spec process decisions and changes.

## 2026-04-14 — Session 1 (initial)

- Initial spec created, baseline commit `a074f63cd`.
- Prior research from /plan session captured in `evidence/` files:
  - `current-compression-triggers.md` — map of today's compression trigger points.
  - `oversized-artifact-handling.md` — how oversized artifacts currently reach the LLM.
  - `provider-overflow-signals.md` — Anthropic/OpenAI/AI SDK overflow semantics.
  - `middleware-approach.md` — why `wrapLanguageModel` preserves the multi-step loop.
- User decisions from plan session carried forward (see SPEC.md §10 Decision Log):
  - DEC-01: Retry budget = 1 (LOCKED).
  - DEC-02: Terminal failure = hard fail, no fallback (LOCKED).
  - DEC-03: No artifact retrieval tool; reference stub only (LOCKED).
  - DEC-04: Swap wholesale, no feature flag (LOCKED).
  - DEC-05: No auto-reduce of `max_tokens` on retry (LOCKED).
  - DEC-06: Middleware via `wrapLanguageModel`; do not wrap outer `generateText` (LOCKED, 1-way door — critical constraint).
  - DEC-07: Stream peek-first-chunk via async-iterator `.next()`, no `tee()`/array buffering (LOCKED).

## 2026-04-14 — Session 1 (audit + challenger resolution)

Audit findings written to `meta/audit-findings.md`; challenger findings to `meta/design-challenge.md`. All findings assessed per `/eng:assess-findings` protocol.

**Pure corrections applied (no user input needed):**
- A-H1: Corrected `ConversationCompressor` → `MidGenerationCompressor` references in §§4, 5, 6.3 where mid-gen is meant. Both classes exist and extend `BaseCompressor`; `handlePrepareStepCompression` imports `MidGenerationCompressor`.
- A-H2: Corrected `_oversizedWarning` injection-site citations. Real sites: `BaseCompressor.ts:407` + `ArtifactService.ts:751`. `artifact-utils.ts` only detects.
- A-M2: Added `streamText` call-site at `generate.ts:309` (in addition to non-streaming `:318-320`).
- A-M3: Clarified `prepareStep` wiring at `generate.ts:85-98` is retained; only the compression branch is removed.
- A-M4 / C-#6: Rewrote §6.2 middleware pseudocode with the correct `@ai-sdk/provider@3.0.4` shape. `doGenerate`/`doStream` are nullary; retry via `options.model.doGenerate(modified)` / `options.model.doStream(modified)`.
- A-L1: R4 rewritten — asserts step count, tool-call ordering, callback counts (not final message text equality, which is non-deterministic).
- A-L2: R6 rewritten — asserts specific patterns (`.next()`, prepend-then-pipe generator, no `tee()`/array buffering) instead of unbenchmarkable "microseconds."
- A-L3: DEC-04 reversibility corrected to "Reversible (via revert)."
- C-#1: DEC-06 rationale strengthened — "an outer catch at step N>1 would lose completed tool calls from steps 1..N-1 and re-execute them."
- C-#5: Added DEC-14 naming pre-gen conversation-history compression as the safety-net for non-tool-result context growth.
- C-#7: Added DEC-11 explicitly rejecting `transformParams`.
- C-#8: Added DEC-13 — middleware constructed per-request via factory closing over run context. Updated §§5, 6.2, 6.3, 16 to reflect.
- C-#2: Added Future Work entry — retry-budget ladder revisit trigger (`compression.outcome = 'second_overflow'` rate exceeds 5% of retries for 2+ weeks post-ship).

**Decision-implicating findings resolved with user input:**
- A-H3 / C-#3: Real surgery seam for oversized-exclusion is `tool-wrapper.ts:111` wrapped `toModelOutput`, not `buildInitialMessages` / `buildToolResultForModelInput`. Verified by code trace. Added DEC-12 locking this seam. §4, §5, §6.4, §7.1, R1, §16 all updated.
- C-#3 split decision: Initial-execution exclusion uses structured error-shaped tool result matching `default-tools.ts:214-246` `retrieval_blocked` shape. Conversation-history rebuild continues using `conversations.ts:437-493` compact text reference. DEC-09 updated.
- `_oversizedWarning` removal confirmed for BOTH `BaseCompressor.ts:407` and `ArtifactService.ts:751`. `metadata.isOversized` remains as durable filter signal. DEC-10 updated.

**Findings dismissed with reasoning:**
- Challenger #4 (post-commit mid-stream hard-fail): dismissed. No viable recovery without cross-layer protocol changes; current design is correct.

**Evidence files updated:**
- `evidence/oversized-artifact-handling.md` — replaced incorrect "oversized artifacts inlined" finding with the corrected three-finding picture (detection-only in `artifact-utils`, injection at two downstream sites, actual LLM seam at `tool-wrapper.ts:111`). Added `default-tools.ts:214-246` retrieval-path precedent.

## 2026-04-14 — Session 1 (finalization)

Final quality-bar pass completed:
- **Mechanical adversarial checks:** No ASSUMED decisions remain. All 14 decisions in the log are LOCKED or DIRECTED at HIGH confidence. DEC-06 (1-way door) has evidence-backed rationale.
- **Resolution completeness gate** — all In Scope items pass:
  - Change A (artifact exclusion): seam is pinpointed at `tool-wrapper.ts:111`; stub contract matches existing `default-tools.ts:214-246` shape; test plan verifiable.
  - Change B (reactive middleware): AI SDK `wrapLanguageModel` shape verified against installed `@ai-sdk/provider@3.0.4`; per-request factory pattern specified; retry budget + terminal failure behavior specified; streaming peek mechanism specified with verifiable code-review test.
  - Telemetry (Change C): attribute names specified; drift-detection on Anthropic regex covered.
  - No dependencies on Out of Scope items.
- **Non-goal accuracy:** conversation-history compression NEVER — stable contract the user explicitly confirmed. Feature flag NEVER — user directive (swap wholesale). Bedrock/Azure/Google detection NOT NOW — extend per-provider post-ship.
- **Baseline commit stamped:** `a074f63cd` (unchanged from spec creation — no drift during spec process).

Spec status → `ready-for-implementation`.
