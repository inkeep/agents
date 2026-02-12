---
"@inkeep/agents-cli": patch
---

Fix `inkeep pull` to include `needsApproval` flag on tools

- Include `toolPolicies` when generating `.with()` configuration for tools in sub-agents
- Merge `toolPolicies` into `selectedTools` array using `McpToolSelection` format
- Add test coverage for `needsApproval` flag serialization
