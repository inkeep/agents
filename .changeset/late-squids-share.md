---
'agents-api': patch
'agents-core': patch
'agents-manage-ui': patch
---

Add agent copy flows in the manage API and dashboard for both same-project duplication and cross-project import.
Cross-project imports recreate referenced project resources when needed, skip triggers, and surface warnings when imported tools or external agents need credentials reconnected.
