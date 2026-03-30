---
'@inkeep/agents-api': patch
---

Fix `get_reference_artifact` to hydrate blob-backed binary artifacts into model-usable file parts. This allows agents to inspect referenced binary artifacts instead of only seeing blob metadata.
