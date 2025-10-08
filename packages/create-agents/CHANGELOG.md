# @inkeep/create-agents

## 0.14.15

## 0.14.14

## 0.14.13

## 0.14.12

### Patch Changes

- a05d397: reduce log spam during tests runs

## 0.14.11

### Patch Changes

- ef0a682: Release

## 0.14.10

## 0.14.9

## 0.14.8

## 0.14.7

## 0.14.6

## 0.14.5

## 0.14.4

## 0.14.3

## 0.14.2

## 0.14.1

## 0.14.0

## 0.13.0

### Patch Changes

- c43a622: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- 94e010a: updated base model

## 0.12.1

### Patch Changes

- 2c255ba: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected

## 0.12.0

## 0.11.3

### Patch Changes

- 3382ff2: fixes migration in create script

## 0.11.2

## 0.11.1

## 0.11.0

### Minor Changes

- 9cbb2a5: DB management is maturing; management is now done with explicit drizzle migrations; it is no longer recommended to use drizzle-kit push for db schema updates; recommendation is to use drizzle-kit migrate which will make databases more stable

## 0.10.2

## 0.10.1

## 0.10.0

### Minor Changes

- d7fdb5c: Update oauth login and callback urls

## 0.9.0

## 0.8.7

## 0.8.6

## 0.8.5

## 0.8.4

## 0.8.3

## 0.8.2

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings

## 0.8.0

## 0.7.2

## 0.7.1

## 0.7.0

## 0.6.6

## 0.6.5

## 0.6.4

## 0.6.3

## 0.6.2

## 0.6.1

## 0.6.0

## 0.5.0

## 0.4.0

### Minor Changes

- a379dec: Added env var loader to agents-cli package

### Patch Changes

- 0a8352f: Updates
- 0a8352f: Added new providers

## 0.3.0

### Minor Changes

- a7a5ca5: Proper assignment of agent framework resources to the correct project, graph, or agents scope

### Patch Changes

- 43054e7: Env updates
- 024668f: Update templates folder

## 0.2.2

### Patch Changes

- f939754: Update env variables

## 0.2.1

### Patch Changes

- 56bb5ec: Inkeep add command

## 0.2.0

### Minor Changes

- d2a0c0f: project resources and keytar

## 0.1.10

### Patch Changes

- 148c9aa: Project name fix

## 0.1.9

### Patch Changes

- 8528928: Public packages
- 0ba5696: Move create logic to create-agents

## 0.1.8

### Patch Changes

- 17c116d: Readme fix
- Updated dependencies [17c116d]
  - @inkeep/agents-cli@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [712f1ad]
  - @inkeep/agents-cli@0.1.7

## 0.1.6

### Patch Changes

- 2f5e8d5: Add model config defaults in create command
- 7a63d95: publish create-agents
- d0b23e0: Added weather graph example
- Updated dependencies [3c4fd25]
- Updated dependencies [2f5e8d5]
- Updated dependencies [7a63d95]
- Updated dependencies [d0b23e0]
- Updated dependencies [239aa8a]
  - @inkeep/agents-cli@0.1.6
