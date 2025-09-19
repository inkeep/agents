# @inkeep/agents-manage-ui

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
