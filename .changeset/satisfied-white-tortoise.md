---
"@inkeep/agents-api": patch
---

Fix headersSchema case sensitivity — schema properties with camelCase names (e.g., mcpToken) now validate correctly against lowercased HTTP headers
