# @inkeep/agents-sdk

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
