---
"@inkeep/agents-manage-ui": patch
---

Fix Cost page: repair the cost summaries parser to correctly merge multi-aggregation grouped scalar responses from SigNoz v5 (top stat cards and Cost by Model/Agent/Provider/Generation Type tiles now show real data instead of $0/no data). Also render the chart and events sections independently of the summaries query so one slow or failed query doesn't block the others, and surface query errors in the UI instead of silently returning empty.
