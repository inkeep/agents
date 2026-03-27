# Changelog

## 2026-03-17 — Session 1: Intake + Investigation

- Created spec from user request to add Next.js middleware for auth protection
- Dispatched 2 exploration agents to map current auth architecture
- Persisted evidence: `evidence/current-auth-architecture.md`
- Confirmed: no `middleware.ts` exists, no server-side route protection
- Confirmed: session cookie is `better-auth.session_token`
- Mapped full route structure (public vs protected vs static)
- Browser testing confirmed unauthenticated users see full page shells

## 2026-03-17 — Session 1: Decisions confirmed

- D1 confirmed: `config.matcher` + in-function allowlist (Option A)
- D2 confirmed: Cookie presence check only, no session validation
- D3 confirmed: Keep client-side auth check on root page, clean up later
- Q1, Q2 resolved; Q3 deferred to PRD-6330
- Filed [PRD-6330](https://linear.app/inkeep/issue/PRD-6330) for unprotected `/api/*` routes follow-up
