---
"@inkeep/agents-core": patch
---

Add `HeadersSchema` export for HTTP header validation and remove deprecated client exports to reduce bundle size. The removed exports were internal utilities that should not have been exposed in the public API.
