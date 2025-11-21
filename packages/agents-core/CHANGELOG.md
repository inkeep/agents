# @inkeep/agents-core

## 0.34.0

### Patch Changes

- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- e07c709: Add Cursor command for creating PRs with changeset validation
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default

## 0.33.3

### Patch Changes

- d957766: updated docs and model pointing
- 9ab5e8b: fix template rendering of '-'
- 3294024: bad schema
- cd916ee: fix of bug when two MCPs are incorrectly highlighted as `active` in animation
- 8bfac58: ADded new models
- 7eafb29: updated agent docs and directory aware inkeep pull
- 7b2db47: added new models

## 0.33.2

### Patch Changes

- 4b2fd62: tool history perserved
- bbbed5e: improve error message when saving a component with on click handler

## 0.33.1

### Patch Changes

- 98f139a: Updated agent cil

## 0.33.0

### Minor Changes

- b89cbd1: bump next.js to 16, react to 19.2.0

### Patch Changes

- d2fa856: fix mcp headers
- d95a9de: enable Biome noUselessElse rule

## 0.32.2

### Patch Changes

- c228770: update create-agents setup script

## 0.32.1

### Patch Changes

- 5bd3d93: update dev deps agent-core

## 0.32.0

### Minor Changes

- a262e1e: postgres migration

### Patch Changes

- 185db71: fix validation errors of form fields for:

  - `subAgent.id`
  - `subAgent.prompt`
  - `agent.name`
  - `agent.contextVariables`
  - `agent.headersSchema`

- 8d8b6dd: Fix runtime configuration implementation to properly apply environment variable overrides

  This change fixes a critical bug where runtime configuration environment variables were parsed but never actually used by the runtime execution code. The fix includes:

  1. **Core Changes (agents-core)**:

     - Removed `getEnvNumber()` helper function
     - Bundled all 56 runtime constants into a `runtimeConsts` export object for cleaner imports
     - Constants now use plain default values instead of reading from `process.env` directly

  2. **Environment Parsing (manage-api & run-api)**:

     - Updated env.ts files to import `runtimeConsts` instead of individual constants
     - Added missing `AGENTS_VALIDATION_PAGINATION_DEFAULT_LIMIT` to manage-api parsing
     - Both APIs now properly parse environment variables and create `runtimeConfig` objects

  3. **Runtime Implementation (run-api)**:
     - Updated 10+ runtime files to import `runtimeConfig` from `../env` instead of from `@inkeep/agents-core`
     - Fixed files include: Agent.ts, ToolSessionManager.ts, relationTools.ts, a2a/client.ts, AgentSession.ts, stream-helpers.ts, IncrementalStreamParser.ts, conversations.ts
     - Environment variable overrides now properly affect runtime behavior

  **Impact**: Environment variables documented in `.env.example` files now actually work. Users can configure runtime limits, timeouts, and other behavior via environment variables as intended.

- cb75c9c: bug fix for pages in traces

## 0.31.7

### Patch Changes

- 5e45a98: added coherent context

## 0.31.6

## 0.31.5

## 0.31.4

### Patch Changes

- 02d6839: optimize queries

## 0.31.3

### Patch Changes

- f91281b: use forked mcp sdk

## 0.31.2

### Patch Changes

- 2b515de: added ability to pull without project flag

## 0.31.1

### Patch Changes

- e81022d: hierarchical timeline

## 0.31.0

### Patch Changes

- eadc8f8: update agents-cli a bit
- 48a3e3e: fields for copy trace
- b98fd0a: test agents

## 0.30.4

### Patch Changes

- 26b89c6: upgrade quickstart packages
- 4a73629: remove ai sdk provider input

## 0.30.3

### Patch Changes

- 73569ce: agent name and id fixes

## 0.30.2

### Patch Changes

- 09ac1b4: update sdk provider

## 0.30.1

### Patch Changes

- 8b889f4: updated UI and model docs
- c6502dd: remove two way delegation
- c2f5582: fixed inkeep pull bug
- 99bf28a: stream collection

## 0.30.0

### Minor Changes

- 94fe795: Move templates into monorepo

### Patch Changes

- e95f0d3: Updated inkeep pull significantly

## 0.29.11

### Patch Changes

- dba5a31: Update quickstart port check
- b0817aa: Fix CLI bugs

  - Quickstart inkeep.config.ts indents and types
  - inkeep init run API and manage API urls

## 0.29.10

### Patch Changes

- 0663c46: open browser flag

## 0.29.9

## 0.29.8

## 0.29.7

## 0.29.6

### Patch Changes

- 6c52cc6: unknown tenant bug fix

## 0.29.5

### Patch Changes

- 767d466: Allow react imports in component render

## 0.29.4

### Patch Changes

- 533fa81: StopWhen agent config fix

## 0.29.3

### Patch Changes

- d26c5a4: team agent update bug fix

## 0.29.2

## 0.29.1

### Patch Changes

- f2ac869: upgrade docs
- 37e50a6: fix mcp headers with context config
- 65f4b1a: remove builtin time variables from context

## 0.29.0

### Minor Changes

- 38db07a: require name for credentials

## 0.28.0

### Patch Changes

- 74a4d0b: trace filter is all agents for default
- b4e878d: Allow pushing component render
- 96c499d: reject invalid chars in quickstart
- 074e076: mcp evironment settings

## 0.27.0

### Minor Changes

- 0a6df6e: tool.with syntx
- a423b57: Team Agents

### Patch Changes

- 4a2af4c: Added Artifact Schema validation

## 0.26.2

### Patch Changes

- 3c5c183: activity-planner default
- 8a637b5: updated inkeep pull to have fiel validation

## 0.26.1

### Patch Changes

- 4e3cb6a: move detect oauth to server

## 0.26.0

## 0.25.0

### Minor Changes

- 51c157e: External agents project scoped

## 0.24.2

### Patch Changes

- 3ad959e: initialize git in quickstart
- 7d8fcb6: cli add mcp support
- 6699b4b: - Revert revert and fix id gen

## 0.24.1

### Patch Changes

- 212fa9e: revert back to nanoid

## 0.24.0

### Patch Changes

- 317efb7: use generateId everywhere
- be54574: fix component generate-preview

## 0.23.5

### Patch Changes

- 42d2dac: ui trace improvements

## 0.23.4

### Patch Changes

- dba9591: Migrate CLI to @clack/prompts for improved interactive experience

## 0.23.3

### Patch Changes

- 2fad1cf: Fixed id collisions to just have variable names matter

## 0.23.2

### Patch Changes

- a3bea34: batch generate llm pull

## 0.23.1

## 0.23.0

### Minor Changes

- f878545: OAuth MCP Connections now use nango mcp-generic

### Patch Changes

- e604038: Updated Pull to support other providers

## 0.22.12

### Patch Changes

- 79b1e87: fixed deadlinks

## 0.22.11

### Patch Changes

- 1088fb1: Remove inkeep chat command

## 0.22.9

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
