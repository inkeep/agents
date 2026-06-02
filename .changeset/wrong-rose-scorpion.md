---
"@inkeep/agents-api": patch
---

Remove per-request bot-protection scoring from authenticated requests. Bot protection now gates anonymous-session creation only; authenticated requests rely on their app-signed JWT and ignore the challenge header. This fixes authenticated widget builds that send a legacy challenge-header shape being rejected with a 400 "Bot protection challenge solution is invalid" error.
