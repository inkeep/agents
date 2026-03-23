---
"@inkeep/agents-api": minor
---

BREAKING: File parts on `/run/api/chat` use a Vercel-compatible shape (`url` and required `mediaType`; no `text` or `mimeType`). Add PDF URL ingestion for chat attachments with explicit bad-request errors on PDF URL ingest failures.
