---
"@inkeep/agents-api": patch
---

Fix the bot-protection challenge proxy returning 502 on every POST. The challenge/verify proxy handlers read the request body off `c.req.raw` (the underlying stream), which a preceding middleware had already consumed via `c.req.json()` — the second read threw "Body is unusable: Body has already been read" and was masked as a 502. This broke every HIS challenge submission and verification for anonymous sessions across all embedded widget versions. Handlers now read the body via Hono's cache-safe `c.req.text()` and pass it to the proxy helpers.
