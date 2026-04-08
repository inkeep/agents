---
"@inkeep/agents-core": minor
---

Remove logger dependency injection from agentFull and projectFull data access functions. Agent CRUD operations now log via module-scope logger instead of silently swallowing logs. Removes exported `AgentLogger` interface and `ProjectLogger` type (zero external consumers).
