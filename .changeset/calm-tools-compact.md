---
"@inkeep/agents-api": patch
---

Fix context-window overflows after tools return large results by checking the current message size before the next model call.
