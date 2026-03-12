# Changelog

## 2026-03-12 — Session 1: Initial spec creation

- Created spec from research report `reports/vercel-world-workflows-deployment-pinning/`
- Investigated A2A communication mechanism (in-process fetch confirmed)
- Investigated scheduled trigger lifecycle (full daisy-chain trace)
- Investigated deployment lifecycle (GitHub Actions pipeline, no post-promotion hooks)
- Created evidence files for all three investigation tracks
- Drafted initial SPEC.md with world model, open questions, and solution options

## 2026-03-12 — Session 1: Decision batch confirmed

- User confirmed D1-D7: post-promotion restart (A), shared secret auth (A), restart all unconditionally (A), synchronous (A)
- Resolved OQ1 → D5, OQ2 → D6, OQ5 → D7
- Deferred OQ3 (promotion delay) and OQ4 (cross-branch perf) as accepted risks
- Added implementation plan (Steps 1-7) to SPEC.md
- Updated decision log with all 7 confirmed decisions

## 2026-03-12 — Session 1: Scalability analysis + phased approach

- User raised scalability concern: restart-all is O(triggers) per deploy
- Investigated Vercel Cron capabilities — found PRD rejected it for wrong reason (one-cron-per-trigger vs single dispatcher)
- Analyzed restart-all scaling: works at <500 triggers, breaks at 1,500+
- Proposed Phase 2: Vercel Cron dispatcher + one-shot workflows
- User confirmed phased approach (D8): Phase 1 now, Phase 2 when scaling hits
- Added Phase 2 design to Future Work section (Explored tier)
- Added D8, D9 to decision log
- Finalized spec for PR
