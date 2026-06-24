---
'@inkeep/agents-core': patch
'@inkeep/agents-api': patch
---

Fix MCP tool schemas being stripped of $ref/$defs, nested objects, unions, and enums. Tool input schemas are now converted via z.fromJSONSchema at ingestion (preserving the full structure for the model and validation), and the system prompt renders the full schema (resolving $ref, recursing nested objects/arrays, and showing enums and nullables) instead of a flattened one-level view.
