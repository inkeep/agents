---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Add time-to-first-token (TTFT) telemetry. Records three interaction-level span attributes (inkeep.agent.time_to_first_model_token, time_to_first_visible_token, time_to_first_visible_part) on the request span for classic SSE and Vercel data-stream responses, graph-correctly across transfers and delegations.
