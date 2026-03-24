# Spec Changelog

## 2026-03-06 — Session 1: Intake & Initial Investigation

- Created spec, extracted from Phase 2 of `specs/2026-03-02-app-credentials-and-end-user-auth/SPEC.md`
- Traced current anonymous session flow (evidence/current-anonymous-session-flow.md)
- Launched ALTCHA library research (report pending)
- Identified: `captchaEnabled` field exists in schema but is not enforced
- Identified: No rate limiting middleware exists in the codebase

## 2026-03-06 — Session 1: Decisions & Draft Spec

- ALTCHA research complete (report at reports/altcha-proof-of-work-integration/REPORT.md)
- Persisted altcha-lib capabilities summary (evidence/altcha-lib-capabilities.md)
- Decisions made:
  - D1: PoW enabled globally by env var presence (not per-app toggle)
  - D2: System-wide difficulty via env var (default 50K)
  - D3: Headless/invisible solver (no visible UI)
  - D4: Remove `captchaEnabled` per-app field
  - D5: Replay protection via runtime Postgres
  - D6: Scope is PoW only (no rate limiting)
- Drafted full SPEC.md with design, phases, acceptance criteria
- Open questions: Q1-Q4 (SDK strategy, cleanup, origin validation, secret reuse)

## 2026-03-06 — Session 1: Major Design Revision

- Scope expanded: PoW on every run API request (not just session creation)
- New decisions: D8-D12 (per-request PoW, X-Altcha header, no app binding, web_client only, widget out of scope)
- Replaced SDK pseudocode with pre-fetch pipeline pattern (widget is separate repo)
- Challenge endpoint changed from `GET /run/auth/apps/{appId}/pow/challenge` to `GET /run/auth/pow/challenge` (generic, no app binding)
- PoW verification moved into `tryAppCredentialAuth` middleware (not per-route)
- Transport changed from request body `altcha` field to `X-Altcha` header (uniform across methods)
- Removed Q1 (SDK strategy) and Q3 (origin validation on challenge endpoint) — resolved by design
- Launched replay protection research (reports/altcha-replay-protection/)
- Open questions reduced to Q1-Q3 (replay strategy, secret reuse, PoW discovery)

## 2026-03-06 — Session 1: Replay Protection Resolved

- Replay protection research complete (reports/altcha-replay-protection/REPORT.md)
- Q1 resolved: UNLOGGED table + INSERT ON CONFLICT DO NOTHING + periodic DELETE
- Persisted evidence summary (evidence/replay-protection-strategy.md)
- Updated spec §7.5 with concrete schema, accept function, cleanup strategy
- A3 verified: Postgres handles 10K-30K req/sec with this pattern
- Remaining open: Q2 (secret reuse), Q3 (PoW discovery)

## 2026-03-06 — Session 1: Finalized

- Q2 resolved: separate secrets (D13)
- Q3 resolved: client-side widget config, not server probing (D14)
- D15 added: UNLOGGED table replay protection
- All open questions resolved. Spec status → Final
- 15 decisions total (D1-D15), 5 assumptions (A1-A5, 3 verified)

## 2026-03-06 — Session 1: Defer Replay Protection

- Replay protection (used-challenge tracking) deferred to future PR
- Removed: R5, R11, pow_used_challenges table, tryAcceptChallenge, replay DB interactions
- Challenge expiry (verifySolution) is the sole temporal bound for now
- Research preserved at reports/altcha-replay-protection/REPORT.md for future PR
- Significantly simpler first PR: no schema migration, no cleanup job, pure verification logic
