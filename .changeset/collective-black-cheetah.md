---
"@inkeep/agents-manage-ui": patch
---

Fix time-to-first-token showing 0 ms in the conversation view. The trace lookup matched the wrong span because SigNoz returns 0 for numeric attributes a span lacks; now only a positive value counts as a present TTFT.
