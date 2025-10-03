# @inkeep/agents-core

## 0.14.5

### Patch Changes

- 557afac: Improve mcp client connection with cache

## 0.14.4

## 0.14.3

## 0.14.2

## 0.14.1

### Patch Changes

- b056d33: Fix graphWithinProject schema

## 0.14.0

## 0.13.0

### Patch Changes

- c43a622: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- 94e010a: updated base model

## 0.12.1

### Patch Changes

- 2c255ba: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected

## 0.12.0

### Minor Changes

- 2b16ae6: add missing export

## 0.11.3

## 0.11.2

## 0.11.1

## 0.11.0

### Minor Changes

- 9cbb2a5: DB management is maturing; management is now done with explicit drizzle migrations; it is no longer recommended to use drizzle-kit push for db schema updates; recommendation is to use drizzle-kit migrate which will make databases more stable

## 0.10.2

## 0.10.1

### Patch Changes

- 974992c: context fetching span and ui trace improvements

## 0.10.0

### Minor Changes

- d7fdb5c: Update oauth login and callback urls

### Patch Changes

- 7801b2c: improve credential store use for cloud deployments

## 0.9.0

### Minor Changes

- 44178fc: Improve Visual Builder agent-tool relations, and bug fixes

### Patch Changes

- 6fb1e3d: fixes drizzle load from turso

## 0.8.7

## 0.8.6

### Patch Changes

- 2484a6c: Fix FetchDefiniton Credential References

## 0.8.5

### Patch Changes

- 3c93e9e: configures drizzle with turso option

## 0.8.4

### Patch Changes

- 9eebd7f: External Agent UI Enhancements

## 0.8.3

## 0.8.2

### Patch Changes

- 3a95469: changed artifact saving to be in-line
- 3a95469: added default components for status
- 3a95469: artifacts inline saving

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
- 2589d96: use turso if available

## 0.8.0

### Minor Changes

- 853d431: adding headers to agent-tool relation

## 0.7.2

## 0.7.1

## 0.7.0

### Minor Changes

- 77bd54d: Changing available tools implementation

## 0.6.6

## 0.6.5

### Patch Changes

- 936b7f7: Generate dts

## 0.6.4

## 0.6.3

## 0.6.2

### Patch Changes

- d32d3bc: Template validation helper

## 0.6.1

## 0.6.0

### Minor Changes

- 9e04bb6: Inkeep CLI Project based push and pull functionality. Push and pull an entire project set of resources in one command line.

## 0.5.0

### Minor Changes

- 45b3b91: Use Pino Logger

## 0.4.0

### Minor Changes

- a379dec: Added env var loader to agents-cli package

### Patch Changes

- 0a8352f: Updates
- 0a8352f: Added new providers

## 0.3.0

### Minor Changes

- a7a5ca5: Proper assignment of agent framework resources to the correct project, graph, or agents scope

## 0.2.2

### Patch Changes

- d445559: Global env configuration

## 0.2.1

## 0.2.0

### Minor Changes

- d2a0c0f: project resources and keytar

## 0.1.10

## 0.1.9

### Patch Changes

- 8528928: Public packages

## 0.1.8

## 0.1.7

### Patch Changes

- a5756dc: Update model config resolution
- 8aff3c6: Remove cjs syntax
- a0d8b97: public

## 0.1.6

### Patch Changes

- 3c4fd25: Removed pull model configs.
