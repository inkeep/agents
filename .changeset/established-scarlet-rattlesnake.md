---
"@inkeep/agents-api": patch
---

Fix chat-to-edit turns erroring with "having some issues" after a successful tool call by reconciling unpaired tool calls on every generation step, not only when compression runs
