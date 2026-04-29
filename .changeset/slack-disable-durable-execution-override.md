---
"@inkeep/agents-work-apps": patch
---

Add `INKEEP_SLACK_DISABLE_DURABLE_EXECUTION` env var to disable the Slack work-app's forced `executionMode: 'durable'` on agent runs. When set to `"true"`, the work-app omits `executionMode` from `/run/api/chat` requests so each agent's own configured mode is used. Workaround for the 2-minute idle stream timeout in older `@workflow/world-vercel` SDK versions where long sub-agent delegations cause empty Slack messages. Default behavior unchanged.
