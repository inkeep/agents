---
"@inkeep/agents-api": patch
"@inkeep/agents-docs": patch
---

Refactor: Consolidate to single-phase generation

- Removed Phase 2 infrastructure (Phase2Config.ts, phase2/ template directories, thinking-preparation.xml)
- Moved data component templates from phase2/ to shared/ for single-phase use
- Updated Phase1Config to handle data components inline
- Added model recommendations docs for data components (recommend Sonnet 4+, Opus 4+, GPT-4.1/5.1/5.2, Gemini 3.0 Pro)
