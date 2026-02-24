# @inkeep/agents-work-apps

## 0.52.0

### Patch Changes

- eea5f0a: agents-core: Add isUniqueConstraintError and throwIfUniqueConstraintError helpers to normalize unique constraint error detection across PostgreSQL and Doltgres

  agents-api: Fix duplicate resource creation returning 500 instead of 409 when Doltgres reports unique constraint violations as MySQL errno 1062

  agents-work-apps: Fix concurrent user mapping creation returning 500 instead of succeeding silently when a duplicate mapping already exists

- f2d822b: Fix Slack modal showing 'We had some trouble connecting' error on form submission by returning empty ack body
- 520e4f0: Add branch file inspection tool to github mcp
- Updated dependencies [886b2da]
- Updated dependencies [eea5f0a]
- Updated dependencies [65f71b5]
  - @inkeep/agents-core@0.52.0

## 0.51.0

### Patch Changes

- fe36caa: Fix error response format consistency in join-from-workspace endpoints
- 012a843: Add tool approvals to slack app
- Updated dependencies [012a843]
- Updated dependencies [fe36caa]
  - @inkeep/agents-core@0.51.0

## 0.50.6

### Patch Changes

- @inkeep/agents-core@0.50.6

## 0.50.5

### Patch Changes

- Updated dependencies [56fd821]
  - @inkeep/agents-core@0.50.5

## 0.50.4

### Patch Changes

- Updated dependencies [e623802]
  - @inkeep/agents-core@0.50.4

## 0.50.3

### Patch Changes

- 2005b87: Fix internal API routing for Slack work app in multi-instance environments.
- 1be6def: Update slack streaming timeout to 10 minutes
- 0011c4b: Mimic nango config in dev mode.
- Updated dependencies [2005b87]
- Updated dependencies [d50fa44]
  - @inkeep/agents-core@0.50.3

## 0.50.2

### Patch Changes

- becf184: standardize permission checks in routes
- Updated dependencies [fa71905]
- Updated dependencies [a4ee2d4]
- Updated dependencies [becf184]
  - @inkeep/agents-core@0.50.2

## 0.50.1

### Patch Changes

- Updated dependencies [e643f0e]
- Updated dependencies [561659a]
- Updated dependencies [6d31fe6]
  - @inkeep/agents-core@0.50.1

## 0.50.0

### Minor Changes

- 5bd9461: Add reaction tooling to github mcp.

### Patch Changes

- @inkeep/agents-core@0.50.0

## 0.49.0

### Minor Changes

- 3f556b7: Remove run and list commands from slack app

### Patch Changes

- @inkeep/agents-core@0.49.0

## 0.48.7

### Patch Changes

- Updated dependencies [3532557]
  - @inkeep/agents-core@0.48.7

## 0.48.6

### Patch Changes

- Updated dependencies [2e8d956]
  - @inkeep/agents-core@0.48.6

## 0.48.5

### Patch Changes

- f39f8b0: Update slack message formatting to include channel and user names.
  - @inkeep/agents-core@0.48.5

## 0.48.4

### Patch Changes

- 2a91f04: Remove hostname allowlist validation for INKEEP_AGENTS_MANAGE_UI_URL to support custom domains
- Updated dependencies [11f4e14]
  - @inkeep/agents-core@0.48.4

## 0.48.3

### Patch Changes

- Updated dependencies [24e75fb]
- Updated dependencies [79dffed]
  - @inkeep/agents-core@0.48.3

## 0.48.2

### Patch Changes

- @inkeep/agents-core@0.48.2

## 0.48.1

### Patch Changes

- a0464cb: Fix Slack API retry import
  - @inkeep/agents-core@0.48.1

## 0.48.0

### Patch Changes

- 7417653: Fix Slack API pagination for channels and membership checks
- 94fcd60: Add line number option to get-file-content tool
- 2521fcf: remove server cache
- Updated dependencies [f981006]
- Updated dependencies [e11fae9]
- Updated dependencies [228d4e2]
- Updated dependencies [7ad7e21]
- Updated dependencies [95a3abc]
- Updated dependencies [b2a6078]
  - @inkeep/agents-core@0.48.0

## 0.47.5

### Patch Changes

- @inkeep/agents-core@0.47.5

## 0.47.4

### Patch Changes

- Updated dependencies [83346fc]
- Updated dependencies [5f3f5ea]
  - @inkeep/agents-core@0.47.4

## 0.47.3

### Patch Changes

- 3abfc41: Simplify author payload and add isSuggestion
- Updated dependencies [756a560]
- Updated dependencies [045c405]
  - @inkeep/agents-core@0.47.3

## 0.47.2

### Patch Changes

- Updated dependencies [c5357e5]
  - @inkeep/agents-core@0.47.2

## 0.47.1

### Patch Changes

- Updated dependencies [6fbe785]
  - @inkeep/agents-core@0.47.1

## 0.47.0

### Patch Changes

- Updated dependencies [77a45c9]
- Updated dependencies [cfee934]
  - @inkeep/agents-core@0.47.0

## 0.46.1

### Patch Changes

- 6139d11: Github mcp efficiency improvements
- Updated dependencies [f6010a1]
- Updated dependencies [07a027d]
  - @inkeep/agents-core@0.46.1

## 0.46.0

### Patch Changes

- 4811c97: performance imp trace
- Updated dependencies [4811c97]
- Updated dependencies [12ad286]
  - @inkeep/agents-core@0.46.0

## 0.45.3

### Patch Changes

- 37248c6: visualize update from feature branch
- 16f91d0: bump `hono` to `^4.11.7` to fix pnpm audit vulnerabilities
- Updated dependencies [4a83260]
- Updated dependencies [bee6724]
- Updated dependencies [16f91d0]
- Updated dependencies [632d68d]
  - @inkeep/agents-core@0.45.3

## 0.45.2

### Patch Changes

- Updated dependencies [4524c28]
  - @inkeep/agents-core@0.45.2

## 0.45.1

### Patch Changes

- 54b2d4c: Get file content from feature branch
- Updated dependencies [21e6ae5]
  - @inkeep/agents-core@0.45.1

## 0.45.0

### Patch Changes

- 0ef70dd: Add review params to pull request tool.
- 4f91394: add new available-agents route and authz permissions to runAuth middleware
- Updated dependencies [938ffb8]
- Updated dependencies [4f91394]
- Updated dependencies [6f5bd15]
  - @inkeep/agents-core@0.45.0

## 0.44.0

### Minor Changes

- 08aa941: Add GitHub app management functionality

### Patch Changes

- Updated dependencies [08aa941]
- Updated dependencies [5bb2da2]
- Updated dependencies [8a283ea]
- Updated dependencies [bcc26b4]
- Updated dependencies [ba853ef]
  - @inkeep/agents-core@0.44.0
