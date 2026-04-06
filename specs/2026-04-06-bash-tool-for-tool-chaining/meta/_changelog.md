# Changelog

## 2026-04-06 — Initial spec creation

- Drafted full SPEC.md with problem statement, technical design, decisions, acceptance criteria
- Created evidence files: tool-chaining-current-state, compression-cost-analysis, just-bash-assessment, sandbox-executor-pattern
- Key decisions locked: just-bash engine (D1), stdin model (D10), child process execution (D11), always-on (D3), allow oversized artifacts (D6)
- Explored and rejected: InMemoryFs persistence (memory duplication, accumulation concerns), worker threads (no precedent in codebase, child processes proven)

## 2026-04-06 — Post-audit revision (major)

### Audit findings incorporated
- **H1 (Vercel compat)**: Child process pools incompatible with Vercel serverless. Bash tool moved to Phase 2 with Vercel compat as prerequisite.
- **H2 (result caching)**: `wrapToolWithStreaming` does NOT auto-cache results. Corrected spec — bash tool must call `recordToolResult()` explicitly.
- **H3 (dependency unverified)**: Added spike requirement for Phase 2.
- **M1 (non-JSON data)**: Added source data serialization table.
- **M4 (observability)**: Added OTel requirement to Phase 2.
- **M5 (D4 contradiction)**: Resolved conflicting output cap statements.

### Design challenges incorporated
- **Challenge 6 ($jq in resolveArgs)**: Adopted as Phase 1. Smallest change, zero token cost, covers pipeline case.
- **Challenge 4/5 (token cost, always-on)**: Phase 1 has zero cost. Phase 2 injection TBD pending measurement.
- **Challenge 1 (dependency weight)**: Phase 1 needs only a jq library, not full just-bash.
- **Challenge 7 (JMESPath)**: Initially dismissed, later ACCEPTED for Phase 1 — zero-dep advantage + `sanitizeJMESPathSelector` + `_structureHints` mitigate LLM reliability concerns. See "Phase 1 refinement" below.

### Structural changes
- Spec restructured into Phase 1 ($jq in resolveArgs) and Phase 2 (bash tool)
- Phase 1 is In Scope, Phase 2 is Future Work (Explored) with clear prerequisites
- Decision log updated to reflect phased approach
- Removed locked decisions that were invalidated by audit (D10 stdin, D11 child process now TBD for Phase 2)

## 2026-04-06 — Phase 1 refinement (JMESPath + SandboxExecutorFactory)

- **Phase 1 language:** Changed from jq (new dependency) to JMESPath (existing `jmespath` library). Zero new deps.
- **Sentinel key:** Renamed `$jq` → `$select` (language-agnostic, allows future jq upgrade without API change)
- **Phase 2 execution:** Locked to `SandboxExecutorFactory` (existing dual-path: NativeSandboxExecutor local, VercelSandboxExecutor prod). Solves Vercel compat without new infrastructure.
- **Key insight:** `_structureHints` already generates JMESPath example selectors. The LLM doesn't need to invent selectors — it can use the ones provided.
- Removed jq library spike from Phase 1 prerequisites (no longer needed)
- Updated all prompt guidance, examples, and acceptance criteria for JMESPath syntax

## 2026-04-06 — Phase 2 detail restoration + compression prerequisite

- Restored full Phase 2 technical design (was reduced to summary during phasing restructure)
- Added: tool interface, architecture diagram, stdin data flow, SandboxExecutorFactory execution model, resource limits, just-bash configuration, pipeline examples, error handling, prompt guidance, observability (OTel spans), integration points, acceptance criteria
- Updated Phase 2 execution from dedicated BashProcessExecutor → SandboxExecutorFactory (reuses existing dual-path sandbox)
- Added explicit `recordToolResult()` requirement (audit finding H2)
- Added compression trigger re-evaluation as Phase 2 prerequisite — current thresholds may need adjustment once `$select` reduces context pressure
- Added compression trigger re-eval to Future Work table
