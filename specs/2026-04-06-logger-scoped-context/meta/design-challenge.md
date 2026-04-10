# Design Challenge Findings

**Artifact:** specs/2026-04-06-logger-scoped-context/SPEC.md
**Challenge date:** 2026-04-06
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H] Finding 1: WeakMap caching invalidation gap when `recreateInstance()` is called

**Category:** DESIGN
**Source:** DC2
**Location:** Section 9 (Proposed solution — ALS proxy pattern with WeakMap-cached children)
**Issue:** The proposed `PinoLogger` design adds a `private alsChildCache = new WeakMap<PinoLoggerInstance, PinoLoggerInstance>()` that caches ALS-context-enriched children keyed by the ALS pino instance. However, the existing `PinoLogger` class has `recreateInstance()`, `addTransport()`, `removeTransport()`, and `updateOptions()` methods that replace `this.pinoInstance` at runtime. When `resolveInstance()` falls back to `this.pinoInstance` (outside ALS scope), it correctly uses the current instance. But when inside an ALS scope, the cached child was created from a *previous* ALS parent via `alsInstance.child({ module: this.name })` — the child's underlying stream/transport comes from the ALS parent, not from `this.pinoInstance`. This means `addTransport()` or `updateOptions()` on the `PinoLogger` wrapper has no effect on log calls made inside an ALS scope.

This is an active concern, not theoretical: `agents-cli/src/index.ts` calls `configLogger.updateOptions({ level: 'silent' })` to suppress config-loading logs. If an ALS scope were active at that point (unlikely for CLI, but demonstrates the pattern exists), the level change would be invisible to ALS-proxied calls. More importantly, `addTransport()` is a public method designed for runtime transport reconfiguration — any transport added after ALS scope creation would be silently ignored for ALS-scoped calls.

**Current design:** "Per-call cost: `getStore()` (~5ns) + `WeakMap.get()` (~5ns) = ~10ns" — the caching approach optimizes for performance but doesn't address what happens when the `PinoLogger` wrapper is mutated after cache population.
**Alternative:** Clear the WeakMap in `recreateInstance()` so that the next ALS-scoped call rebuilds children from the current ALS parent. Cost: one extra `WeakMap.set()` per scope after reconfiguration. Or document that `addTransport()`/`updateOptions()` are not compatible with ALS-scoped loggers and consider deprecating the mutation methods in favor of immutable configuration.
**Trade-off:** The WeakMap clear is a one-line fix (`this.alsChildCache = new WeakMap()` in `recreateInstance()`), but it opens a deeper question: should `PinoLogger` support both runtime mutation AND ALS proxying? The spec doesn't acknowledge this tension. Alternatively, making the ALS child inherit from the `PinoLogger`'s own pino instance (merged with ALS bindings) rather than from the ALS pino instance would solve this, but at the cost of the pre-serialization benefit — the child would need to carry both ALS bindings and its own transport config.
**Status:** CHALLENGED
**Suggested resolution:** Address the `recreateInstance()` interaction explicitly in the spec. The simplest fix (clear the WeakMap on recreate) is likely sufficient for the current codebase, but the spec should document the constraint that ALS children inherit transports/options from the ALS parent scope's pino instance, not from the `PinoLogger` wrapper's instance.

---

### [H] Finding 2: The `.with()` method captures ALS context at call time — silent snapshot semantics may surprise callers

**Category:** DESIGN
**Source:** DC2
**Location:** Section 9 (Class member pattern), Section 5 (User journeys — Class member pattern)
**Issue:** The proposed `.with()` method calls `this.resolveInstance().child(bindings)` — meaning it snapshots the ALS context at call time and bakes it into a new `PinoLogger` that does NOT continue to proxy ALS. The spec's user journey shows:

```typescript
class AgentSession {
  constructor(sessionId: string) {
    this.logger = getLogger('AgentSession').with({ sessionId });
  }
}
```

This creates a logger in the constructor that captures whatever ALS context is active at construction time. If the `AgentSession` is later used in a *different* ALS scope (e.g., scheduled re-entry, re-use across requests, or a workflow step that reconstructs context), `this.logger` still carries the *original* construction-time ALS bindings. The spec's Q4 resolution says "When constructed inside ALS scope (most cases), inherits ambient context automatically via the proxy resolution. When constructed outside ALS (tests), gets explicit fields only. Both work correctly." But this overlooks the case where the object lives across scope transitions.

This is a stakeholder gap from the SRE/on-call perspective: log lines from a reused object could carry stale tenantId/projectId from a previous request, which is worse than missing context — it's *wrong* context, making debug sessions actively misleading.

**Current design:** ".with() captures current ALS context + explicit bindings at call time"
**Alternative:** Make the logger returned by `.with()` continue to proxy ALS (resolve at call time, not construction time), and only add the explicit `bindings` as additional fields. This preserves the "always current ALS context" property. The trade-off is slightly more per-call work (one extra `getStore()` + WeakMap lookup), but the cost is ~10ns — negligible vs. the risk of stale context.
**Trade-off:** If `.with()` returns a proxying logger, it must reconcile the explicit bindings with potentially different ALS bindings — field priority needs to be defined (explicit wins? ALS wins?). The snapshot approach is simpler and aligns with pino's immutable child semantics, but introduces the stale-context risk.
**Status:** CHALLENGED
**Suggested resolution:** The spec should explicitly address object lifecycle vs. ALS scope lifetime. Document whether `.with()` is intended for short-lived scopes (within a single request — where staleness isn't a risk) or for long-lived class members (where it is). If long-lived, either the returned logger should continue ALS proxying, or the spec should clearly document that classes which outlive their construction ALS scope must re-derive their logger. Examine the ~30 classes mentioned in D3 to determine which, if any, are reused across requests.

---

## Medium Severity

### [M] Finding 3: The spec claims "zero per-call overhead" but the proposed design adds ~10ns per call vs. current baseline

**Category:** DESIGN
**Source:** DC3
**Location:** Section 2 (Goals — G3), Section 6 (Non-functional requirements — Performance), Section 9 (Key properties of the proxy pattern)
**Issue:** Goal G3 states "Zero per-log-call performance overhead vs current baseline." The non-functional requirements section repeats: "Zero per-log-call overhead vs current baseline." However, the proposed design replaces the current direct `this.pinoInstance.info(data, message)` call with `resolveInstance()` which does `loggerStorage.getStore()` (~5ns) + WeakMap lookup (~5ns) = ~10ns. The spec acknowledges this cost in the "Key properties" subsection but still labels it "zero" in goals and requirements.

10ns is negligible in practice — it's ~0.05% of a typical pino log call (~23us per the evidence). But calling it "zero" is technically inaccurate and could mislead a reviewer who reads only the goals/requirements without reaching the implementation details. The previous call path was a direct property access + function call with genuinely zero overhead beyond the pino call itself.

**Current design:** "Zero per-log-call performance overhead vs current baseline" (G3, NFR)
**Alternative:** Rephrase as "negligible per-call overhead (~10ns, <0.05% of baseline pino call)" to be technically accurate.
**Trade-off:** No design change needed. This is a precision-of-language issue, not a design flaw.
**Status:** CHALLENGED
**Suggested resolution:** Update G3 and the NFR to accurately state the cost. The design is sound; the claim overreaches.

---

### [M] Finding 4: The Decision Log rejected Option B (explicit logger passing) based on invasiveness, but the spec introduces `runWithLogContext()` wrappers at ~270 call sites — comparable invasiveness

**Category:** DESIGN
**Source:** DC1
**Location:** Section 9 (Alternatives considered — Option B), Section 15 (Future Work — full migration)
**Issue:** The Decision Log rejects "explicit logger passing (no ALS)" because it is "too invasive, requires changing every function signature." The user directed this rejection. However, the spec's own estimates show that the full migration requires ~270 `runWithLogContext()` wrappers and touching 136 files — which is also quite invasive, just differently invasive (wrapping function bodies vs. adding parameters).

The key difference is that `runWithLogContext()` wrappers are additive/incremental (existing code works without them — you just don't get ambient context), while function parameter changes are mandatory (callers must pass the logger or the code doesn't compile). This is a real and meaningful distinction. But the spec doesn't articulate *why* the invasiveness of Option B is qualitatively different from the invasiveness of the chosen approach — it merely states it was rejected for being "too invasive."

A genuinely simpler alternative exists that the spec doesn't consider: **do nothing at the API call sites; only add middleware + the proxy pattern.** The proxy pattern (D8) means all 204 module-scope loggers automatically get ALS context with zero code changes. The `.with()` method handles the class member case (~30 classes). The `runWithLogContext()` wrappers at function entry (~270) are the "nice to have" for operation-level context — but the middleware alone handles tenantId/projectId/agentId, which are the most-repeated fields (702 of 2,081 instances per the evidence). This gives ~34% of the field reduction with ~0% of the call-site changes.

**Current design:** Full solution with middleware + proxy + `.with()` + `runWithLogContext()` wrappers
**Alternative:** Phase 1 is just middleware + proxy (zero call-site changes, automatic tenantId/projectId/agentId on all logs). Defer `.with()` and `runWithLogContext()` wrappers to Phase 2 after validating the pattern.
**Trade-off:** The spec already phases this (core + top-10 files first, full migration later), so the phasing is partially addressed. But the initial scope includes `.with()` and `runWithLogContext()` wrappers in the "top 10 files," which is code-touching work. The alternative proposes an even smaller Phase 1 that touches only `logger.ts` and `createApp.ts`.
**Status:** CHALLENGED
**Suggested resolution:** The rejection of Option B should articulate the qualitative difference (additive vs. mandatory), not just cite "too invasive." Consider whether the In Scope work should be narrowed to just the proxy pattern + middleware (zero call-site changes) as a tighter Phase 1, with `.with()` and `runWithLogContext()` adoption as Phase 2. This reduces risk and validates the core mechanism before any downstream code changes.

---

## Low Severity

### [L] Finding 5: Test infrastructure impact underspecified — mock shape must change

**Category:** DESIGN
**Source:** DC2
**Location:** Section 13 (In Scope), Section 14 (Risks)
**Issue:** The existing test setup files (`agents-api/src/__tests__/setup.ts`, `packages/agents-work-apps/src/__tests__/setup.ts`) mock `getLogger` to return a plain object with `{ info, warn, error, debug, child, getPinoInstance }`. The proposed design adds a `.with()` method and changes the internal delegation model. The test mocks will need to be updated to include `.with()` (returning a mock with the same shape) and potentially `runWithLogContext` (if tests exercise middleware paths).

The spec lists "Existing tests pass without modification" as a verification criterion (Section 13, Deployment table), but this is only true for tests that don't mock the logger. Tests that DO mock the logger — which includes the global test setup for both `agents-api` and `agents-work-apps` — will need mock updates. The mock already has a `child` method (`child: vi.fn().mockReturnThis()`) and a `withRequestContext` mock, suggesting awareness of this issue, but the spec doesn't call it out as work.

**Current design:** "Existing tests pass without modification"
**Alternative:** N/A — not a design alternative, but a completeness gap. The spec should note that test mocks in `agents-api/src/__tests__/setup.ts` and `packages/agents-work-apps/src/__tests__/setup.ts` need `.with()` added, and `runWithLogContext` may need to be exported for mocking.
**Trade-off:** Minimal work — adding `with: vi.fn().mockReturnThis()` to the mock objects. But the claim "no modification" is misleading.
**Status:** CHALLENGED
**Suggested resolution:** Update Section 13's verification criterion to distinguish between "existing *application* code works without changes" (true) and "existing *test infrastructure* needs mock updates" (also true).

---

## Confirmed Design Choices (summary)

### DC1: Simpler alternative
- **ALS + pino child over data-bag mixin (D1):** The choice to store pino child loggers in ALS rather than a data bag with per-call merge is well-justified by the performance evidence. Pino's `chindings` pre-serialization is the key insight, and the evidence file confirms it. Held up.
- **`runWithLogContext` as the scope primitive (D6):** Mirrors the existing `refScopeStorage.run()` pattern in `ref-scope.ts`. Consistent with existing ALS patterns in the codebase. Held up.
- **Backward compatibility (D5):** The proxy pattern achieving zero call-site changes for 204 module-scope loggers is the strongest aspect of this design. Held up.

### DC2: Stakeholder gap
- **hono-pino independence (D9, A4):** Verified — hono-pino uses Hono context (`c.var.logger`), not ALS. The proposed middleware runs after hono-pino. No conflict. Held up.
- **Workflow step boundaries (D7):** ALS can't cross serialization boundaries. Steps must reconstruct context. This is correctly identified and addressed. Held up.
- **Fallback behavior:** `getStore()` returning `undefined` outside ALS scope falls back to the base logger. No crash path. Held up.

### DC3: Framing validity
- **SCR framing is sound.** The 2,081 repeated field instances across 1,207 calls is concrete, measurable, and verified from evidence. The complication's three dimensions (verbosity, inconsistency risk, maintenance drag) are genuinely interconnected — inconsistency is caused by verbosity (easy to forget fields when copying), and maintenance drag is caused by both (adding a field means editing every verbose call site, and missing the edit creates inconsistency). The resolution follows from the complication. Held up.
- **Demand is real.** The evidence shows 53% of logger calls include ambient fields that could be automated. tenantId alone appears 362 times. This is not hypothetical pain. Held up.
