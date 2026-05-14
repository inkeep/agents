---
"@inkeep/agents-api": patch
---

Honor client-supplied user message ids on chat routes (`/run/api/chat` and `/run/api/chat/completions`) so analytics events fired client-side correlate to the persisted `messages.id` row
