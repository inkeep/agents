---
"@inkeep/agents-api": patch
---

Now localhost origins are only allowed when ENVIRONMENT is development or test. In production/pentest, CORS will require either INKEEP_AGENTS_MANAGE_UI_URL to be set or the origin to share the same base
