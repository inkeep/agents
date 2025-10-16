# @inkeep/agents-core

## 0.22.8

## 0.22.7

### Patch Changes

- 550d251: updated inkeep pull :)

## 0.22.6

### Patch Changes

- 28018a0: mcp tool error handling

## 0.22.5

### Patch Changes

- e5fb3a4: windows quickstart support

## 0.22.4

### Patch Changes

- e8ba7de: Add background version check to push and pull commands
- 0b8c264: Add self-update command to CLI with automatic package manager detection and version checking
- b788bd8: Use password entry instead of plaintext entry
- f784f72: New models and clean up

## 0.22.3

### Patch Changes

- d00742f: misnamed model

## 0.22.2

### Patch Changes

- abdf614: Default model configs

## 0.22.1

### Patch Changes

- ba2a297: Support remote sandboxes

## 0.22.0

### Patch Changes

- 8a10d65: updated inkeep pull and added new zod schema support for status components

## 0.21.1

### Patch Changes

- 4815d3a: create bearer in keychain
- 1aefe88: Update default project
- eb0ffa2: removed model pinning

## 0.21.0

### Minor Changes

- 88ff25c: Fix table name for sub agent function tool relations

### Patch Changes

- 43cd2f6: updated tests

## 0.20.1

### Patch Changes

- 1e5188d: split tool execution into tool call and tool result

## 0.20.0

### Minor Changes

- fb99085: refactors agentPrompt to prompt

## 0.19.9

## 0.19.8

### Patch Changes

- e9048e2: split tool execution into tool call and tool result

## 0.19.7

## 0.19.6

### Patch Changes

- 76fb9aa: clean-up-env
- 0d0166f: stream object in timeline

## 0.19.5

### Patch Changes

- 22b96c4: inkeep cli pull command uses dynamic planner

## 0.19.4

### Patch Changes

- 7a3fc7f: Fixed tests

## 0.19.3

### Patch Changes

- 079a18a: more-model-def-fixes

## 0.19.2

### Patch Changes

- 717d483: fixes-sonnet-definition

## 0.19.1

## 0.19.0

### Minor Changes

- 71a9f03: Rename Graphs to Agents, complete migration from agents to sub agents, various cleanup

### Patch Changes

- 849c6e9: added new cosntants for model and inkeep pull

## 0.18.1

### Patch Changes

- 71892f2: types added

## 0.18.0

### Minor Changes

- 1600323: rename agents to subAgents within the agents-sdk
- 3684a31: Rename Agents to SubAgents

### Patch Changes

- 81d5a7e: Template variable preservation in placeholders
- 2165d9b: improve errors and fix bug
- 9bdf630: Fixed streamed non final output text tracking

## 0.17.0

### Minor Changes

- 94c0c18: Only allow headers template creation through headers builder

## 0.16.3

## 0.16.2

### Patch Changes

- 4df3308: fix schema conversion export

## 0.16.1

## 0.16.0

### Minor Changes

- 5c3bbec: Request context refactor

### Patch Changes

- 35e6c9e: Updated Artifact Schema

## 0.15.0

### Minor Changes

- ad5528c: Context config route changes

## 0.14.16

## 0.14.15

## 0.14.14

### Patch Changes

- 8fe8c3e: exports drizzle

## 0.14.13

## 0.14.12

### Patch Changes

- a05d397: reduce log spam during tests runs

## 0.14.11

### Patch Changes

- ef0a682: Release

## 0.14.10

### Patch Changes

- cee3fa1: use type defs from @inkeep/agents-core in llm generated @inkeep/agents-cli pull command prompts

## 0.14.9

### Patch Changes

- c7194ce: error surfacing

## 0.14.8

## 0.14.7

### Patch Changes

- d891309: Fix default graph id
- 735d238: normalize conversation ids

## 0.14.6

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
