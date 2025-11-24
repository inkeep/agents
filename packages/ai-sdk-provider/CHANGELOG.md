# @inkeep/ai-sdk-provider

## 0.37.0

### Minor Changes

- 45471ab: Implement temporary API key authentication for playground with session-based auth

### Patch Changes

- 56e1b4d: make zod and hono zod internal deps
- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- 45471ab: Fix error messages to show proper 403 access denied instead of generic internal server error
- e07c709: Add Cursor command for creating PRs with changeset validation
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default
- Updated dependencies [45471ab]
- Updated dependencies [56e1b4d]
- Updated dependencies [505749a]
- Updated dependencies [7f1b78a]
- Updated dependencies [45471ab]
- Updated dependencies [e07c709]
- Updated dependencies [fbf0d97]
  - @inkeep/agents-core@0.37.0

## 0.36.1

### Patch Changes

- Updated dependencies [1235b18]
  - @inkeep/agents-core@0.36.1

## 0.36.0

### Patch Changes

- @inkeep/agents-core@0.36.0

## 0.35.12

### Patch Changes

- 840ca11: remove clean-package from API packages - was stripping runtime dependencies causing production errors
- Updated dependencies [840ca11]
  - @inkeep/agents-core@0.35.12

## 0.35.11

### Patch Changes

- @inkeep/agents-core@0.35.11

## 0.35.10

### Patch Changes

- Updated dependencies [7a7e726]
  - @inkeep/agents-core@0.35.10

## 0.35.9

### Patch Changes

- Updated dependencies [18c036d]
  - @inkeep/agents-core@0.35.9

## 0.35.8

### Patch Changes

- Updated dependencies [986dad2]
  - @inkeep/agents-core@0.35.8

## 0.35.7

### Patch Changes

- @inkeep/agents-core@0.35.7

## 0.35.6

### Patch Changes

- Updated dependencies [31dbacc]
  - @inkeep/agents-core@0.35.6

## 0.35.5

### Patch Changes

- 15b564d: make inkeep mcp and docker optional in the quickstart
- Updated dependencies [15b564d]
  - @inkeep/agents-core@0.35.5

## 0.35.4

### Patch Changes

- Updated dependencies [e297579]
  - @inkeep/agents-core@0.35.4

## 0.35.3

### Patch Changes

- 89e8c26: cleaned stale components with inkeep pull
- Updated dependencies [89e8c26]
  - @inkeep/agents-core@0.35.3

## 0.35.2

### Patch Changes

- Updated dependencies [769d8a9]
  - @inkeep/agents-core@0.35.2

## 0.35.1

### Patch Changes

- @inkeep/agents-core@0.35.1

## 0.35.0

### Minor Changes

- 0d46d32: Adding auth to the framework

### Patch Changes

- f9a208a: Check for CLI installation in quickstart
- Updated dependencies [f9a208a]
- Updated dependencies [0d46d32]
  - @inkeep/agents-core@0.35.0

## 0.34.1

### Patch Changes

- 699043d: Install inkeep mcp in quickstarte
- e4b5d5c: Inkeep add: usage instructions and target path detection
- Updated dependencies [699043d]
- Updated dependencies [e4b5d5c]
  - @inkeep/agents-core@0.34.1

## 0.34.0

### Patch Changes

- 7426927: add cli installation to quickstart
- 015f9f7: Status Update Model fixed
- bdeee9b: quickstart skip cli install option
- 2434d22: add error handling to github fetch
- af95c9a: added provider config
- Updated dependencies [7426927]
- Updated dependencies [015f9f7]
- Updated dependencies [bdeee9b]
- Updated dependencies [2434d22]
- Updated dependencies [af95c9a]
  - @inkeep/agents-core@0.34.0

## 0.33.3

### Patch Changes

- d957766: updated docs and model pointing
- 9ab5e8b: fix template rendering of '-'
- 3294024: bad schema
- 8bfac58: ADded new models
- 7eafb29: updated agent docs and directory aware inkeep pull
- 7b2db47: added new models
- Updated dependencies [d957766]
- Updated dependencies [9ab5e8b]
- Updated dependencies [3294024]
- Updated dependencies [cd916ee]
- Updated dependencies [8bfac58]
- Updated dependencies [7eafb29]
- Updated dependencies [7b2db47]
  - @inkeep/agents-core@0.33.3

## 0.33.2

### Patch Changes

- 4b2fd62: tool history perserved
- Updated dependencies [4b2fd62]
- Updated dependencies [bbbed5e]
  - @inkeep/agents-core@0.33.2

## 0.33.1

### Patch Changes

- 98f139a: Updated agent cil
- Updated dependencies [98f139a]
  - @inkeep/agents-core@0.33.1

## 0.33.0

### Minor Changes

- b89cbd1: bump next.js to 16, react to 19.2.0

### Patch Changes

- Updated dependencies [b89cbd1]
- Updated dependencies [d2fa856]
- Updated dependencies [d95a9de]
  - @inkeep/agents-core@0.33.0

## 0.32.2

### Patch Changes

- c228770: update create-agents setup script
- Updated dependencies [c228770]
  - @inkeep/agents-core@0.32.2

## 0.32.1

### Patch Changes

- 5bd3d93: update dev deps agent-core
- Updated dependencies [5bd3d93]
  - @inkeep/agents-core@0.32.1

## 0.32.0

### Minor Changes

- a262e1e: postgres migration

### Patch Changes

- cb75c9c: bug fix for pages in traces
- Updated dependencies [185db71]
- Updated dependencies [8d8b6dd]
- Updated dependencies [a262e1e]
- Updated dependencies [cb75c9c]
  - @inkeep/agents-core@0.32.0

## 0.31.7

### Patch Changes

- 5e45a98: added coherent context
- Updated dependencies [5e45a98]
  - @inkeep/agents-core@0.31.7

## 0.31.6

### Patch Changes

- @inkeep/agents-core@0.31.6

## 0.31.5

### Patch Changes

- @inkeep/agents-core@0.31.5

## 0.31.4

### Patch Changes

- 02d6839: optimize queries
- Updated dependencies [02d6839]
  - @inkeep/agents-core@0.31.4

## 0.31.3

### Patch Changes

- f91281b: use forked mcp sdk
- Updated dependencies [f91281b]
  - @inkeep/agents-core@0.31.3

## 0.31.2

### Patch Changes

- 2b515de: added ability to pull without project flag
- Updated dependencies [2b515de]
  - @inkeep/agents-core@0.31.2

## 0.31.1

### Patch Changes

- e81022d: hierarchical timeline
- Updated dependencies [e81022d]
  - @inkeep/agents-core@0.31.1

## 0.31.0

### Patch Changes

- eadc8f8: update agents-cli a bit
- 48a3e3e: fields for copy trace
- b98fd0a: test agents
- Updated dependencies [eadc8f8]
- Updated dependencies [48a3e3e]
- Updated dependencies [b98fd0a]
  - @inkeep/agents-core@0.31.0

## 0.30.4

### Patch Changes

- 26b89c6: upgrade quickstart packages
- 4a73629: remove ai sdk provider input
- Updated dependencies [26b89c6]
- Updated dependencies [4a73629]
  - @inkeep/agents-core@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [73569ce]
  - @inkeep/agents-core@0.30.3

## 0.30.2

### Patch Changes

- 09ac1b4: update sdk provider
- Updated dependencies [09ac1b4]
  - @inkeep/agents-core@0.30.2

## 0.30.1

### Patch Changes

- Updated dependencies [8b889f4]
- Updated dependencies [c6502dd]
- Updated dependencies [c2f5582]
- Updated dependencies [99bf28a]
  - @inkeep/agents-core@0.30.1
