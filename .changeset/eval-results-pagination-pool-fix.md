---
"@inkeep/agents-api": minor
---

Fix runtime database connection-pool exhaustion ("timeout exceeded when trying to connect") on the evaluation results and dataset-run endpoints. The run-config, job-config, and dataset-run handlers enriched conversations with an unbounded per-conversation query fan-out; they now use set-based batch queries. The two `/results` endpoints additionally accept `page` and `limit` query parameters (default 50, max 200). Conversation input/output extraction now also handles the A2A `parts` content format, which previously yielded an empty value.
