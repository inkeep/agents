# @inkeep/agents-run-api

## 0.11.3

### Patch Changes

- @inkeep/agents-core@0.11.3

## 0.11.2

### Patch Changes

- @inkeep/agents-core@0.11.2

## 0.11.1

### Patch Changes

- @inkeep/agents-core@0.11.1

## 0.11.0

### Minor Changes

- 9cbb2a5: DB management is maturing; management is now done with explicit drizzle migrations; it is no longer recommended to use drizzle-kit push for db schema updates; recommendation is to use drizzle-kit migrate which will make databases more stable

### Patch Changes

- Updated dependencies [9cbb2a5]
  - @inkeep/agents-core@0.11.0

## 0.10.2

### Patch Changes

- @inkeep/agents-core@0.10.2

## 0.10.1

### Patch Changes

- Updated dependencies [974992c]
  - @inkeep/agents-core@0.10.1

## 0.10.0

### Minor Changes

- d7fdb5c: Update oauth login and callback urls

### Patch Changes

- 7801b2c: improve credential store use for cloud deployments
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

- 1e7cd99: fixes optional DB_FILE_NAME
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

- 3a95469: changed artifact saving to be in-line
- 3a95469: added default components for status
- 3a95469: artifacts inline saving
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
  - @inkeep/agents-core@0.8.2

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
- 2589d96: use turso if available
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

### Minor Changes

- 77bd54d: Changing available tools implementation

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

- 8cd4924: fix preloading env from file
  - @inkeep/agents-core@0.6.1

## 0.6.0

### Minor Changes

- 9e04bb6: Inkeep CLI Project based push and pull functionality. Push and pull an entire project set of resources in one command line.

### Patch Changes

- Updated dependencies [9e04bb6]
  - @inkeep/agents-core@0.6.0

## 0.5.0

### Minor Changes

- 58596bc: extracts instrumentation for agents-run-api
- 45b3b91: Use Pino Logger

### Patch Changes

- Updated dependencies [45b3b91]
  - @inkeep/agents-core@0.5.0

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

## 0.3.0

### Minor Changes

- a7a5ca5: Proper assignment of agent framework resources to the correct project, graph, or agents scope

### Patch Changes

- Updated dependencies [a7a5ca5]
  - @inkeep/agents-core@0.3.0

## 0.2.2

### Patch Changes

- d445559: Global env configuration
- Updated dependencies [d445559]
  - @inkeep/agents-core@0.2.2

## 0.2.1

### Patch Changes

- eb2c5f0: Add agent id to execution context.
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

- Updated dependencies [8528928]
  - @inkeep/agents-core@0.1.9

## 0.1.8

### Patch Changes

- fe6187f: Fix templates loading
  - @inkeep/agents-core@0.1.8

## 0.1.7

### Patch Changes

- a5756dc: Update model config resolution
- 652895f: Remove conflicing port variables
- Updated dependencies [a5756dc]
- Updated dependencies [8aff3c6]
- Updated dependencies [a0d8b97]
  - @inkeep/agents-core@0.1.7

## 0.1.6

### Patch Changes

- 239aa8a: - Cli --env flag
  - Run API middleware update
- Updated dependencies [3c4fd25]
  - @inkeep/agents-core@0.1.6
