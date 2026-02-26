---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
"@inkeep/agents-work-apps": patch
---

Remove denormalized agent names from Slack channel configs — resolve names at read time from manage DB, clean up orphaned configs on agent/project deletion, validate agent existence on write
