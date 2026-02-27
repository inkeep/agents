# @inkeep/agents-api

## 0.53.11

### Patch Changes

- e094c16: Improve Agent Card fetch error diagnostics by logging response body on failure
- 5061d64: Add blob storage abstraction (S3 and Vercel Blob providers)
  - @inkeep/agents-core@0.53.11
  - @inkeep/agents-mcp@0.53.11
  - @inkeep/agents-work-apps@0.53.11

## 0.53.10

### Patch Changes

- eacb0dc: adding stream timeout to trace timeline
- Updated dependencies [eacb0dc]
- Updated dependencies [33780a8]
- Updated dependencies [7299f4a]
  - @inkeep/agents-core@0.53.10
  - @inkeep/agents-work-apps@0.53.10
  - @inkeep/agents-mcp@0.53.10

## 0.53.9

### Patch Changes

- 27cd96b: update composio mcp servers with api key header
- 603d7a8: Add user-scoped scheduled trigger execution with runAsUserId field for user identity and credential resolution
- Updated dependencies [9a2d783]
- Updated dependencies [27cd96b]
- Updated dependencies [8a0c90c]
- Updated dependencies [603d7a8]
  - @inkeep/agents-core@0.53.9
  - @inkeep/agents-work-apps@0.53.9
  - @inkeep/agents-mcp@0.53.9

## 0.53.8

### Patch Changes

- 50b63a3: Add Slack source indicator with entry point tracking to conversation traces and stats. Distinguishes between app mention, DM, slash command, message shortcut, modal submission, and smart link resume entry points. Fix resume-intent to use getInProcessFetch for multi-instance safety.
- Updated dependencies [50b63a3]
- Updated dependencies [4761e1f]
  - @inkeep/agents-work-apps@0.53.8
  - @inkeep/agents-core@0.53.8
  - @inkeep/agents-mcp@0.53.8

## 0.53.7

### Patch Changes

- 54985c0: feat(dashboard): refactor external agents form to use zod schemas from `agents-core`
- Updated dependencies [aa37d3f]
- Updated dependencies [54985c0]
  - @inkeep/agents-core@0.53.7
  - @inkeep/agents-work-apps@0.53.7
  - @inkeep/agents-mcp@0.53.7

## 0.53.6

### Patch Changes

- @inkeep/agents-core@0.53.6
- @inkeep/agents-mcp@0.53.6
- @inkeep/agents-work-apps@0.53.6

## 0.53.5

### Patch Changes

- Updated dependencies [7abd1bd]
  - @inkeep/agents-work-apps@0.53.5
  - @inkeep/agents-core@0.53.5
  - @inkeep/agents-mcp@0.53.5

## 0.53.4

### Patch Changes

- 35ca5cb: Refactor API key validation schemas to use shared definitions from `agents-core`
- Updated dependencies [16d775c]
- Updated dependencies [35ca5cb]
- Updated dependencies [be72c29]
  - @inkeep/agents-work-apps@0.53.4
  - @inkeep/agents-core@0.53.4
  - @inkeep/agents-mcp@0.53.4

## 0.53.3

### Patch Changes

- 60cb0fd: Fix dev-session crash with better-auth >= 1.4.13 by handling renamed authCookies property
- Updated dependencies [f7e47ab]
  - @inkeep/agents-work-apps@0.53.3
  - @inkeep/agents-core@0.53.3
  - @inkeep/agents-mcp@0.53.3

## 0.53.2

### Patch Changes

- @inkeep/agents-core@0.53.2
- @inkeep/agents-mcp@0.53.2
- @inkeep/agents-work-apps@0.53.2

## 0.53.1

### Patch Changes

- 2583c64: remove flushing on local dev for otel
- Updated dependencies [8063da9]
- Updated dependencies [bd3aab5]
- Updated dependencies [75fbceb]
- Updated dependencies [c4d8a7b]
  - @inkeep/agents-work-apps@0.53.1
  - @inkeep/agents-core@0.53.1
  - @inkeep/agents-mcp@0.53.1

## 0.53.0

### Patch Changes

- 6a7dc67: Updated artifact parsing
- Updated dependencies [901ff0a]
- Updated dependencies [6d435a6]
- Updated dependencies [0a0cb6e]
- Updated dependencies [41ed409]
- Updated dependencies [38506a8]
- Updated dependencies [f868a96]
- Updated dependencies [4d4fa33]
  - @inkeep/agents-work-apps@0.53.0
  - @inkeep/agents-core@0.53.0
  - @inkeep/agents-mcp@0.53.0

## 0.52.0

### Patch Changes

- eea5f0a: agents-core: Add isUniqueConstraintError and throwIfUniqueConstraintError helpers to normalize unique constraint error detection across PostgreSQL and Doltgres

  agents-api: Fix duplicate resource creation returning 500 instead of 409 when Doltgres reports unique constraint violations as MySQL errno 1062

  agents-work-apps: Fix concurrent user mapping creation returning 500 instead of succeeding silently when a duplicate mapping already exists

- Updated dependencies [886b2da]
- Updated dependencies [eea5f0a]
- Updated dependencies [65f71b5]
- Updated dependencies [f2d822b]
- Updated dependencies [520e4f0]
  - @inkeep/agents-core@0.52.0
  - @inkeep/agents-work-apps@0.52.0
  - @inkeep/agents-mcp@0.52.0

## 0.51.0

### Patch Changes

- 012a843: Add tool approvals to slack app
- Updated dependencies [fe36caa]
- Updated dependencies [012a843]
- Updated dependencies [fe36caa]
  - @inkeep/agents-work-apps@0.51.0
  - @inkeep/agents-core@0.51.0
  - @inkeep/agents-mcp@0.51.0

## 0.50.6

### Patch Changes

- 51bb2f6: remove noisy instrumentation in agents api
  - @inkeep/agents-core@0.50.6
  - @inkeep/agents-mcp@0.50.6
  - @inkeep/agents-work-apps@0.50.6

## 0.50.5

### Patch Changes

- Updated dependencies [56fd821]
  - @inkeep/agents-core@0.50.5
  - @inkeep/agents-work-apps@0.50.5
  - @inkeep/agents-mcp@0.50.5

## 0.50.4

### Patch Changes

- Updated dependencies [e623802]
  - @inkeep/agents-core@0.50.4
  - @inkeep/agents-work-apps@0.50.4
  - @inkeep/agents-mcp@0.50.4

## 0.50.3

### Patch Changes

- 2005b87: Fix internal API routing for Slack work app in multi-instance environments.
- 0aea45a: Add OpenTelemetry instrumentation for server-side tracing
- Updated dependencies [2005b87]
- Updated dependencies [d50fa44]
- Updated dependencies [1be6def]
- Updated dependencies [0011c4b]
  - @inkeep/agents-work-apps@0.50.3
  - @inkeep/agents-core@0.50.3
  - @inkeep/agents-mcp@0.50.3

## 0.50.2

### Patch Changes

- fa71905: Added Oversized Artifact Handling and Context Window Size Management at Provider Options
- becf184: standardize permission checks in routes
- Updated dependencies [fa71905]
- Updated dependencies [a4ee2d4]
- Updated dependencies [becf184]
  - @inkeep/agents-core@0.50.2
  - @inkeep/agents-work-apps@0.50.2
  - @inkeep/agents-mcp@0.50.2

## 0.50.1

### Patch Changes

- Updated dependencies [e643f0e]
- Updated dependencies [561659a]
- Updated dependencies [6d31fe6]
  - @inkeep/agents-core@0.50.1
  - @inkeep/agents-work-apps@0.50.1
  - @inkeep/agents-mcp@0.50.1

## 0.50.0

### Patch Changes

- Updated dependencies [5bd9461]
  - @inkeep/agents-work-apps@0.50.0
  - @inkeep/agents-core@0.50.0
  - @inkeep/agents-mcp@0.50.0

## 0.49.0

### Patch Changes

- a998bb3: Harden dev auto-login: require bypass secret on /api/auth/dev-session and move auto-login to server-side proxy
- Updated dependencies [3f556b7]
  - @inkeep/agents-work-apps@0.49.0
  - @inkeep/agents-core@0.49.0
  - @inkeep/agents-mcp@0.49.0

## 0.48.7

### Patch Changes

- Updated dependencies [3532557]
  - @inkeep/agents-core@0.48.7
  - @inkeep/agents-work-apps@0.48.7
  - @inkeep/agents-mcp@0.48.7

## 0.48.6

### Patch Changes

- 4afaf71: Improve cron schedule display in Triggers table with human-readable descriptions and tooltips showing the raw expression
- Updated dependencies [2e8d956]
  - @inkeep/agents-core@0.48.6
  - @inkeep/agents-work-apps@0.48.6
  - @inkeep/agents-mcp@0.48.6

## 0.48.5

### Patch Changes

- ded8362: improve performance time for traces on vercel
- Updated dependencies [f39f8b0]
  - @inkeep/agents-work-apps@0.48.5
  - @inkeep/agents-core@0.48.5
  - @inkeep/agents-manage-mcp@0.48.5
  - @inkeep/agents-mcp@0.48.5

## 0.48.4

### Patch Changes

- 37e72ed: Now localhost origins are only allowed when ENVIRONMENT is development or test. In production/pentest, CORS will require either INKEEP_AGENTS_MANAGE_UI_URL to be set or the origin to share the same base
- Updated dependencies [11f4e14]
- Updated dependencies [2a91f04]
  - @inkeep/agents-core@0.48.4
  - @inkeep/agents-work-apps@0.48.4
  - @inkeep/agents-manage-mcp@0.48.4
  - @inkeep/agents-mcp@0.48.4

## 0.48.3

### Patch Changes

- 9b64a7d: Fix internal fetch routing when deployed with Vercel bundling (cron triggers)
- Updated dependencies [24e75fb]
- Updated dependencies [79dffed]
  - @inkeep/agents-core@0.48.3
  - @inkeep/agents-work-apps@0.48.3
  - @inkeep/agents-manage-mcp@0.48.3
  - @inkeep/agents-mcp@0.48.3

## 0.48.2

### Patch Changes

- @inkeep/agents-core@0.48.2
- @inkeep/agents-manage-mcp@0.48.2
- @inkeep/agents-mcp@0.48.2
- @inkeep/agents-work-apps@0.48.2

## 0.48.1

### Patch Changes

- Updated dependencies [a0464cb]
  - @inkeep/agents-work-apps@0.48.1
  - @inkeep/agents-core@0.48.1
  - @inkeep/agents-manage-mcp@0.48.1
  - @inkeep/agents-mcp@0.48.1

## 0.48.0

### Minor Changes

- b2a6078: ## Agent Skills

  Skills are reusable instruction blocks that can be attached to sub-agents to govern behavior, reasoning, and tool usage.

  ### Features

  - **Visual Builder**: Create, edit, and delete skills from the new Skills page. Attach skills to sub-agents via the sidepane picker with drag-to-reorder support.

  - **TypeScript SDK**:

    - New `SkillDefinition` and `SkillReference` types
    - `loadSkills(directoryPath)` helper to load skills from `SKILL.md` files
    - `skills` config option on `SubAgent` and `Project`

  - **API**: New CRUD endpoints for skills (`/skills`) and sub-agent skill associations (`/sub-agent-skills`)

  - **CLI**: `inkeep pull` now generates skill files in the `skills/` directory

  ### Loading Modes

  - **Always loaded**: Skill content is included in every prompt
  - **On-demand**: Skill appears as an outline in the system prompt and can be loaded via the built-in `load_skill` tool when needed

  ### SKILL.md Format

  ```md
  ---
  name: "my-skill"
  description: "When to use this skill"
  metadata:
    author: org
    version: "1.0"
  ---

  Skill content in markdown...
  ```

### Patch Changes

- 87270d9: Added tool call id to tool call results
- f981006: Unwrap generic Vercel AI SDK errors (e.g., "fetch failed") to surface root cause in logs and traces
- 0fd8b63: Add error logging to trigger execution paths and update invocation status to 'failed' on errors
- e11fae9: Fix props field type in data components to be non-null and improve type safety with JsonSchemaForLlmSchemaType
- 7cb0d54: Normalize JSON schemas for OpenAI structured output compatibility
- 80152a1: Fix internal A2A and self-referencing calls to use in-process fetch transport instead of network loopback, ensuring same-instance execution for features relying on process-local state like SSE stream registries
- 7ad7e21: Refactor artifact and data component validation to use centralized Zod schemas from agents-core. This eliminates duplicate validation logic and improves consistency across the codebase.
- aee6362: Fix missing OpenTelemetry spans in Vercel serverless streaming responses
- 6922f83: Add SpiceDB authorization sync for project create and delete operations
- 95a3abc: Add scheduled/cron trigger support across the full stack — database schema, API routes, Manage UI
- Updated dependencies [f981006]
- Updated dependencies [e11fae9]
- Updated dependencies [7417653]
- Updated dependencies [94fcd60]
- Updated dependencies [228d4e2]
- Updated dependencies [7ad7e21]
- Updated dependencies [2521fcf]
- Updated dependencies [95a3abc]
- Updated dependencies [b2a6078]
  - @inkeep/agents-core@0.48.0
  - @inkeep/agents-work-apps@0.48.0
  - @inkeep/agents-manage-mcp@0.48.0
  - @inkeep/agents-mcp@0.48.0

## 0.47.5

### Patch Changes

- @inkeep/agents-core@0.47.5
- @inkeep/agents-manage-mcp@0.47.5
- @inkeep/agents-mcp@0.47.5
- @inkeep/agents-work-apps@0.47.5

## 0.47.4

### Patch Changes

- 83346fc: Retry/rerun functionality for webhook triggers in the traces UI
- 820bd49: Fix z.stringbool() breaking COMPRESSION_ENABLED default when env var is unset
- Updated dependencies [83346fc]
- Updated dependencies [5f3f5ea]
  - @inkeep/agents-core@0.47.4
  - @inkeep/agents-work-apps@0.47.4
  - @inkeep/agents-manage-mcp@0.47.4
  - @inkeep/agents-mcp@0.47.4

## 0.47.3

### Patch Changes

- 756a560: Consolidate `ResourceId` as reusable OpenAPI component to reduce spec size
- 045c405: enhance tool approval handling, so agents are conversationally aware of approvals
- Updated dependencies [3abfc41]
- Updated dependencies [756a560]
- Updated dependencies [045c405]
  - @inkeep/agents-work-apps@0.47.3
  - @inkeep/agents-core@0.47.3
  - @inkeep/agents-manage-mcp@0.47.3
  - @inkeep/agents-mcp@0.47.3

## 0.47.2

### Patch Changes

- c5357e5: Fixes zod stringbo
- Updated dependencies [c5357e5]
  - @inkeep/agents-manage-mcp@0.47.2
  - @inkeep/agents-core@0.47.2
  - @inkeep/agents-mcp@0.47.2
  - @inkeep/agents-work-apps@0.47.2

## 0.47.1

### Patch Changes

- Updated dependencies [6fbe785]
  - @inkeep/agents-core@0.47.1
  - @inkeep/agents-work-apps@0.47.1
  - @inkeep/agents-manage-mcp@0.47.1
  - @inkeep/agents-mcp@0.47.1

## 0.47.0

### Patch Changes

- Updated dependencies [77a45c9]
- Updated dependencies [cfee934]
  - @inkeep/agents-core@0.47.0
  - @inkeep/agents-work-apps@0.47.0
  - @inkeep/agents-manage-mcp@0.47.0
  - @inkeep/agents-mcp@0.47.0

## 0.46.1

### Patch Changes

- 7fd85b6: Refactor: Consolidate to single-phase generation

  - Removed Phase 2 infrastructure (Phase2Config.ts, phase2/ template directories, thinking-preparation.xml)
  - Moved data component templates from phase2/ to shared/ for single-phase use
  - Updated Phase1Config to handle data components inline
  - Added model recommendations docs for data components (recommend Sonnet 4+, Opus 4+, GPT-4.1/5.1/5.2, Gemini 3.0 Pro)

- Updated dependencies [f6010a1]
- Updated dependencies [07a027d]
- Updated dependencies [6139d11]
  - @inkeep/agents-core@0.46.1
  - @inkeep/agents-work-apps@0.46.1
  - @inkeep/agents-manage-mcp@0.46.1
  - @inkeep/agents-mcp@0.46.1

## 0.46.0

### Patch Changes

- 4811c97: performance imp trace
- 12ad286: - Temp fix for chat to edit
- 016d9dc: Fix internal A2A and self-referencing calls to use in-process fetch transport instead of network loopback, ensuring same-instance execution for features relying on process-local state like SSE stream registries
- Updated dependencies [4811c97]
- Updated dependencies [12ad286]
  - @inkeep/agents-core@0.46.0
  - @inkeep/agents-manage-mcp@0.46.0
  - @inkeep/agents-mcp@0.46.0
  - @inkeep/agents-work-apps@0.46.0

## 0.45.3

### Patch Changes

- bee6724: Fix cross-subdomain auth for domains that don't share a 3-part parent (e.g., app.inkeep.com + api.agents.inkeep.com)
- 16f91d0: bump `hono` to `^4.11.7` to fix pnpm audit vulnerabilities
- 632d68d: Replace custom jsonSchemaToZod implementation with Zod's native z.fromJSONSchema() method
- Updated dependencies [4a83260]
- Updated dependencies [37248c6]
- Updated dependencies [bee6724]
- Updated dependencies [16f91d0]
- Updated dependencies [632d68d]
  - @inkeep/agents-core@0.45.3
  - @inkeep/agents-work-apps@0.45.3
  - @inkeep/agents-manage-mcp@0.45.3
  - @inkeep/agents-mcp@0.45.3

## 0.45.2

### Patch Changes

- 4524c28: Trigger release
- Updated dependencies [4524c28]
  - @inkeep/agents-core@0.45.2
  - @inkeep/agents-work-apps@0.45.2
  - @inkeep/agents-manage-mcp@0.45.2
  - @inkeep/agents-mcp@0.45.2

## 0.45.1

### Patch Changes

- Updated dependencies [54b2d4c]
- Updated dependencies [21e6ae5]
  - @inkeep/agents-work-apps@0.45.1
  - @inkeep/agents-manage-mcp@0.45.1
  - @inkeep/agents-core@0.45.1
  - @inkeep/agents-mcp@0.45.1

## 0.45.0

### Patch Changes

- 0626128: adjust manage api routes
- 4f91394: add new available-agents route and authz permissions to runAuth middleware
- Updated dependencies [0ef70dd]
- Updated dependencies [938ffb8]
- Updated dependencies [4f91394]
- Updated dependencies [6f5bd15]
  - @inkeep/agents-work-apps@0.45.0
  - @inkeep/agents-core@0.45.0
  - @inkeep/agents-manage-mcp@0.45.0
  - @inkeep/agents-mcp@0.45.0

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
  - @inkeep/agents-work-apps@0.44.0
  - @inkeep/agents-manage-mcp@0.44.0
  - @inkeep/agents-mcp@0.44.0

## 0.43.0

### Patch Changes

- 57c5da1: Fix trigger HMAC signature verification to support Nango credential references for cloud deployments
- e4077a0: Remove duplicate route
- 5f432f9: stats page
- eef0a3f: new OAuth callback route
- 2f9d367: trigger fix
- 3e3a0db: unneeded code for stats
- 5ffbf6b: trigger traces
- 05a8a12: adding authorization checks and spicedb setup
- c7fa88a: Fix trigger invocation flow: correct agent lookup from Record structure, fix database client usage for conversations/messages, and improve error serialization in logs. Default workflow world to 'local' for development when WORKFLOW_TARGET_WORLD is not set.
- caad379: Add github token exchange endpoint
- 800cba5: chore(agents-api): reduce OpenAPI tags
- c145cb3: fix(agents-api): remove unused files with knip
- caefccc: improve mcp servers page loading
- 720d42f: trigger fix for vercel
- 4b3eb21: fix(agents-api): compile directories which starts with dots
- 0fff69c: Updated openapi snapshot
- 5f66967: triggers for vercel
- 8160ded: improve loading mcps in agent page
- Updated dependencies [de9bed1]
- Updated dependencies [5f432f9]
- Updated dependencies [0fff69c]
- Updated dependencies [a5ba56c]
- Updated dependencies [eef0a3f]
- Updated dependencies [2f9d367]
- Updated dependencies [3e3a0db]
- Updated dependencies [0f83405]
- Updated dependencies [5ffbf6b]
- Updated dependencies [0aa5679]
- Updated dependencies [05a8a12]
- Updated dependencies [caefccc]
- Updated dependencies [720d42f]
- Updated dependencies [31b3310]
- Updated dependencies [5f66967]
- Updated dependencies [de5f12c]
- Updated dependencies [8160ded]
- Updated dependencies [cfa81bb]
  - @inkeep/agents-core@0.43.0
  - @inkeep/agents-manage-mcp@0.43.0
  - @inkeep/agents-mcp@0.43.0

## 0.42.0

### Minor Changes

- ad01cd7: Add triggers API endpoints for CRUD operations on trigger configurations and viewing invocation history
- 0893319: Add multi-part message format for triggers: messages now include both text part (from messageTemplate) and data part (transformed payload) for richer context
- 82afd5b: Hash trigger authentication header values before storing in database using new headers array format
- 82afd5b: Update webhook handler to use async trigger authentication verification with new headers format
- a210291: Doltgres migration and evaluation system.
- ad01cd7: Add webhook endpoint for trigger invocations with support for authentication, payload validation, output transformation, and async agent execution

### Patch Changes

- 3940062: added extra prompting optionally to mcp tools
- 00fbaec: output schema filtering for evals
- b336b0e: Fix bug with agent name and description not updating
- 44461fe: trace default
- 14041da: pagination fix
- 568c1b2: added timestamp
- 9123640: feat(api): use ?raw query in tsdown
- c422f89: bug fix for user message evals
- 4c65924: process attributes removed
- b241c06: vercel workflow
- 3e656cd: simple refactor to reorder models
- 2d0d77a: Add ability to edit name and description from agent card
- dc827b0: improve context breakdown
- fabca13: add lint script for run-api and fix lint errors
- Updated dependencies [3940062]
- Updated dependencies [00fbaec]
- Updated dependencies [91dad33]
- Updated dependencies [44461fe]
- Updated dependencies [4f7f0d2]
- Updated dependencies [14041da]
- Updated dependencies [568c1b2]
- Updated dependencies [c422f89]
- Updated dependencies [a210291]
- Updated dependencies [4c65924]
- Updated dependencies [b241c06]
- Updated dependencies [3e656cd]
- Updated dependencies [0893319]
- Updated dependencies [ad01cd7]
- Updated dependencies [dc827b0]
- Updated dependencies [82afd5b]
- Updated dependencies [82afd5b]
  - @inkeep/agents-core@0.42.0
  - @inkeep/agents-manage-mcp@0.42.0
