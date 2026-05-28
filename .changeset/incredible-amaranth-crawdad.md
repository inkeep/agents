---
"@inkeep/agents-manage-ui": patch
---

Surface prompt-cache behavior in the Manage UI: a per-call cache-state badge on the conversation trace timeline (with cache read/write token counts in its tooltip), per-call cache read/write detail in the conversation Usage & Cost summary, a Cache-read Tokens stat plus a Cost by Cache Participation breakdown and per-event Cache read/write columns on the cost dashboard, and cache fields included in copied (summarized and full) traces. Also routes the conversation trace API's base filter through the shared single-quote-escaping helper instead of raw string interpolation, closing a latent SigNoz filter-injection vector.
