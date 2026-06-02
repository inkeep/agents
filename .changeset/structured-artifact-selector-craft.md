---
"@inkeep/agents-api": patch
---

Teach the JMESPath selector craft (base_selector/details_selector rules, forbidden patterns, data-inspection steps, common failure points) in structured-output mode too, not just text mode. Improves artifact creation quality for agents that emit structured data components. The structured guidance is tag-free so no `<artifact:*>` syntax leaks into data-component mode.
