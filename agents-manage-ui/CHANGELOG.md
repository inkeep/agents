# @inkeep/agents-manage-ui

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
