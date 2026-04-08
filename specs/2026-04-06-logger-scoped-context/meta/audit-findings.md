# Audit Findings

**Artifact:** /Users/andrew/Documents/code/agents/agents/specs/2026-04-06-logger-scoped-context/SPEC.md
**Audit date:** 2026-04-06
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: Quantitative claims about file count are significantly wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Section 1 (Problem statement), Section 8 (Current state), Section 14 (Risks), Section 15 (Future Work)
**Issue:** The spec claims logger calls span "136 files" in multiple places. Actual count at the baseline commit (2ebcf653b, which is HEAD) is 222 files with logger calls (excluding manage-ui's 4 files). The claim "209 files use module-scope `const logger = getLogger('X')`" is also wrong — actual count is 177.
**Current text:** "2,278 logger calls across 136 files" (Section 1); "209 files use module-scope `const logger = getLogger('X')`" (Q6, D8); "136 files" repeated in Risk table and Future Work
**Evidence:** `grep -r "logger\.\(info\|warn\|error\|debug\)" --include="*.ts" -l` across all packages (excluding node_modules, worktrees, dist) returns 226 files (222 excluding manage-ui). `grep -r "const logger = getLogger" --include="*.ts"` returns 177 module-scope instances. The total logger call count (2,298 including manage-ui, ~2,286 excluding) is reasonably close to the claimed 2,278, so the overall call count is approximately correct.
**Status:** CONTRADICTED
**Suggested resolution:** Update file count from "136" to "222" throughout the spec. Update module-scope count from "209" to "177". Verify whether the call-count discrepancy (2,278 vs ~2,286) materially changes the impact analysis. The per-file counts in the evidence file (TriggerService: 34, scheduledTriggers: 32, etc.) are all verified correct.

---

### [H] Finding 2: Goal G3 "zero per-log-call performance overhead" is contradicted by the spec's own evidence

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L1 (cross-finding contradictions)
**Location:** Section 2 (Goals, G3), Section 6 (Non-functional requirements), Section 9 (Key properties), evidence/als-performance.md
**Issue:** G3 states "Zero per-log-call performance overhead vs current baseline (leverage pino child pre-serialization)." The current baseline uses parent pino loggers. The evidence file shows parent log calls at ~11.5us and child log calls at ~23.2us — roughly 2x. The evidence file itself contains an internal contradiction: it lists "Child log call overhead: ~0" in one row while showing child at ~23.2us vs parent at ~11.5us two rows below. The "~0 overhead" refers to the marginal cost of adding bindings to an already-created child (since they are pre-serialized as chindings), not to the overhead of using a child vs a parent. The proposed proxy pattern converts every module-scope logger call from a parent call to a child call (via `resolveInstance()` creating a child of the ALS instance), introducing the child-vs-parent overhead on every call within ALS scope. Additionally, the proxy adds ~10ns for `getStore()` + `WeakMap.get()`, though this is negligible compared to the child overhead.
**Current text:** "G3: Zero per-log-call performance overhead vs current baseline (leverage pino child pre-serialization)" and "Per-call cost: `getStore()` (~5ns) + `WeakMap.get()` (~5ns) = ~10ns"
**Evidence:** evidence/als-performance.md rows 5-7: "Parent log call ~11.5us", "Child log call ~23.2us". Pino's own benchmarks (node_modules/.pnpm/pino@9.14.0/node_modules/pino/benchmarks/child.bench.js) confirm child loggers have additional per-call cost from chindings string concatenation.
**Status:** INCOHERENT
**Suggested resolution:** Reframe G3. The overhead from bindings pre-serialization is ~0 (adding more fields to a child doesn't increase per-call cost). But switching from parent to child logger has a measurable cost (~23.2us vs ~11.5us per log call). This is still very fast in absolute terms and acceptable for a feature that trades ~12us/call for automatic context propagation. The spec should state this honestly: "Marginal overhead of ~12us/call within ALS scope, from using pino child loggers. Negligible in absolute terms for logging I/O." The non-functional requirements section should match.

---

## Medium Severity

### [M] Finding 3: Risk table contains two stale risks that were resolved during the spec process

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 14 (Risks) vs Section 10 (Decision log) and Section 11 (Open questions)
**Issue:** Risk row 1 ("pino-http middleware conflicts with ALS logger scope" — Medium likelihood) is listed as an unresolved risk, but Q2 is marked resolved ("no conflict"), D9 is LOCKED ("hono-pino and ALS logger are independent"), and A4 is verified. Risk row 2 ("Module-scope `getLogger()` calls don't get ALS context" — High likelihood, Low impact) is listed with mitigation "Accept this," but Q6 is resolved with the proxy pattern that specifically makes module-scope loggers automatically get ALS context. The proxy pattern (D8, LOCKED) was designed to solve this exact problem.
**Current text:** Risk row 1: "pino-http middleware conflicts with ALS logger scope | Medium | Medium | Investigate Q2 before implementation" / Risk row 2: "Module-scope `getLogger()` calls don't get ALS context | High | Low | Accept this"
**Evidence:** Q2 status: "Resolved: no conflict." D9: LOCKED. Q6 status: "Resolved: proxy + WeakMap cache." D8: LOCKED ("All existing module-scope loggers automatically get ALS context").
**Status:** STALE
**Suggested resolution:** Remove risk row 1 entirely (resolved — no conflict). Rewrite risk row 2 to reflect the proxy pattern: the risk is now about the ~10ns per-call overhead and the WeakMap cache growth, not about module-scope loggers failing to get context. Also update STOP_IF in Section 16 — "module-scope `getLogger()` pattern needs architectural change (Q6)" should note Q6 is resolved.

---

### [M] Finding 4: Section 13 "In Scope" risks reference resolved questions as open risks

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 13 (In Scope, "Risks" line)
**Issue:** Section 13 lists "Risks: Q2 (pino-http interaction), Q6 (module-scope getLogger)" as risks for the core logger changes. Both Q2 and Q6 are resolved in Section 11. These are no longer risks — they are resolved investigations.
**Current text:** "Risks: Q2 (pino-http interaction), Q6 (module-scope getLogger)"
**Evidence:** Section 11: Q2 "Resolved: no conflict"; Q6 "Resolved: proxy + WeakMap cache"
**Status:** STALE
**Suggested resolution:** Update the Risks line in Section 13 to reflect actual remaining risks (e.g., child logger performance overhead, WeakMap cache management, backward compatibility of `.with()` API) or remove the line if no material risks remain for the core changes.

---

### [M] Finding 5: Inconsistency between "total repeated field instances" count and individual field counts

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Section 1 (Problem statement), Section 2 (Goals, G1), evidence/current-logger-usage.md
**Issue:** The spec claims "2,081 repeated field instances" and breaks down: "tenantId (362), projectId (340), agentId (181), sessionId (162)" totaling 1,045 for those four fields. The remaining ~1,036 instances would be from other fields. However, a codebase grep for logger calls containing `tenantId` returns 153 matches, and `projectId` returns 145 matches — far below the claimed 362 and 340. The discrepancy suggests the evidence counts "field instances" differently from "calls containing the field" (a single logger call with both tenantId and projectId would count as 2 field instances but match once per grep pattern). The per-file counts in the evidence file are verified correct (TriggerService: 34, evaluationClient: 126, etc.), so the issue is likely that each call was counted once per repeated field it contains, which is a valid but unstated counting methodology. The spec and evidence should clarify this.
**Current text:** "tenantId (362), projectId (340)" in evidence/current-logger-usage.md
**Evidence:** `grep -r "tenantId" --include="*.ts" | grep "logger\.\(info\|warn\|error\|debug\)"` returns 153 matches; `grep -r "projectId" | grep "logger\."` returns 145 matches. The per-call counting methodology (each field in each call = one instance) would explain higher numbers, but is not explicitly stated.
**Status:** INCOHERENT
**Suggested resolution:** Either clarify the counting methodology (e.g., "362 field instances means tenantId appears in 362 individual logger data objects, where one call with `{ tenantId, projectId }` counts as 1 tenantId instance and 1 projectId instance"), or recount using a consistent methodology and update. The mismatch between 362 claimed and 153 grep matches suggests the evidence counts may include logger calls that pass tenantId through spread operators or nested objects that a simple grep doesn't catch.

---

## Low Severity

### [L] Finding 1: Redact config propagation to child loggers is asserted but not explained

**Category:** FACTUAL
**Source:** T2 (pino source)
**Location:** Section 6 (Non-functional requirements, Security/privacy line)
**Issue:** The spec states "No change to log redaction rules (existing `redact` config preserved on child loggers)." This is correct — pino child loggers inherit the parent's redact configuration. However, the mechanism is worth noting: pino's `child()` reuses the parent's serializers and redaction function. If the proposed `runWithLogContext` creates children of a `baseInstance` that has redact configured, the children inherit it. But the spec's `resolveInstance()` creates children of the ALS-stored pino instance (which is itself a child of `baseInstance`), so redaction propagates transitively. This is correct behavior but the spec doesn't explain why, which could cause confusion if someone later tries to add per-scope redaction.
**Current text:** "No change to log redaction rules (existing `redact` config preserved on child loggers)"
**Evidence:** Pino source (node_modules/.pnpm/pino@9.14.0) confirms child loggers inherit parent's redaction. The PinoLogger constructor (logger.ts:58-63) sets redact config on the base instance.
**Status:** CONFIRMED (but under-documented)
**Suggested resolution:** No change needed for correctness. Optionally add a brief note that redaction propagates through the child chain via pino's internal mechanism.

---

### [L] Finding 2: `getLogger(name?)` return type description omits the `with()` method

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Section 6 (Functional requirements table, row 2) vs Section 9 (API surface)
**Issue:** The functional requirement for `getLogger(name?)` says "In ALS scope: returns scoped child. Outside: returns base logger with `name` binding." This describes the ALS-aware resolution but doesn't mention that the returned `PinoLogger` now also has a `.with()` method (which is a new capability). The `.with()` method is covered in its own row (row 3), but a reader scanning the `getLogger` requirement might not realize the returned type has new capabilities.
**Current text:** "In ALS scope: returns scoped child. Outside: returns base logger with `name` binding"
**Evidence:** Section 9 shows `PinoLogger` class gains the `with()` method. Section 6 row 3 covers `with()` separately.
**Status:** INCOHERENT (minor)
**Suggested resolution:** No change strictly needed since the requirements table has a separate row for `with()`. Optionally update row 2's acceptance criteria to note "Returned PinoLogger instance supports `.with(bindings)` for explicit child creation."

---

## Confirmed Claims (summary)

**T1 (own codebase):**
- PinoLogger class structure (no child, no ALS, LoggerFactory singleton cache) confirmed from logger.ts source
- Import chain (agents-api re-exports from agents-core) confirmed
- agents-manage-ui has its own ALS-based logger (prior art) confirmed
- ref-scope.ts uses AsyncLocalStorage<RefScopeContext> confirmed
- Existing ALS instance count (ref-scope + OTel + manage-ui logger) confirmed
- hono-pino uses Hono context (`c.var.logger`), not ALS, confirmed from source
- `executionContext` structure (tenantId, projectId, agentId) confirmed from tracing middleware
- `c.get('tenantId')` pattern in manage middleware confirmed
- Middleware ordering in createApp.ts matches spec's proposed insertion points
- Per-file logger call counts (TriggerService: 34, scheduledTriggers: 32, agentExecutionSteps: 32, AgentSession: 48, executionHandler: 31, github: 29, evaluationClient: 126, projectFull: 153, agentFull: 167) all confirmed exactly
- `getPinoInstance()` used only in createApp.ts (hono-pino init) — proposed design doesn't break this
- No existing `child()` method on PinoLogger confirmed

**T2 (pino source):**
- pino.child() pre-serializes bindings as chindings string fragment confirmed
- Redaction config propagates to child loggers confirmed
- pino@9.14.0 is the installed version

**L6 (stance):** Prescriptive stance (spec) applied consistently throughout

## Unverifiable Claims

- **A2: "ALS getStore() is ~5ns on Node.js v22+"** — marked as externally benchmarked. Could not independently benchmark in this audit. The claim cites "OTel team's measurements" without a link. Node.js v22.18.0 is confirmed as the running version.
- **A5: "WeakMap.get() ~5ns"** — marked as "verified locally" but no benchmark artifact is provided. The claim is plausible but unverifiable from the evidence files alone.
- **"~2,081 repeated field instances" and "1,207 calls with ambient fields"** — these aggregates could not be fully verified without running the same counting script used to generate them. Per-file counts are confirmed correct, but the aggregation methodology is unclear (see Finding M5).
- **"Net ~1,370 lines removed"** — this is a projected outcome, not verifiable before implementation.
