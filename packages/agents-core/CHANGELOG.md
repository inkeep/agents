# @inkeep/agents-core

## 0.48.1

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

- f981006: Unwrap generic Vercel AI SDK errors (e.g., "fetch failed") to surface root cause in logs and traces
- e11fae9: Fix props field type in data components to be non-null and improve type safety with JsonSchemaForLlmSchemaType
- 228d4e2: Fix nested error message display in form validation

  - Add `firstNestedMessage` helper to recursively extract error messages from nested Zod validation objects
  - Display error path location (e.g., `→ at ["foo", "bar"]`) for deeply nested validation errors
  - Refactor `createCustomHeadersSchema` to use Zod `.pipe()` for cleaner error path propagation
  - Rename `HeadersSchema` to `StringRecordSchema` for broader applicability

- 7ad7e21: Refactor artifact and data component validation to use centralized Zod schemas from agents-core. This eliminates duplicate validation logic and improves consistency across the codebase.
- 95a3abc: Add scheduled/cron trigger support across the full stack — database schema, API routes, Manage UI

## 0.47.5

## 0.47.4

### Patch Changes

- 83346fc: Retry/rerun functionality for webhook triggers in the traces UI
- 5f3f5ea: Add keepAlive config to db connections

## 0.47.3

### Patch Changes

- 756a560: Consolidate `ResourceId` as reusable OpenAPI component to reduce spec size
- 045c405: add TOOL_APPROVAL_REASON to span keys

## 0.47.2

### Patch Changes

- c5357e5: Fixes zod stringbo

## 0.47.1

### Patch Changes

- 6fbe785: Fixes spicedb for docker

## 0.47.0

### Minor Changes

- 77a45c9: Implements SPICEDB_TLS_ENABLED
- cfee934: fixes the spicedb type exports

## 0.46.1

### Patch Changes

- f6010a1: Add `HeadersSchema` export for HTTP header validation and remove unused client exports.
- 07a027d: Add Claude Opus 4.6 to available model constants

## 0.46.0

### Patch Changes

- 4811c97: performance imp trace
- 12ad286: - Temp fix for chat to edit

## 0.45.3

### Patch Changes

- 4a83260: Add custom headers validation in playground chat. Users are now notified when custom headers are invalid or required based on the agent's headers schema configuration.
- bee6724: Fix cross-subdomain auth for domains that don't share a 3-part parent (e.g., app.inkeep.com + api.agents.inkeep.com)
- 16f91d0: bump `hono` to `^4.11.7` to fix pnpm audit vulnerabilities
- 632d68d: Replace custom jsonSchemaToZod implementation with Zod's native z.fromJSONSchema() method

## 0.45.2

### Patch Changes

- 4524c28: Trigger release

## 0.45.1

### Patch Changes

- 21e6ae5: bump zod to latest 4.3.6 and fix `.omit() cannot be used on object schemas containing refinements` error

## 0.45.0

### Patch Changes

- 938ffb8: Revert refine method in resource id schema
- 4f91394: add new available-agents route and authz permissions to runAuth middleware
- 6f5bd15: Add CI check for env.ts descriptions

## 0.44.0

### Minor Changes

- 08aa941: Add GitHub app management functionality
- ba853ef: disallow resource id schema for value `new`

### Patch Changes

- 5bb2da2: fix(agents-core): add AST validation for function tools `executeCode`
- 8a283ea: Fix tool relations when renaming sub-agent IDs
- bcc26b4: Add descriptions to environment variable schemas for better developer experience

## 0.43.0

### Minor Changes

- de9bed1: Replace deprecated keytar package with @napi-rs/keyring for native keychain integration
- a5ba56c: BREAKING: Replace hardcoded webhook signature verification with flexible, provider-agnostic configuration

  This major version removes the legacy `signingSecret` field from triggers and replaces it with a flexible signature verification system that supports GitHub, Slack, Stripe, Zendesk, and other webhook providers.

  **Breaking Changes:**

  - Removed `signingSecret` column from triggers table (database migration required)
  - Removed `signingSecret` parameter from TriggerInsertSchema, TriggerUpdateSchema, and TriggerApiInsert
  - Removed `verifySigningSecret()` function from trigger-auth.ts
  - Triggers now require `signingSecretCredentialReferenceId` and `signatureVerification` configuration for signature verification

  **New Features:**

  - Added `SignatureVerificationConfig` type supporting:
    - Multiple HMAC algorithms: sha256, sha512, sha384, sha1, md5
    - Multiple encodings: hex, base64
    - Flexible signature extraction from headers, query parameters, or body
    - Multi-component signing with configurable separators
    - Regex extraction for complex signature formats
    - Advanced validation options (case sensitivity, empty body handling, Unicode normalization)
  - Added `verifySignatureWithConfig()` function with timing-safe signature comparison
  - Added validation utilities: `validateJMESPath()`, `validateRegex()`
  - Added comprehensive unit tests and integration tests
  - Added credential resolution with 5-minute caching in TriggerService

  **Migration Guide:**

  Before (deprecated):

  ```typescript
  const trigger = {
    signingSecret: "my-secret",
  };
  ```

  After:

  ```typescript
  const trigger = {
    signingSecretCredentialReferenceId: "credential-ref-id",
    signatureVerification: {
      algorithm: "sha256",
      encoding: "hex",
      signature: {
        source: "header",
        key: "X-Hub-Signature-256",
        prefix: "sha256=",
      },
      signedComponents: [{ source: "body", required: true }],
      componentJoin: { strategy: "concatenate", separator: "" },
    },
  };
  ```

  See SDK documentation for complete examples for GitHub, Slack, Stripe, and Zendesk webhooks.

### Patch Changes

- 5f432f9: stats page
- 0fff69c: Centralized jmes validation
- eef0a3f: new OAuth callback route
- 2f9d367: trigger fix
- 3e3a0db: unneeded code for stats
- 0f83405: Fix trigger message template removal not working from UI
- 5ffbf6b: trigger traces
- 0aa5679: fix: preserve triggers when not included in fullAgent update

  The fullAgent update endpoint now only deletes orphaned triggers when the triggers field is explicitly provided. This prevents triggers from being deleted when saving an agent from the UI (which doesn't manage triggers via this endpoint). The SDK now always includes triggers in agent serialization to ensure proper sync behavior.

- 05a8a12: adding authorization checks and spicedb setup
- caefccc: improve mcp servers page loading
- 720d42f: trigger fix for vercel
- 31b3310: Migrate fk to varchar in manage schema
- 5f66967: triggers for vercel
- 8160ded: improve loading mcps in agent page
- cfa81bb: fix(agents-core): avoid calling 2 times `getCredentialReference` or `getUserScopedCredentialReference`

## 0.42.0

### Minor Changes

- a210291: Doltgres migration and evaluation system.
- 0893319: Make trigger messageTemplate optional in schema and validation to support data-only trigger messages
- ad01cd7: Add triggers feature with new database schemas for trigger configuration and invocation tracking, data access functions, validation schemas, and authentication utilities
- 82afd5b: Simplify trigger authentication schema to use headers array format with hashed secrets. Add hashTriggerHeaderValue(), validateTriggerHeaderValue(), and hashAuthenticationHeaders() utilities. Breaking change: old auth types (api_key, basic_auth, bearer_token) removed.

### Patch Changes

- 3940062: added extra prompting optionally to mcp tools
- 00fbaec: output schema filtering for evals
- 91dad33: Removed `FIELD_MODIFIERS` and related logic from `drizzle-schema-helpers.ts`, simplifying schema creation functions.
- 44461fe: trace default
- 4f7f0d2: Cleanup orphaned function-tools during agent update
- 14041da: pagination fix
- 568c1b2: added timestamp
- c422f89: bug fix for user message evals
- 4c65924: process attributes removed
- b241c06: vercel workflow
- 3e656cd: simple refactor to reorder models
- dc827b0: improve context breakdown
- 82afd5b: Add keepExisting support for trigger authentication header updates

## 0.41.2

### Patch Changes

- 112b5c7: Add --local flag to inkeep init to set local profile as default
- de84714: Add tsdown `clean` option based on watch status
- af347c8: Add `dev` watch scripts and skip `d.ts` generation in watch mode across packages
- 2e86062: warning status messages

## 0.41.1

### Patch Changes

- d1f60f3: added azure provider

## 0.41.0

### Patch Changes

- 49ec561: fix auth dependencies
- 5d095da: Properly contain overflow of trace card content
- f1a6cd4: compression ui improvements
- 561605f: Export DEFAULT_NANGO_STORE_ID from @inkeep/agents-core main exports
- 4b016d4: target ids for chat-to-edit
- d933953: Disable colorized logs in non-TTY environments like Vercel. Logs now respect the NO_COLOR env var and automatically disable colors when stdout is not a TTY.
- 9b17c81: streamObject removed from traces
- f58f9e4: Fix cookie header forwarding for MCP server authentication

## 0.40.0

### Minor Changes

- e5172e2: remove unused dependencies, lint unused dependencies with Knip
- 178d5b1: keep file structure for build `dist` directory

### Patch Changes

- be0131e: user info for spans
- 8b95949: context tracking in traces
- b2c2fd9: fix trace viewer panes to scroll independently
- b231869: set `compilerOptions.verbatimModuleSyntax: true` in all `tsconfig.json` files
- 153d4e5: Added Conversation COmpression

## 0.39.5

### Patch Changes

- d13e4c2: Fix quickstart
- 9e4deda: Added dynamic model context limit checks

## 0.39.4

### Patch Changes

- fcb3adc: added gemini 3 flash
- 9403533: improve mcp connect for chat to edit

## 0.39.3

### Patch Changes

- eba0e6b: Increase default page size to 100 (API max) for all list endpoints to show more resources without full pagination
- a3b79b2: adjust auth settings
- 2b156b6: migrate from tsup to tsdown
- 9afba48: fix: resolve create-agents test mock issue with node:util and node:child_process module paths
- 68ef774: Add x-speakeasy-pagination extension to all paginated list endpoints for Speakeasy SDK native pagination support

## 0.39.2

### Patch Changes

- 0f2b040: added backup parser

## 0.39.1

### Patch Changes

- cbb7c09: batch flushing
- 00be449: found bug in system prpomt
- 71a83d0: improve redirect logic and better-auth session use

## 0.39.0

### Minor Changes

- f76e412: Add device_code table for CLI device authentication flow

### Patch Changes

- f76e412: Add InkeepTelemetryProvider for observability and tracing
- f76e412: Add CI/CD support for headless operation with INKEEP_API_KEY and environment variable overrides
- f76e412: Add --all flag to push/pull for batch project operations and --tag for tagged config files
- f76e412: Enhance init command with cloud onboarding wizard (scaffolds projects from remote tenant)
- f76e412: Add profile management system for multi-remote support (profile list/add/use/current/remove)
- f76e412: Wire profiles into push/pull commands with --profile and --quiet flags
- f76e412: Add CLI authentication commands (login, logout, status, whoami) with device code OAuth flow
- f76e412: Add /api/cli/me endpoint for CLI user authentication
- f76e412: Add InkeepCredentialProvider abstraction for credential management
- f76e412: Add device authorization page for CLI OAuth flow

## 0.38.3

## 0.38.2

### Patch Changes

- 907fb8f: updated models to have gpt-5-2

## 0.38.1

### Patch Changes

- 32c4c34: improve ux for scoped credentials
- 8c81242: ui for tool breakdown and warnings for tool calls
- 251cecd: added mid generation compression
- ce60f56: multi tenant auth for signoz queries

## 0.38.0

### Minor Changes

- 515d808: Upgrade to Vercel AI SDK v6 beta

### Patch Changes

- b69b814: fix biome warnings
- 8114afc: Update to open id connect for release action
- bcee35f: add requiredToFetch on fetch definitions
- a46303b: fix blue dot appears on inverted delegation on top left corner, refactor retrieving relationshipId in agents-core
- 4801d35: status messages for traces shown
- f791c6d: updated artifact handlin
- f1f68cf: new models
- 6dcb6b7: fix signoz for vercel
- b3e49d9: updated schemas
- 5fbd137: fix `Module not found: Can't resolve '../build/Release/keytar.node'` in dashboard, ignore `keytar` from bundling with `webpackIgnore` comment
- 31be157: cloud deployment does not have signoz links
- fcbf008: add creator to mcp server name

## 0.37.2

### Patch Changes

- 78163b1: mcp hard fail
- f47e391: Use hono zod in run and manage packages
- 1f77578: Fix broken tests: mcpTool.with() returns undefined for empty selectedTools, update agentFull test canUse structure, fix projectFull dataComponents props schema

## 0.37.1

### Patch Changes

- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- e07c709: Add Cursor command for creating PRs with changeset validation
- c3c0ac4: dependency updates
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default

## 0.37.0

### Minor Changes

- 45471ab: Implement temporary API key authentication for playground with session-based auth

### Patch Changes

- 56e1b4d: make zod and hono zod internal deps
- 45471ab: Fix error messages to show proper 403 access denied instead of generic internal server error

## 0.36.1

### Patch Changes

- 1235b18: improve cors policy

## 0.36.0

## 0.35.12

### Patch Changes

- 840ca11: remove clean-package from API packages - was stripping runtime dependencies causing production errors

## 0.35.11

## 0.35.10

### Patch Changes

- 7a7e726: handle next*public* for vercel

## 0.35.9

### Patch Changes

- 18c036d: fix better-auth type

## 0.35.8

### Patch Changes

- 986dad2: update better-auth

## 0.35.7

## 0.35.6

### Patch Changes

- 31dbacc: handle google sign in

## 0.35.5

### Patch Changes

- 15b564d: make inkeep mcp and docker optional in the quickstart

## 0.35.4

### Patch Changes

- e297579: pull third party mcp servers

## 0.35.3

### Patch Changes

- 89e8c26: cleaned stale components with inkeep pull

## 0.35.2

### Patch Changes

- 769d8a9: fix agents-core exports

## 0.35.1

## 0.35.0

### Minor Changes

- 0d46d32: Adding auth to the framework

### Patch Changes

- f9a208a: Check for CLI installation in quickstart

## 0.34.1

### Patch Changes

- 699043d: Install inkeep mcp in quickstarte
- e4b5d5c: Inkeep add: usage instructions and target path detection

## 0.34.0

### Patch Changes

- 7426927: add cli installation to quickstart
- 015f9f7: Status Update Model fixed
- bdeee9b: quickstart skip cli install option
- 2434d22: add error handling to github fetch
- af95c9a: added provider config

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
