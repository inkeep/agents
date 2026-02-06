---
"@inkeep/agents-api": patch
---

Fix internal A2A and self-referencing calls to use in-process fetch transport instead of network loopback, ensuring same-instance execution for features relying on process-local state like SSE stream registries
