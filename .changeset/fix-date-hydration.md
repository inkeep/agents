---
"@inkeep/agents-manage-ui": patch
---

Fix hydration error by adding UTC timezone to all date formatting functions. Ensures server and client render identical date strings regardless of server/client timezone differences.
