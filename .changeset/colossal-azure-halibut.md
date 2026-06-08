---
"@inkeep/agents-api": minor
---

Add vendor-neutral /run/auth/challenge proxy endpoints (challenge GET/POST and challenge/verify). The previous /run/auth/sentinel/* paths keep working as deprecated aliases for embedded widgets that have not upgraded yet; they will be removed once their traffic drops to zero.
