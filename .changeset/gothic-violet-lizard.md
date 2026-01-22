---
"@inkeep/agents-api": patch
---

Fix trigger invocation flow: correct agent lookup from Record structure, fix database client usage for conversations/messages, and improve error serialization in logs. Default workflow world to 'local' for development when WORKFLOW_TARGET_WORLD is not set.
