---
"@inkeep/agents-api": patch
---

Fix ArtifactCreate_ structured-output validation failures on Haiku by dropping two redundant prop fields. `props.type` is now derived from the component name (which already encodes it as the `ArtifactCreate_<type>` suffix), and `props.id` is renamed to `props.artifact_id` to eliminate visual collision with the outer `id` field. Both fields were server-internal — never streamed to clients, never persisted under those names — so this is a non-breaking change.
