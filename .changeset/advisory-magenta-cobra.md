---
"@inkeep/agents-api": patch
"@inkeep/agents-work-apps": patch
---

Add Slack source indicator with entry point tracking to conversation traces and stats. Distinguishes between app mention, DM, slash command, message shortcut, modal submission, and smart link resume entry points. Fix resume-intent to use getInProcessFetch for multi-instance safety.
