# Changelog

## 2026-04-06 — Initial scaffold

- Created SPEC.md from conversation findings
- Problem validated: logger calls repeat 3-7 context fields per call across 136 files, 2,278 total calls
- Design confirmed: AsyncLocalStorage storing pino child loggers + class member pattern
- Performance validated: ALS getStore() ~5ns, child logger pre-serializes bindings, zero per-call overhead
- Feasibility confirmed: ALS works in serverless, within workflow steps, and across A2A self-calls
- Evidence files created from research findings

## 2026-04-06 — Open questions resolved, proxy pattern discovered

- Q2 resolved: hono-pino uses Hono context, not ALS. No conflict.
- Q6 resolved: ALS proxy pattern with WeakMap cache. Module-scope loggers (~209 files) automatically get ALS context at ~10ns/call. Zero code changes needed at call sites.
- D8 added: proxy + WeakMap cache decision (LOCKED)
- D9 added: hono-pino independence (LOCKED)
- A4 upgraded to HIGH confidence (verified)
- A5 added: WeakMap.get() ~5ns (verified locally)
- Q1 resolved: keep name required
- Q4 resolved: class member pattern with .with()
- Q5 resolved: export from @inkeep/agents-core

## 2026-04-06 — Audit findings assessed and applied

### Corrections applied (from auditor)
- Fixed file count: "136 files" → "~220 files" throughout
- Fixed module-scope logger count: "209" → "~177"
- Removed stale risks (Q2/Q6 were resolved but still listed as open risks)
- Updated Section 13 risk references to reflect actual remaining risks
- Updated STOP_IF in agent constraints

### Corrections applied (from challenger)
- G3 and NFR performance claims updated: "zero" → "negligible (~10ns)"
- Added `recreateInstance()` WeakMap cache clearing to proposed solution
- Added `.with()` snapshot semantics constraint with lifecycle analysis
- Added test mock update requirement to deployment table
- Investigated class lifecycles: all target classes (AgentSession, ExecutionHandler, ArtifactService, Compressors) confirmed per-request — `.with()` snapshot semantics are safe

### Findings dismissed
- Auditor H2 (child vs parent cost ~23us vs ~11.5us): Misleading comparison. Pino parent benchmark uses string-only logs. Current codebase already serializes data objects per-call. Pre-serialized chindings offset most of the delta. Reframed as a risk with monitoring.
- Auditor M5 (field count methodology): Counts are approximate from automated analysis. Per-file counts verified correct. Methodology note added to G1.
- Challenger M4 (tighter Phase 1): Valid observation about phasing. The spec already phases. The middleware + proxy pattern alone delivers ~34% of field reduction with zero call-site changes. Captured as an implementation consideration, not a scope change.

### Design challenges presented to user
- None — all challenger findings were either corrections (applied) or validated by investigation
