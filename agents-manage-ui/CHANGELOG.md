# @inkeep/agents-manage-ui

## 0.34.0

### Minor Changes

- 8af5738: - should collapses when opening an agent page and re-expands when returning to other page
  - should keeps the sidebar collapsed after a manual toggle even when leaving the agent page

### Patch Changes

- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- 777d8ef: UI improvements for Evaluations
- e07c709: Add Cursor command for creating PRs with changeset validation
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default
- Updated dependencies [505749a]
- Updated dependencies [7f1b78a]
- Updated dependencies [e07c709]
- Updated dependencies [fbf0d97]
  - @inkeep/agents-core@0.34.0
  - @inkeep/agents-manage-api@0.34.0
  - @inkeep/agents-run-api@0.34.0

## 0.33.3

### Patch Changes

- d957766: updated docs and model pointing
- b83ce52: truncate long badges in agent flow
- 9ab5e8b: fix template rendering of '-'
- 3294024: bad schema
- cd916ee: fix of bug when two MCPs are incorrectly highlighted as `active` in animation
- 8bfac58: ADded new models
- 7eafb29: updated agent docs and directory aware inkeep pull
- 1a3cc67: use `cursor-pointer` for `DropdownMenuItem`
- f3f999c: revert `SidebarInset` styles changes
- cd916ee: stop data-operation animation for `delegation_returned` and `tool_result`
- 62beff0: Fix console warning: [Shiki] 10 instances have been created. Shiki is supposed to be used as a singleton, consider refactoring your code to cache your highlighter instance; Or call `highlighter.dispose()` to release unused instances.
- 404477b: use agents loader in `[tenantId]/projects/[projectId]`
- 24db564: fix: unable to save new component when add properties via form builder
- cd916ee: still show the “parent” that’s waiting for the delegation to return as blue outline
- 7b2db47: added new models
- Updated dependencies [d957766]
- Updated dependencies [9ab5e8b]
- Updated dependencies [3294024]
- Updated dependencies [cd916ee]
- Updated dependencies [8bfac58]
- Updated dependencies [7eafb29]
- Updated dependencies [7b2db47]
  - @inkeep/agents-core@0.33.3
  - @inkeep/agents-manage-api@0.33.3
  - @inkeep/agents-run-api@0.33.3

## 0.33.2

### Patch Changes

- 4b2fd62: tool history perserved
- b9b423a: increase ReactFlow's `minZoom` to `0.3` (default was 0.5)
- Updated dependencies [4b2fd62]
- Updated dependencies [bbbed5e]
  - @inkeep/agents-core@0.33.2
  - @inkeep/agents-run-api@0.33.2
  - @inkeep/agents-manage-api@0.33.2

## 0.33.1

### Patch Changes

- e1eb8b6: - Only show close button on playground if not in full screen view
- 98f139a: Updated agent cil
- Updated dependencies [98f139a]
  - @inkeep/agents-manage-api@0.33.1
  - @inkeep/agents-run-api@0.33.1
  - @inkeep/agents-core@0.33.1

## 0.33.0

### Minor Changes

- b89cbd1: bump next.js to 16, react to 19.2.0
- e70d5ff: show dialog if user tries to leave the agent graph page and there are unsaved changes
- e1cf7f4: auto collapse sidebar when on the agent graph page / make collapsed view icons only

### Patch Changes

- 1eea0c4: show cypress errors on CI
- 6fe0005: fix `WARNING: Panel defaultSize prop recommended to avoid layout shift after server rendering`
- 189aec5: fix Next.js warning `⚠ "next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
- cf9ff7d: fix flacky Cypress tests `No group found for id '...'`
- 5d6b3aa: Add 'break-words' class to base node component
- 0d71cac: `suppressHydrationWarning` on development on `<body>` element
- d95a9de: enable Biome noUselessElse rule
- 94e5940: dashboard: prefer `PageProps`, `LayoutProps`, `RouteContext` types
- 6d6a033: add blur to `Ship` button
- Updated dependencies [b89cbd1]
- Updated dependencies [d2fa856]
- Updated dependencies [d95a9de]
  - @inkeep/agents-core@0.33.0
  - @inkeep/agents-manage-api@0.33.0
  - @inkeep/agents-run-api@0.33.0

## 0.32.2

### Patch Changes

- c228770: update create-agents setup script
- Updated dependencies [c228770]
  - @inkeep/agents-core@0.32.2
  - @inkeep/agents-manage-api@0.32.2
  - @inkeep/agents-run-api@0.32.2

## 0.32.1

### Patch Changes

- 5bd3d93: update dev deps agent-core
- Updated dependencies [5bd3d93]
  - @inkeep/agents-core@0.32.1
  - @inkeep/agents-manage-api@0.32.1
  - @inkeep/agents-run-api@0.32.1

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

- ed8abd5: should update the SubAgent prompt editor when switching nodes
- cb75c9c: bug fix for pages in traces
- Updated dependencies [185db71]
- Updated dependencies [8d8b6dd]
- Updated dependencies [a262e1e]
- Updated dependencies [cb75c9c]
  - @inkeep/agents-core@0.32.0
  - @inkeep/agents-manage-api@0.32.0
  - @inkeep/agents-run-api@0.32.0

## 0.31.7

### Patch Changes

- 5e45a98: added coherent context
- Updated dependencies [5e45a98]
  - @inkeep/agents-run-api@0.31.7
  - @inkeep/agents-manage-api@0.31.7
  - @inkeep/agents-core@0.31.7

## 0.31.6

### Patch Changes

- afffd8f: - Small ui design tweaks
  - @inkeep/agents-manage-api@0.31.6
  - @inkeep/agents-run-api@0.31.6
  - @inkeep/agents-core@0.31.6

## 0.31.5

### Patch Changes

- 6fd7b05: - Add ship modal with instructions for how to utilize the agents
- 19e8375: - Bump agents-ui package to 0.15.2
  - @inkeep/agents-manage-api@0.31.5
  - @inkeep/agents-run-api@0.31.5
  - @inkeep/agents-core@0.31.5

## 0.31.4

### Patch Changes

- 02d6839: optimize queries
- Updated dependencies [02d6839]
  - @inkeep/agents-core@0.31.4
  - @inkeep/agents-manage-api@0.31.4
  - @inkeep/agents-run-api@0.31.4

## 0.31.3

### Patch Changes

- ce3720a: animate MCP node which throws an error
- ea4b251: remove `as React.CSSProperties` type casting
- 43edec7: rename `Flow` component with `AgentReactFlowConsumer`
- c1299f0: Prevent page jumps when Monaco editor is inside tab
- f91281b: use forked mcp sdk
- Updated dependencies [f91281b]
  - @inkeep/agents-core@0.31.3
  - @inkeep/agents-manage-api@0.31.3
  - @inkeep/agents-run-api@0.31.3

## 0.31.2

### Patch Changes

- 2b515de: added ability to pull without project flag
- Updated dependencies [2b515de]
  - @inkeep/agents-manage-api@0.31.2
  - @inkeep/agents-run-api@0.31.2
  - @inkeep/agents-core@0.31.2

## 0.31.1

### Patch Changes

- e81022d: hierarchical timeline
- Updated dependencies [e81022d]
  - @inkeep/agents-manage-api@0.31.1
  - @inkeep/agents-run-api@0.31.1
  - @inkeep/agents-core@0.31.1

## 0.31.0

### Minor Changes

- c92cb22: Implement a Simple Edit mode for the JSON Schema editor, enabling users to modify the schema via an HTML form.
- 3bfcc67: Make the Side Pane and Playground Pane (Try It! button) resizable and persist their sizes in localStorage.

### Patch Changes

- eadc8f8: update agents-cli a bit
- 48a3e3e: fields for copy trace
- b98fd0a: test agents
- 970a058: import `<Playground />` with `next/dynamic` to improve `/agents/*` first load page sizes
- Updated dependencies [eadc8f8]
- Updated dependencies [48a3e3e]
- Updated dependencies [b98fd0a]
  - @inkeep/agents-manage-api@0.31.0
  - @inkeep/agents-run-api@0.31.0
  - @inkeep/agents-core@0.31.0

## 0.30.4

### Patch Changes

- aeacd5f: call `generateId` only once during initial rendering
- 26b89c6: upgrade quickstart packages
- 4a73629: remove ai sdk provider input
- Updated dependencies [26b89c6]
- Updated dependencies [4a73629]
  - @inkeep/agents-core@0.30.4
  - @inkeep/agents-manage-api@0.30.4
  - @inkeep/agents-run-api@0.30.4

## 0.30.3

### Patch Changes

- 73569ce: agent name and id fixes
- Updated dependencies [73569ce]
  - @inkeep/agents-core@0.30.3
  - @inkeep/agents-run-api@0.30.3
  - @inkeep/agents-manage-api@0.30.3

## 0.30.2

### Patch Changes

- 09ac1b4: update sdk provider
- Updated dependencies [09ac1b4]
  - @inkeep/agents-core@0.30.2
  - @inkeep/agents-manage-api@0.30.2
  - @inkeep/agents-run-api@0.30.2

## 0.30.1

### Patch Changes

- 8b889f4: updated UI and model docs
- c6502dd: remove two way delegation
- c2f5582: fixed inkeep pull bug
- 99bf28a: stream collection
- Updated dependencies [8b889f4]
- Updated dependencies [c6502dd]
- Updated dependencies [c2f5582]
- Updated dependencies [99bf28a]
  - @inkeep/agents-manage-api@0.30.1
  - @inkeep/agents-run-api@0.30.1
  - @inkeep/agents-core@0.30.1

## 0.30.0

### Minor Changes

- 94fe795: Move templates into monorepo

### Patch Changes

- e95f0d3: Updated inkeep pull significantly
- Updated dependencies [e95f0d3]
- Updated dependencies [94fe795]
  - @inkeep/agents-core@0.30.0
  - @inkeep/agents-manage-api@0.30.0
  - @inkeep/agents-run-api@0.30.0

## 0.29.11

### Patch Changes

- 9ca1b6c: fix `ProjectSelector` make items active if their names and descriptions are identical
- dba5a31: Update quickstart port check
- b0817aa: Fix CLI bugs

  - Quickstart inkeep.config.ts indents and types
  - inkeep init run API and manage API urls

- 69c303e: fix validation errors for Sub Agents and setup Cypress e2e tests
- Updated dependencies [dba5a31]
- Updated dependencies [b0817aa]
  - @inkeep/agents-core@0.29.11
  - @inkeep/agents-manage-api@0.29.11
  - @inkeep/agents-run-api@0.29.11

## 0.29.10

### Patch Changes

- Updated dependencies [0663c46]
  - @inkeep/agents-core@0.29.10
  - @inkeep/agents-manage-api@0.29.10
  - @inkeep/agents-run-api@0.29.10

## 0.29.9

### Patch Changes

- cd5b846: - Update agents-ui to latest, update docs to reflect renaming of modalSettings to openSettings"
  - @inkeep/agents-manage-api@0.29.9
  - @inkeep/agents-run-api@0.29.9
  - @inkeep/agents-core@0.29.9

## 0.29.8

### Patch Changes

- @inkeep/agents-manage-api@0.29.8
- @inkeep/agents-run-api@0.29.8
- @inkeep/agents-core@0.29.8

## 0.29.7

### Patch Changes

- Updated dependencies [a4cf6d8]
  - @inkeep/agents-manage-api@0.29.7
  - @inkeep/agents-run-api@0.29.7
  - @inkeep/agents-core@0.29.7

## 0.29.6

### Patch Changes

- 6c52cc6: unknown tenant bug fix
- Updated dependencies [6c52cc6]
  - @inkeep/agents-core@0.29.6
  - @inkeep/agents-run-api@0.29.6
  - @inkeep/agents-manage-api@0.29.6

## 0.29.5

### Patch Changes

- Updated dependencies [767d466]
  - @inkeep/agents-core@0.29.5
  - @inkeep/agents-manage-api@0.29.5
  - @inkeep/agents-run-api@0.29.5

## 0.29.4

### Patch Changes

- 533fa81: StopWhen agent config fix
- 0bfcd17: fix external link icon and arrow right icon to prevent color overflow
- Updated dependencies [533fa81]
  - @inkeep/agents-core@0.29.4
  - @inkeep/agents-manage-api@0.29.4
  - @inkeep/agents-run-api@0.29.4

## 0.29.3

### Patch Changes

- d26c5a4: team agent update bug fix
- Updated dependencies [d26c5a4]
  - @inkeep/agents-core@0.29.3
  - @inkeep/agents-manage-api@0.29.3
  - @inkeep/agents-run-api@0.29.3

## 0.29.2

### Patch Changes

- b499ce6: - Make agents plural in breadcrumbs ans agents page
  - @inkeep/agents-manage-api@0.29.2
  - @inkeep/agents-run-api@0.29.2
  - @inkeep/agents-core@0.29.2

## 0.29.1

### Patch Changes

- f2ac869: upgrade docs
- 37e50a6: fix mcp headers with context config
- 65f4b1a: remove builtin time variables from context
- Updated dependencies [f2ac869]
- Updated dependencies [37e50a6]
- Updated dependencies [65f4b1a]
  - @inkeep/agents-core@0.29.1
  - @inkeep/agents-manage-api@0.29.1
  - @inkeep/agents-run-api@0.29.1

## 0.29.0

### Minor Changes

- 38db07a: require name for credentials

### Patch Changes

- Updated dependencies [38db07a]
  - @inkeep/agents-core@0.29.0
  - @inkeep/agents-manage-api@0.29.0
  - @inkeep/agents-run-api@0.29.0

## 0.28.0

### Minor Changes

- 8e3dfb1: zoom into section of graph where agent is selected
- e63ba9e: replace `JSON`/`Prompt`/`Code` Codemirror editors with Monaco-editors

### Patch Changes

- 74a4d0b: trace filter is all agents for default
- dbeddf1: fix for data animation, bug highlights unrelated MCP tools on invocation
- bb4ea0e: - Fix errors in agent builder
- b4e878d: Allow pushing component render
- 96c499d: reject invalid chars in quickstart
- c10ac33: fix: polling on activities cause chat widget to re-render every second
- 074e076: mcp evironment settings
- Updated dependencies [74a4d0b]
- Updated dependencies [b4e878d]
- Updated dependencies [96c499d]
- Updated dependencies [074e076]
  - @inkeep/agents-manage-api@0.28.0
  - @inkeep/agents-run-api@0.28.0
  - @inkeep/agents-core@0.28.0

## 0.27.0

### Minor Changes

- 0a6df6e: tool.with syntx
- a423b57: Team Agents

### Patch Changes

- 4a2af4c: Added Artifact Schema validation
- Updated dependencies [4a2af4c]
- Updated dependencies [0a6df6e]
- Updated dependencies [a423b57]
  - @inkeep/agents-core@0.27.0
  - @inkeep/agents-run-api@0.27.0
  - @inkeep/agents-manage-api@0.27.0

## 0.26.2

### Patch Changes

- 3c5c183: activity-planner default
- 8a637b5: updated inkeep pull to have fiel validation
- c1c55b5: Tighten up form styles, styles for component generation
- Updated dependencies [3c5c183]
- Updated dependencies [8a637b5]
  - @inkeep/agents-core@0.26.2
  - @inkeep/agents-manage-api@0.26.2
  - @inkeep/agents-run-api@0.26.2

## 0.26.1

### Patch Changes

- 4e3cb6a: move detect oauth to server
- Updated dependencies [4e3cb6a]
  - @inkeep/agents-core@0.26.1
  - @inkeep/agents-manage-api@0.26.1
  - @inkeep/agents-run-api@0.26.1

## 0.26.0

### Minor Changes

- 0562d82: include `Projects` > `Project Name` > in breadcrumbs

### Patch Changes

- 5f537a8: remove unneeded agents-manage-ui/src/components/theme-provider.tsx file (next-themes already has `use client` directive)
  - @inkeep/agents-manage-api@0.26.0
  - @inkeep/agents-run-api@0.26.0
  - @inkeep/agents-core@0.26.0

## 0.25.0

### Minor Changes

- 51c157e: External agents project scoped

### Patch Changes

- d8e9af2: - Add delete node button to sidepane
- Updated dependencies [51c157e]
  - @inkeep/agents-core@0.25.0
  - @inkeep/agents-manage-api@0.25.0
  - @inkeep/agents-run-api@0.25.0

## 0.24.2

### Patch Changes

- 3ad959e: initialize git in quickstart
- ffe9033: add delete buttons
- 7d8fcb6: cli add mcp support
- 6699b4b: - Revert revert and fix id gen
- f536bba: - Fix bug where clearing status update frequency fields caused them to disappear
- 60d728b: prefer `PageProps`, `LayoutProps` and `RouteContext` Next.js' types
- dd7b636: Allow users to configure the default sub agent
- Updated dependencies [3ad959e]
- Updated dependencies [7d8fcb6]
- Updated dependencies [6699b4b]
  - @inkeep/agents-core@0.24.2
  - @inkeep/agents-manage-api@0.24.2
  - @inkeep/agents-run-api@0.24.2

## 0.24.1

### Patch Changes

- 212fa9e: revert back to nanoid
- Updated dependencies [212fa9e]
  - @inkeep/agents-core@0.24.1
  - @inkeep/agents-manage-api@0.24.1
  - @inkeep/agents-run-api@0.24.1

## 0.24.0

### Minor Changes

- 3c87a88: Animate Agent graph based on `ikp-data-operation` event types

### Patch Changes

- a8023c6: Fix React Flow toolbar buttons overflow caused by nodes and edges
- 317efb7: use generateId everywhere
- be54574: fix component generate-preview
- Updated dependencies [317efb7]
- Updated dependencies [be54574]
  - @inkeep/agents-core@0.24.0
  - @inkeep/agents-manage-api@0.24.0
  - @inkeep/agents-run-api@0.24.0

## 0.23.5

### Patch Changes

- 42d2dac: ui trace improvements
- Updated dependencies [42d2dac]
  - @inkeep/agents-run-api@0.23.5
  - @inkeep/agents-manage-api@0.23.5
  - @inkeep/agents-core@0.23.5

## 0.23.4

### Patch Changes

- dba9591: Migrate CLI to @clack/prompts for improved interactive experience
- Updated dependencies [dba9591]
  - @inkeep/agents-core@0.23.4
  - @inkeep/agents-manage-api@0.23.4
  - @inkeep/agents-run-api@0.23.4

## 0.23.3

### Patch Changes

- 2fad1cf: Fixed id collisions to just have variable names matter
- Updated dependencies [2fad1cf]
  - @inkeep/agents-manage-api@0.23.3
  - @inkeep/agents-run-api@0.23.3
  - @inkeep/agents-core@0.23.3

## 0.23.2

### Patch Changes

- a3bea34: batch generate llm pull
- Updated dependencies [a3bea34]
  - @inkeep/agents-core@0.23.2
  - @inkeep/agents-manage-api@0.23.2
  - @inkeep/agents-run-api@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [80407ab]
  - @inkeep/agents-run-api@0.23.1
  - @inkeep/agents-manage-api@0.23.1
  - @inkeep/agents-core@0.23.1

## 0.23.0

### Minor Changes

- f878545: OAuth MCP Connections now use nango mcp-generic

### Patch Changes

- e604038: Updated Pull to support other providers
- 39e732b: improve credential icons
- Updated dependencies [f878545]
- Updated dependencies [e604038]
  - @inkeep/agents-core@0.23.0
  - @inkeep/agents-manage-api@0.23.0
  - @inkeep/agents-run-api@0.23.0

## 0.22.12

### Patch Changes

- 79b1e87: fixed deadlinks
- Updated dependencies [79b1e87]
  - @inkeep/agents-manage-api@0.22.12
  - @inkeep/agents-run-api@0.22.12
  - @inkeep/agents-core@0.22.12

## 0.22.11

### Patch Changes

- 1088fb1: Remove inkeep chat command
- Updated dependencies [1088fb1]
  - @inkeep/agents-core@0.22.11
  - @inkeep/agents-manage-api@0.22.11
  - @inkeep/agents-run-api@0.22.11

## 0.22.9

### Patch Changes

- b01f8a3: - Improve full page errors
  - @inkeep/agents-manage-api@0.22.9
  - @inkeep/agents-run-api@0.22.9
  - @inkeep/agents-core@0.22.9

## 0.22.8

### Patch Changes

- 604fec9: clickhouse query
  - @inkeep/agents-manage-api@0.22.8
  - @inkeep/agents-run-api@0.22.8
  - @inkeep/agents-core@0.22.8

## 0.22.7

### Patch Changes

- 550d251: updated inkeep pull :)
- Updated dependencies [550d251]
  - @inkeep/agents-manage-api@0.22.7
  - @inkeep/agents-run-api@0.22.7
  - @inkeep/agents-core@0.22.7

## 0.22.6

### Patch Changes

- 28018a0: mcp tool error handling
- Updated dependencies [28018a0]
  - @inkeep/agents-run-api@0.22.6
  - @inkeep/agents-manage-api@0.22.6
  - @inkeep/agents-core@0.22.6

## 0.22.5

### Patch Changes

- e5fb3a4: windows quickstart support
- Updated dependencies [e5fb3a4]
  - @inkeep/agents-core@0.22.5
  - @inkeep/agents-manage-api@0.22.5
  - @inkeep/agents-run-api@0.22.5

## 0.22.4

### Patch Changes

- e8ba7de: Add background version check to push and pull commands
- 30a72e2: - prevent the sidepane from animating in on first render
  - add loading state for new agent page
  - add loading state for node / edge sidepane
  - reset zustand state when component unmounts
- 0b8c264: Add self-update command to CLI with automatic package manager detection and version checking
- b788bd8: Use password entry instead of plaintext entry
- f784f72: New models and clean up
- Updated dependencies [e8ba7de]
- Updated dependencies [0b8c264]
- Updated dependencies [b788bd8]
- Updated dependencies [f784f72]
  - @inkeep/agents-core@0.22.4
  - @inkeep/agents-manage-api@0.22.4
  - @inkeep/agents-run-api@0.22.4

## 0.22.3

### Patch Changes

- d00742f: misnamed model
- 7253f2b: - Fallback to PUBLIC\_ envs server side
- Updated dependencies [d00742f]
  - @inkeep/agents-core@0.22.3
  - @inkeep/agents-manage-api@0.22.3
  - @inkeep/agents-run-api@0.22.3

## 0.22.2

### Patch Changes

- af7446e: update agents-ui to 0.14.14
- abdf614: Default model configs
- Updated dependencies [abdf614]
  - @inkeep/agents-manage-api@0.22.2
  - @inkeep/agents-run-api@0.22.2
  - @inkeep/agents-core@0.22.2

## 0.22.1

### Patch Changes

- ba2a297: Support remote sandboxes
- Updated dependencies [ba2a297]
  - @inkeep/agents-core@0.22.1
  - @inkeep/agents-run-api@0.22.1
  - @inkeep/agents-manage-api@0.22.1

## 0.22.0

### Minor Changes

- 9427ad4: Add PUBLIC env vars for manageui

### Patch Changes

- 8a10d65: updated inkeep pull and added new zod schema support for status components
- Updated dependencies [8a10d65]
  - @inkeep/agents-manage-api@0.22.0
  - @inkeep/agents-run-api@0.22.0
  - @inkeep/agents-core@0.22.0

## 0.21.1

### Patch Changes

- 4815d3a: create bearer in keychain
- 1aefe88: Update default project
- eb0ffa2: removed model pinning
- Updated dependencies [4815d3a]
- Updated dependencies [1aefe88]
- Updated dependencies [eb0ffa2]
  - @inkeep/agents-core@0.21.1
  - @inkeep/agents-manage-api@0.21.1
  - @inkeep/agents-run-api@0.21.1

## 0.21.0

### Minor Changes

- 88ff25c: Fix table name for sub agent function tool relations

### Patch Changes

- 43cd2f6: updated tests
- Updated dependencies [88ff25c]
- Updated dependencies [43cd2f6]
  - @inkeep/agents-manage-api@0.21.0
  - @inkeep/agents-run-api@0.21.0
  - @inkeep/agents-core@0.21.0

## 0.20.1

### Patch Changes

- 1e5188d: split tool execution into tool call and tool result
- Updated dependencies [1e5188d]
  - @inkeep/agents-run-api@0.20.1
  - @inkeep/agents-manage-api@0.20.1
  - @inkeep/agents-core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [fb99085]
  - @inkeep/agents-core@0.20.0
  - @inkeep/agents-run-api@0.20.0
  - @inkeep/agents-manage-api@0.20.0

## 0.19.9

### Patch Changes

- b172a43: Renaming followups
- 4e9948f: otel trace pretty
- e9bfd8a: Fix agent prompt field in UI
  - @inkeep/agents-manage-api@0.19.9
  - @inkeep/agents-run-api@0.19.9
  - @inkeep/agents-core@0.19.9

## 0.19.8

### Patch Changes

- e9048e2: split tool execution into tool call and tool result
- Updated dependencies [e9048e2]
  - @inkeep/agents-run-api@0.19.8
  - @inkeep/agents-manage-api@0.19.8
  - @inkeep/agents-core@0.19.8

## 0.19.7

### Patch Changes

- Updated dependencies [ceef086]
  - @inkeep/agents-run-api@0.19.7
  - @inkeep/agents-manage-api@0.19.7
  - @inkeep/agents-core@0.19.7

## 0.19.6

### Patch Changes

- 0d0166f: stream object in timeline
- Updated dependencies [0d0166f]
- Updated dependencies [76fb9aa]
- Updated dependencies [0d0166f]
  - @inkeep/agents-run-api@0.19.6
  - @inkeep/agents-core@0.19.6
  - @inkeep/agents-manage-api@0.19.6

## 0.19.5

### Patch Changes

- 22b96c4: inkeep cli pull command uses dynamic planner
- 20978ac: - Bump agents ui version to 0.14.12
- Updated dependencies [22b96c4]
  - @inkeep/agents-manage-api@0.19.5
  - @inkeep/agents-run-api@0.19.5
  - @inkeep/agents-core@0.19.5

## 0.19.4

### Patch Changes

- 7a3fc7f: Fixed tests
- a2c184f: Capitalize name casing for External Agent
- Updated dependencies [7a3fc7f]
  - @inkeep/agents-run-api@0.19.4
  - @inkeep/agents-manage-api@0.19.4
  - @inkeep/agents-core@0.19.4

## 0.19.3

### Patch Changes

- 079a18a: more-model-def-fixes
- Updated dependencies [079a18a]
  - @inkeep/agents-core@0.19.3
  - @inkeep/agents-manage-api@0.19.3
  - @inkeep/agents-run-api@0.19.3

## 0.19.2

### Patch Changes

- Updated dependencies [717d483]
  - @inkeep/agents-core@0.19.2
  - @inkeep/agents-manage-api@0.19.2
  - @inkeep/agents-run-api@0.19.2

## 0.19.1

### Patch Changes

- @inkeep/agents-manage-api@0.19.1
- @inkeep/agents-run-api@0.19.1
- @inkeep/agents-core@0.19.1

## 0.19.0

### Minor Changes

- 71a9f03: Rename Graphs to Agents, complete migration from agents to sub agents, various cleanup

### Patch Changes

- 849c6e9: added new cosntants for model and inkeep pull
- Updated dependencies [849c6e9]
- Updated dependencies [71a9f03]
  - @inkeep/agents-core@0.19.0
  - @inkeep/agents-manage-api@0.19.0
  - @inkeep/agents-run-api@0.19.0

## 0.18.1

### Patch Changes

- 5ae3706: lint fixes
- 71892f2: artifacts in timeline
- Updated dependencies [71892f2]
  - @inkeep/agents-core@0.18.1
  - @inkeep/agents-manage-api@0.18.1
  - @inkeep/agents-run-api@0.18.1

## 0.18.0

### Minor Changes

- 091c56a: introduce new JSON editor with copying field functionality powered by pure Monaco Editor
- 3684a31: Rename Agents to SubAgents

### Patch Changes

- 9cc2641: - Fix form submission for artifacts with props
- 81d5a7e: Template variable preservation in placeholders
- 2165d9b: improve errors and fix bug
- e91f4bc: fix `<div> cannot be a descendant of <p>.` in `/traces/conversations` page
- 7363d66: Delete unused `SimpleThemeToggle` component
- 9bdf630: Fixed streamed non final output text tracking
- Updated dependencies [81d5a7e]
- Updated dependencies [2165d9b]
- Updated dependencies [1600323]
- Updated dependencies [3684a31]
- Updated dependencies [9bdf630]
  - @inkeep/agents-manage-api@0.18.0
  - @inkeep/agents-run-api@0.18.0
  - @inkeep/agents-core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [9dd08c6]
- Updated dependencies [94c0c18]
  - @inkeep/agents-run-api@0.17.0
  - @inkeep/agents-core@0.17.0
  - @inkeep/agents-manage-api@0.17.0

## 0.16.3

### Patch Changes

- @inkeep/agents-manage-api@0.16.3
- @inkeep/agents-run-api@0.16.3
- @inkeep/agents-core@0.16.3

## 0.16.2

### Patch Changes

- Updated dependencies [4df3308]
  - @inkeep/agents-core@0.16.2
  - @inkeep/agents-manage-api@0.16.2
  - @inkeep/agents-run-api@0.16.2

## 0.16.1

### Patch Changes

- 0707d2d: polling fix
- 23a4766: banner
  - @inkeep/agents-manage-api@0.16.1
  - @inkeep/agents-run-api@0.16.1
  - @inkeep/agents-core@0.16.1

## 0.16.0

### Minor Changes

- 5c3bbec: Request context refactor

### Patch Changes

- 35e6c9e: Updated Artifact Schema
- Updated dependencies [5c3bbec]
- Updated dependencies [35e6c9e]
- Updated dependencies [e88e98c]
  - @inkeep/agents-core@0.16.0
  - @inkeep/agents-manage-api@0.16.0
  - @inkeep/agents-run-api@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [ad5528c]
  - @inkeep/agents-core@0.15.0
  - @inkeep/agents-manage-api@0.15.0
  - @inkeep/agents-run-api@0.15.0

## 0.14.16

### Patch Changes

- @inkeep/agents-manage-api@0.14.16
- @inkeep/agents-run-api@0.14.16
- @inkeep/agents-core@0.14.16

## 0.14.15

### Patch Changes

- 4c76290: Tweak styling on edge pane, graph settings label
  - @inkeep/agents-manage-api@0.14.15
  - @inkeep/agents-run-api@0.14.15
  - @inkeep/agents-core@0.14.15

## 0.14.14

### Patch Changes

- Updated dependencies [8fe8c3e]
  - @inkeep/agents-core@0.14.14
  - @inkeep/agents-manage-api@0.14.14
  - @inkeep/agents-run-api@0.14.14

## 0.14.13

### Patch Changes

- 0a4e37c: Highlight active tools in available tools list
  - @inkeep/agents-manage-api@0.14.13
  - @inkeep/agents-run-api@0.14.13
  - @inkeep/agents-core@0.14.13

## 0.14.12

### Patch Changes

- 9c12ca8: error parse and span fix
- a05d397: reduce log spam during tests runs
- Updated dependencies [9c12ca8]
- Updated dependencies [a05d397]
  - @inkeep/agents-run-api@0.14.12
  - @inkeep/agents-manage-api@0.14.12
  - @inkeep/agents-core@0.14.12

## 0.14.11

### Patch Changes

- ef0a682: Release
- Updated dependencies [ef0a682]
  - @inkeep/agents-manage-api@0.14.11
  - @inkeep/agents-run-api@0.14.11
  - @inkeep/agents-core@0.14.11

## 0.14.10

### Patch Changes

- cee3fa1: use type defs from @inkeep/agents-core in llm generated @inkeep/agents-cli pull command prompts
- 0f95f38: enables line wrapping in the prompt/graph prompts editors
- 521c60e: Align toast error colors with `<GraphErrorSummaryComponent>` styling
- Updated dependencies [cee3fa1]
  - @inkeep/agents-core@0.14.10
  - @inkeep/agents-manage-api@0.14.10
  - @inkeep/agents-run-api@0.14.10

## 0.14.9

### Patch Changes

- c7194ce: error handling and agent name more visible
- Updated dependencies [c7194ce]
- Updated dependencies [c7194ce]
  - @inkeep/agents-core@0.14.9
  - @inkeep/agents-run-api@0.14.9
  - @inkeep/agents-manage-api@0.14.9

## 0.14.8

### Patch Changes

- @inkeep/agents-manage-api@0.14.8
- @inkeep/agents-run-api@0.14.8
- @inkeep/agents-core@0.14.8

## 0.14.7

### Patch Changes

- Updated dependencies [d891309]
- Updated dependencies [735d238]
  - @inkeep/agents-core@0.14.7
  - @inkeep/agents-run-api@0.14.7
  - @inkeep/agents-manage-api@0.14.7

## 0.14.6

### Patch Changes

- af3f015: bug fix for traces
  - @inkeep/agents-manage-api@0.14.6
  - @inkeep/agents-run-api@0.14.6
  - @inkeep/agents-core@0.14.6

## 0.14.5

### Patch Changes

- 557afac: Improve mcp client connection with cache
- Updated dependencies [557afac]
  - @inkeep/agents-core@0.14.5
  - @inkeep/agents-manage-api@0.14.5
  - @inkeep/agents-run-api@0.14.5

## 0.14.4

### Patch Changes

- 098c439: relayouts the graph using Dagre when a `replace` change causes node intersections
- Updated dependencies [b88e9b1]
  - @inkeep/agents-run-api@0.14.4
  - @inkeep/agents-manage-api@0.14.4
  - @inkeep/agents-core@0.14.4

## 0.14.3

### Patch Changes

- Updated dependencies [c6b3a21]
  - @inkeep/agents-run-api@0.14.3
  - @inkeep/agents-manage-api@0.14.3
  - @inkeep/agents-core@0.14.3

## 0.14.2

### Patch Changes

- bc14f9f: Allow trying the graph when nodes have been repositioned
- Updated dependencies [c84d368]
  - @inkeep/agents-run-api@0.14.2
  - @inkeep/agents-manage-api@0.14.2
  - @inkeep/agents-core@0.14.2

## 0.14.1

### Patch Changes

- Updated dependencies [b056d33]
  - @inkeep/agents-core@0.14.1
  - @inkeep/agents-manage-api@0.14.1
  - @inkeep/agents-run-api@0.14.1

## 0.14.0

### Patch Changes

- a72a22c: Add `⌘ + S` / `Ctrl + S` (windows) shortcut to save changes
- Updated dependencies [521a908]
  - @inkeep/agents-manage-api@0.14.0
  - @inkeep/agents-run-api@0.14.0
  - @inkeep/agents-core@0.14.0

## 0.13.0

### Patch Changes

- 079ccfa: - Fix project form bugs
- c43a622: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- c7eae94: Variable suggestions feature for Prompt/Graph Prompt inputs
- Updated dependencies [c43a622]
- Updated dependencies [94e010a]
  - @inkeep/agents-manage-api@0.13.0
  - @inkeep/agents-run-api@0.13.0
  - @inkeep/agents-core@0.13.0

## 0.12.1

### Patch Changes

- 2c255ba: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- Updated dependencies [2c255ba]
  - @inkeep/agents-manage-api@0.12.1
  - @inkeep/agents-run-api@0.12.1
  - @inkeep/agents-core@0.12.1

## 0.12.0

### Patch Changes

- ca84651: show prebuilt servers when creating new mcp server
- Updated dependencies [c4284a3]
- Updated dependencies [2b16ae6]
  - @inkeep/agents-run-api@0.12.0
  - @inkeep/agents-core@0.12.0
  - @inkeep/agents-manage-api@0.12.0

## 0.11.3

### Patch Changes

- ff6ef79: exceptions added to ui
- dc13c2c: render in span details
  - @inkeep/agents-manage-api@0.11.3
  - @inkeep/agents-run-api@0.11.3
  - @inkeep/agents-core@0.11.3

## 0.11.2

### Patch Changes

- 42cf60c: Show 4 tools on node by default
  - @inkeep/agents-manage-api@0.11.2
  - @inkeep/agents-run-api@0.11.2
  - @inkeep/agents-core@0.11.2

## 0.11.1

### Patch Changes

- de7afa3: - UI cleanup
  - @inkeep/agents-manage-api@0.11.1
  - @inkeep/agents-run-api@0.11.1
  - @inkeep/agents-core@0.11.1

## 0.11.0

### Minor Changes

- 9cbb2a5: DB management is maturing; management is now done with explicit drizzle migrations; it is no longer recommended to use drizzle-kit push for db schema updates; recommendation is to use drizzle-kit migrate which will make databases more stable

### Patch Changes

- Updated dependencies [9cbb2a5]
  - @inkeep/agents-core@0.11.0
  - @inkeep/agents-manage-api@0.11.0
  - @inkeep/agents-run-api@0.11.0

## 0.10.2

### Patch Changes

- 46d9d53: - Rename data components to components at the ui layer, make graph api keys just api keys and reorder sidebar nav
- 7c465c9: remove thinking tool
- 74c3acf: Rename artifact components to artifacts
  - @inkeep/agents-manage-api@0.10.2
  - @inkeep/agents-run-api@0.10.2
  - @inkeep/agents-core@0.10.2

## 0.10.1

### Patch Changes

- 4fab007: bug fix for advanced span attributes
- 3dc946c: highlighting items
- 974992c: context fetching span and ui trace improvements
- Updated dependencies [974992c]
  - @inkeep/agents-core@0.10.1
  - @inkeep/agents-manage-api@0.10.1
  - @inkeep/agents-run-api@0.10.1

## 0.10.0

### Minor Changes

- d7fdb5c: Update oauth login and callback urls

### Patch Changes

- 7801b2c: improve credential store use for cloud deployments
- Updated dependencies [7801b2c]
- Updated dependencies [d7fdb5c]
  - @inkeep/agents-core@0.10.0
  - @inkeep/agents-manage-api@0.10.0
  - @inkeep/agents-run-api@0.10.0

## 0.9.0

### Minor Changes

- 44178fc: Improve Visual Builder agent-tool relations, and bug fixes

### Patch Changes

- 898e18b: Add chat as sidebar unless traces are showing
- Updated dependencies [6fb1e3d]
- Updated dependencies [44178fc]
  - @inkeep/agents-core@0.9.0
  - @inkeep/agents-manage-api@0.9.0
  - @inkeep/agents-run-api@0.9.0

## 0.8.7

### Patch Changes

- @inkeep/agents-manage-api@0.8.7
- @inkeep/agents-run-api@0.8.7
- @inkeep/agents-core@0.8.7

## 0.8.6

### Patch Changes

- Updated dependencies [2484a6c]
  - @inkeep/agents-core@0.8.6
  - @inkeep/agents-manage-api@0.8.6
  - @inkeep/agents-run-api@0.8.6

## 0.8.5

### Patch Changes

- 84989b4: observability linked
- Updated dependencies [3c93e9e]
- Updated dependencies [1e7cd99]
  - @inkeep/agents-core@0.8.5
  - @inkeep/agents-manage-api@0.8.5
  - @inkeep/agents-run-api@0.8.5

## 0.8.4

### Patch Changes

- 9eebd7f: External Agent UI Enhancements
- Updated dependencies [9eebd7f]
  - @inkeep/agents-core@0.8.4
  - @inkeep/agents-manage-api@0.8.4
  - @inkeep/agents-run-api@0.8.4

## 0.8.3

### Patch Changes

- de4ffac: - Fix bug with project form validation
  - @inkeep/agents-manage-api@0.8.3
  - @inkeep/agents-run-api@0.8.3
  - @inkeep/agents-core@0.8.3

## 0.8.2

### Patch Changes

- 3a95469: added default components for status
- 0f6e19b: - Display tools on mcp node
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
  - @inkeep/agents-core@0.8.2
  - @inkeep/agents-manage-api@0.8.2
  - @inkeep/agents-run-api@0.8.2

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
- Updated dependencies [dc19f1a]
- Updated dependencies [2589d96]
  - @inkeep/agents-manage-api@0.8.1
  - @inkeep/agents-run-api@0.8.1
  - @inkeep/agents-core@0.8.1

## 0.8.0

### Minor Changes

- 853d431: adding headers to agent-tool relation

### Patch Changes

- Updated dependencies [853d431]
  - @inkeep/agents-core@0.8.0
  - @inkeep/agents-run-api@0.8.0
  - @inkeep/agents-manage-api@0.8.0

## 0.7.2

### Patch Changes

- bab9a32: conversation ordering fix
  - @inkeep/agents-manage-api@0.7.2
  - @inkeep/agents-run-api@0.7.2
  - @inkeep/agents-core@0.7.2

## 0.7.1

### Patch Changes

- 78e71e9: Bump cxkit-react-oss version to 0.5.105
  - @inkeep/agents-manage-api@0.7.1
  - @inkeep/agents-run-api@0.7.1
  - @inkeep/agents-core@0.7.1

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
