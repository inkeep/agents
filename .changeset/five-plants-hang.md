---
"@inkeep/agents-cli": minor
---

Refactor pull command to use ts-morph for improved code generation and smart merging

- Migrates from string-based code generation to AST-based manipulation using ts-morph
- Adds intelligent merge mode that preserves user customizations when pulling updates
- Improves handling of imports, comments, and custom code during regeneration
- Adds comprehensive test coverage for the new pull command implementation
