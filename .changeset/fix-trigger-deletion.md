---
"@inkeep/agents-core": patch
"@inkeep/agents-sdk": patch
---

fix: preserve triggers when not included in fullAgent update

The fullAgent update endpoint now only deletes orphaned triggers when the triggers field is explicitly provided. This prevents triggers from being deleted when saving an agent from the UI (which doesn't manage triggers via this endpoint). The SDK now always includes triggers in agent serialization to ensure proper sync behavior.
