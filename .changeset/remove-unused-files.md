---
"@inkeep/agents-core": patch
"@inkeep/agents-sdk": patch
"@inkeep/agents-api": patch
"@inkeep/agents-cli": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-work-apps": patch
---

Remove unused files and add knip configuration for detecting unused code

- Remove 21 unused files identified by knip analysis including test utilities, analytics code, example files, and unused utilities
- Add root knip.config.ts configuration to detect unused code going forward
- Update package.json dependencies to remove unused packages (dotenv, ora, inquirer in agents-cli)
- Clean up vitest configuration files and consolidate test setup