---
"@inkeep/agents-cli": patch
"@inkeep/agents-core": patch
"@inkeep/agents-manage-api": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-run-api": patch
"@inkeep/agents-sdk": patch
"@inkeep/create-agents": patch
"@inkeep/ai-sdk-provider": patch
---

Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
