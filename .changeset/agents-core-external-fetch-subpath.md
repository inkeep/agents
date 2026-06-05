---
"@inkeep/agents-core": minor
---

Add `@inkeep/agents-core/external-fetch` and `@inkeep/agents-core/text-attachments` subpath exports. The hardened external-file downloader (SSRF guard, redirect cap, size limit, content-type validation, retry-with-backoff) and the text-document attachment helpers now live in `agents-core` so consumers outside `agents-api` (e.g. copilot-app's HelpScout fetcher) can reuse them without depending on the entire `agents-api` package tree. Public barrel is curated — internal helpers like the undici dispatcher lookup callback are intentionally module-private.

`downloadExternalFile()` now accepts an optional `signal: AbortSignal` so callers running concurrent fetches under a shared aggregate budget can abort in-flight downloads when the budget expires.
