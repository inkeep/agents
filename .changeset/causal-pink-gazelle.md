---
"@inkeep/agents-api": minor
---

Improve the management MCP tool surface: compact oversized tool input schemas (collapse advisory config blocks to a placeholder; ~29% smaller tools/list) and rename the hash-truncated scheduled-trigger invocation tools to clear, descriptive names.

Breaking (tool names): the five hash-suffixed tools are renamed. Clients that call them by name must update:
- `scheduled-triggers-cancel-scheduled-trigger-747` -> `scheduled-triggers-cancel-invocation`
- `scheduled-triggers-get-scheduled-trigger-a41` -> `scheduled-triggers-get-invocation`
- `scheduled-triggers-list-scheduled-trigger-61d` -> `scheduled-triggers-list-invocations`
- `scheduled-triggers-rerun-scheduled-trigger-825` -> `scheduled-triggers-rerun-invocation`
- `user-project-memberships-list-user-project-88a` -> `user-project-memberships-list`

The old names were Speakeasy content-hash suffixes (unstable across regens), not a stable contract.
