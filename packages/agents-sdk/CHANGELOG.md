# @inkeep/agents-sdk

## 0.10.1

### Patch Changes

- Updated dependencies [974992c]
  - @inkeep/agents-core@0.10.1

## 0.10.0

### Minor Changes

- d7fdb5c: Update oauth login and callback urls

### Patch Changes

- Updated dependencies [7801b2c]
- Updated dependencies [d7fdb5c]
  - @inkeep/agents-core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [6fb1e3d]
- Updated dependencies [44178fc]
  - @inkeep/agents-core@0.9.0

## 0.8.7

### Patch Changes

- @inkeep/agents-core@0.8.7

## 0.8.6

### Patch Changes

- Updated dependencies [2484a6c]
  - @inkeep/agents-core@0.8.6

## 0.8.5

### Patch Changes

- Updated dependencies [3c93e9e]
  - @inkeep/agents-core@0.8.5

## 0.8.4

### Patch Changes

- Updated dependencies [9eebd7f]
  - @inkeep/agents-core@0.8.4

## 0.8.3

### Patch Changes

- @inkeep/agents-core@0.8.3

## 0.8.2

### Patch Changes

- 3a95469: added default components for status
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
  - @inkeep/agents-core@0.8.2

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
- Updated dependencies [dc19f1a]
- Updated dependencies [2589d96]
  - @inkeep/agents-core@0.8.1

## 0.8.0

### Minor Changes

- 853d431: adding headers to agent-tool relation

### Patch Changes

- Updated dependencies [853d431]
  - @inkeep/agents-core@0.8.0

## 0.7.2

### Patch Changes

- @inkeep/agents-core@0.7.2

## 0.7.1

### Patch Changes

- @inkeep/agents-core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [77bd54d]
  - @inkeep/agents-core@0.7.0

## 0.6.6

### Patch Changes

- @inkeep/agents-core@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [936b7f7]
  - @inkeep/agents-core@0.6.5

## 0.6.4

### Patch Changes

- @inkeep/agents-core@0.6.4

## 0.6.3

### Patch Changes

- @inkeep/agents-core@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies [d32d3bc]
  - @inkeep/agents-core@0.6.2

## 0.6.1

### Patch Changes

- @inkeep/agents-core@0.6.1

## 0.6.0

### Minor Changes

- 9e04bb6: Inkeep CLI Project based push and pull functionality. Push and pull an entire project set of resources in one command line.

### Patch Changes

- Updated dependencies [9e04bb6]
  - @inkeep/agents-core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [45b3b91]
  - @inkeep/agents-core@0.5.0

## 0.4.0

### Minor Changes

- a379dec: Added env var loader to agents-cli package

### Patch Changes

- Updated dependencies [0a8352f]
- Updated dependencies [0a8352f]
- Updated dependencies [a379dec]
  - @inkeep/agents-core@0.4.0

## 0.3.0

### Minor Changes

- 28a2a20: Remove 'crud' from all API endpoint paths

  **BREAKING CHANGE**: API endpoints no longer include `/crud/` in their paths.

  ## Migration Guide

  Update all API calls by removing `/crud/` from endpoint paths:

  - **Before**: `/tenants/{tenantId}/crud/projects/{projectId}/...`
  - **After**: `/tenants/{tenantId}/projects/{projectId}/...`

  ## Changes

  - Removed `/crud/` segment from all manage-api route definitions
  - Updated all API client code in manage-ui, cli, and SDK packages
  - Cleaned up OpenAPI tags to remove "CRUD" prefix
  - All internal references and tests updated

  This change simplifies API paths and makes them more RESTful.

- a7a5ca5: Proper assignment of agent framework resources to the correct project, graph, or agents scope

### Patch Changes

- Updated dependencies [a7a5ca5]
  - @inkeep/agents-core@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [d445559]
  - @inkeep/agents-core@0.2.2

## 0.2.1

### Patch Changes

- @inkeep/agents-core@0.2.1

## 0.2.0

### Minor Changes

- d2a0c0f: project resources and keytar

### Patch Changes

- Updated dependencies [d2a0c0f]
  - @inkeep/agents-core@0.2.0

## 0.1.10

### Patch Changes

- @inkeep/agents-core@0.1.10

## 0.1.9

### Patch Changes

- 8528928: Public packages
- Updated dependencies [8528928]
  - @inkeep/agents-core@0.1.9

## 0.1.8

### Patch Changes

- @inkeep/agents-core@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [a5756dc]
- Updated dependencies [8aff3c6]
- Updated dependencies [a0d8b97]
  - @inkeep/agents-core@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [3c4fd25]
  - @inkeep/agents-core@0.1.6
