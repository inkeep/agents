# @inkeep/agents-manage-ui

## 0.7.0

### Minor Changes

- 77bd54d: Changing available tools implementation

### Patch Changes

- Updated dependencies [77bd54d]
  - @inkeep/agents-core@0.7.0
  - @inkeep/agents-manage-api@0.7.0
  - @inkeep/agents-run-api@0.7.0

## 0.6.6

### Patch Changes

- 55170fd: - Bump widget version
  - @inkeep/agents-manage-api@0.6.6
  - @inkeep/agents-run-api@0.6.6
  - @inkeep/agents-core@0.6.6

## 0.6.5

### Patch Changes

- bb7a3cd: - fix bug with tool lookup
- Updated dependencies [936b7f7]
  - @inkeep/agents-core@0.6.5
  - @inkeep/agents-manage-api@0.6.5
  - @inkeep/agents-run-api@0.6.5

## 0.6.4

### Patch Changes

- 98a2a2d: Fix build
  - @inkeep/agents-manage-api@0.6.4
  - @inkeep/agents-run-api@0.6.4
  - @inkeep/agents-core@0.6.4

## 0.6.3

### Patch Changes

- 97f9e62: Fix infinite loop for tool lookup
  - @inkeep/agents-manage-api@0.6.3
  - @inkeep/agents-run-api@0.6.3
  - @inkeep/agents-core@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies [d32d3bc]
  - @inkeep/agents-core@0.6.2
  - @inkeep/agents-manage-api@0.6.2
  - @inkeep/agents-run-api@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [8cd4924]
  - @inkeep/agents-run-api@0.6.1
  - @inkeep/agents-manage-api@0.6.1
  - @inkeep/agents-core@0.6.1

## 0.6.0

### Minor Changes

- 9e04bb6: Inkeep CLI Project based push and pull functionality. Push and pull an entire project set of resources in one command line.

### Patch Changes

- Updated dependencies [9e04bb6]
  - @inkeep/agents-core@0.6.0
  - @inkeep/agents-manage-api@0.6.0
  - @inkeep/agents-run-api@0.6.0

## 0.5.0

### Minor Changes

- 45b3b91: Use Pino Logger

### Patch Changes

- bcf3d77: Exclude node modules from agents ui build
- Updated dependencies [58596bc]
- Updated dependencies [45b3b91]
  - @inkeep/agents-run-api@0.5.0
  - @inkeep/agents-core@0.5.0
  - @inkeep/agents-manage-api@0.5.0

## 0.4.0

### Minor Changes

- a379dec: Added env var loader to agents-cli package

### Patch Changes

- 0a8352f: Updates
- 0a8352f: Added new providers
- Updated dependencies [0a8352f]
- Updated dependencies [0a8352f]
- Updated dependencies [a379dec]
  - @inkeep/agents-core@0.4.0
  - @inkeep/agents-run-api@0.4.0
  - @inkeep/agents-manage-api@0.4.0

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

- Updated dependencies [28a2a20]
- Updated dependencies [a7a5ca5]
  - @inkeep/agents-manage-api@0.3.0
  - @inkeep/agents-run-api@0.3.0
  - @inkeep/agents-core@0.3.0

## 0.2.2

### Patch Changes

- f939754: Update env variables
- Updated dependencies [d445559]
  - @inkeep/agents-core@0.2.2
  - @inkeep/agents-manage-api@0.2.2
  - @inkeep/agents-run-api@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [eb2c5f0]
  - @inkeep/agents-run-api@0.2.1
  - @inkeep/agents-manage-api@0.2.1
  - @inkeep/agents-core@0.2.1

## 0.2.0

### Minor Changes

- d2a0c0f: project resources and keytar

### Patch Changes

- Updated dependencies [d2a0c0f]
  - @inkeep/agents-manage-api@0.2.0
  - @inkeep/agents-run-api@0.2.0
  - @inkeep/agents-core@0.2.0

## 0.1.10

### Patch Changes

- @inkeep/agents-manage-api@0.1.10
- @inkeep/agents-run-api@0.1.10
- @inkeep/agents-core@0.1.10

## 0.1.9

### Patch Changes

- 270ddbf: bug fix
- 735a92c: Switch default tenant
- Updated dependencies [8528928]
  - @inkeep/agents-core@0.1.9
  - @inkeep/agents-manage-api@0.1.9
  - @inkeep/agents-run-api@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [fe6187f]
  - @inkeep/agents-run-api@0.1.8
  - @inkeep/agents-manage-api@0.1.8
  - @inkeep/agents-core@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [a5756dc]
- Updated dependencies [8aff3c6]
- Updated dependencies [a0d8b97]
- Updated dependencies [652895f]
  - @inkeep/agents-core@0.1.7
  - @inkeep/agents-run-api@0.1.7
  - @inkeep/agents-manage-api@0.1.7

## 0.1.6

### Patch Changes

- 239aa8a: - Cli --env flag
  - Run API middleware update
- Updated dependencies [3c4fd25]
- Updated dependencies [239aa8a]
  - @inkeep/agents-core@0.1.6
  - @inkeep/agents-run-api@0.1.6
  - @inkeep/agents-manage-api@0.1.6
