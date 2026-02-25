# @inkeep/agents-sdk

## 0.53.3

### Patch Changes

- Updated dependencies [f7e47ab]
  - @inkeep/agents-core@0.53.3

## 0.53.2

### Patch Changes

- @inkeep/agents-core@0.53.2

## 0.53.1

### Patch Changes

- Updated dependencies [75fbceb]
  - @inkeep/agents-core@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [0a0cb6e]
  - @inkeep/agents-core@0.53.0

## 0.52.0

### Patch Changes

- Updated dependencies [886b2da]
- Updated dependencies [eea5f0a]
- Updated dependencies [65f71b5]
  - @inkeep/agents-core@0.52.0

## 0.51.0

### Patch Changes

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

- Updated dependencies [2005b87]
- Updated dependencies [d50fa44]
  - @inkeep/agents-core@0.50.3

## 0.50.2

### Patch Changes

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

### Patch Changes

- @inkeep/agents-core@0.50.0

## 0.49.0

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

- @inkeep/agents-core@0.48.5

## 0.48.4

### Patch Changes

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

- @inkeep/agents-core@0.48.1

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

- e11fae9: Fix props field type in data components to be non-null and improve type safety with JsonSchemaForLlmSchemaType
- 95a3abc: Add scheduled/cron trigger support across the full stack — database schema, API routes, Manage UI
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

- Updated dependencies [4a83260]
- Updated dependencies [bee6724]
- Updated dependencies [16f91d0]
- Updated dependencies [632d68d]
  - @inkeep/agents-core@0.45.3

## 0.45.2

### Patch Changes

- 4524c28: Trigger release
- Updated dependencies [4524c28]
  - @inkeep/agents-core@0.45.2

## 0.45.1

### Patch Changes

- 21e6ae5: bump zod to latest 4.3.6 and fix `.omit() cannot be used on object schemas containing refinements` error
- Updated dependencies [21e6ae5]
  - @inkeep/agents-core@0.45.1

## 0.45.0

### Patch Changes

- Updated dependencies [938ffb8]
- Updated dependencies [4f91394]
- Updated dependencies [6f5bd15]
  - @inkeep/agents-core@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [08aa941]
- Updated dependencies [5bb2da2]
- Updated dependencies [8a283ea]
- Updated dependencies [bcc26b4]
- Updated dependencies [ba853ef]
  - @inkeep/agents-core@0.44.0

## 0.43.0

### Minor Changes

- de9bed1: Replace deprecated keytar package with @napi-rs/keyring for native keychain integration
- a5ba56c: BREAKING: Replace hardcoded webhook signature verification with flexible, provider-agnostic configuration

  This major version removes the legacy `signingSecret` parameter from the `trigger()` builder function and replaces it with a flexible signature verification system.

  **Breaking Changes:**

  - Removed `signingSecret` parameter from `trigger()` builder function
  - Triggers now require `signingSecretCredentialReference` and `signatureVerification` configuration for signature verification

  **New Features:**

  - Added `signatureVerification` parameter to `trigger()` with validation
  - Exported `SignatureVerificationConfig`, `SignatureSource`, and `SignedComponent` types
  - Added validation at trigger creation time for JMESPath and regex patterns
  - Added comprehensive JSDoc documentation with examples for GitHub, Slack, Stripe, and Zendesk

  **Migration Guide:**

  Before (deprecated):

  ```typescript
  export const webhook = trigger({
    id: "my-webhook",
    signingSecret: "my-secret", // ❌ No longer supported
  });
  ```

  After:

  ```typescript
  export const webhook = trigger({
    id: "my-webhook",
    signingSecretCredentialReference: credentialReference({
      id: "webhook-secret",
    }),
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
  });
  ```

  See README.md for complete configuration reference and provider-specific examples.

### Patch Changes

- 5f432f9: stats page
- 2f9d367: trigger fix
- 3e3a0db: unneeded code for stats
- 5ffbf6b: trigger traces
- 0aa5679: fix: preserve triggers when not included in fullAgent update

  The fullAgent update endpoint now only deletes orphaned triggers when the triggers field is explicitly provided. This prevents triggers from being deleted when saving an agent from the UI (which doesn't manage triggers via this endpoint). The SDK now always includes triggers in agent serialization to ensure proper sync behavior.

- 05a8a12: adding authorization checks and spicedb setup
- 720d42f: trigger fix for vercel
- 5f66967: triggers for vercel
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
- Updated dependencies [8160ded]
- Updated dependencies [cfa81bb]
  - @inkeep/agents-core@0.43.0

## 0.42.0

### Minor Changes

- 82afd5b: Update trigger builder documentation to reflect new headers array authentication format
- a210291: Doltgres migration and evaluation system.

### Patch Changes

- 3940062: added extra prompting optionally to mcp tools
- 00fbaec: output schema filtering for evals
- 44461fe: trace default
- 14041da: pagination fix
- 568c1b2: added timestamp
- c422f89: bug fix for user message evals
- 4c65924: process attributes removed
- b241c06: vercel workflow
- 3e656cd: simple refactor to reorder models
- a1126c1: enable `d.ts` files generation for `dev` script and set `"isolatedDeclarations": true` in `tsconfig.json`
- dc827b0: improve context breakdown
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

## 0.41.2

### Patch Changes

- 112b5c7: Add --local flag to inkeep init to set local profile as default
- de84714: Add tsdown `clean` option based on watch status
- af347c8: Add `dev` watch scripts and skip `d.ts` generation in watch mode across packages
- 2e86062: warning status messages
- Updated dependencies [112b5c7]
- Updated dependencies [de84714]
- Updated dependencies [af347c8]
- Updated dependencies [2e86062]
  - @inkeep/agents-core@0.41.2

## 0.41.1

### Patch Changes

- d1f60f3: added azure provider
- Updated dependencies [d1f60f3]
  - @inkeep/agents-core@0.41.1

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
- Updated dependencies [49ec561]
- Updated dependencies [5d095da]
- Updated dependencies [f1a6cd4]
- Updated dependencies [561605f]
- Updated dependencies [4b016d4]
- Updated dependencies [d933953]
- Updated dependencies [9b17c81]
- Updated dependencies [f58f9e4]
  - @inkeep/agents-core@0.41.0

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
- Updated dependencies [be0131e]
- Updated dependencies [e5172e2]
- Updated dependencies [8b95949]
- Updated dependencies [b2c2fd9]
- Updated dependencies [b231869]
- Updated dependencies [178d5b1]
- Updated dependencies [153d4e5]
  - @inkeep/agents-core@0.40.0

## 0.39.5

### Patch Changes

- d13e4c2: Fix quickstart
- 9e4deda: Added dynamic model context limit checks
- Updated dependencies [d13e4c2]
- Updated dependencies [9e4deda]
  - @inkeep/agents-core@0.39.5

## 0.39.4

### Patch Changes

- fcb3adc: added gemini 3 flash
- Updated dependencies [fcb3adc]
- Updated dependencies [9403533]
  - @inkeep/agents-core@0.39.4

## 0.39.3

### Patch Changes

- eba0e6b: Increase default page size to 100 (API max) for all list endpoints to show more resources without full pagination
- 2b156b6: migrate from tsup to tsdown
- 9afba48: fix: resolve create-agents test mock issue with node:util and node:child_process module paths
- 68ef774: Add x-speakeasy-pagination extension to all paginated list endpoints for Speakeasy SDK native pagination support
- Updated dependencies [eba0e6b]
- Updated dependencies [a3b79b2]
- Updated dependencies [2b156b6]
- Updated dependencies [9afba48]
- Updated dependencies [68ef774]
  - @inkeep/agents-core@0.39.3

## 0.39.2

### Patch Changes

- 0f2b040: added backup parser
- Updated dependencies [0f2b040]
  - @inkeep/agents-core@0.39.2

## 0.39.1

### Patch Changes

- cbb7c09: batch flushing
- 00be449: found bug in system prpomt
- Updated dependencies [cbb7c09]
- Updated dependencies [00be449]
- Updated dependencies [71a83d0]
  - @inkeep/agents-core@0.39.1

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
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
- Updated dependencies [f76e412]
  - @inkeep/agents-core@0.39.0

## 0.38.3

### Patch Changes

- @inkeep/agents-core@0.38.3

## 0.38.2

### Patch Changes

- 907fb8f: updated models to have gpt-5-2
- Updated dependencies [907fb8f]
  - @inkeep/agents-core@0.38.2

## 0.38.1

### Patch Changes

- 8c81242: ui for tool breakdown and warnings for tool calls
- 251cecd: added mid generation compression
- ce60f56: multi tenant auth for signoz queries
- Updated dependencies [32c4c34]
- Updated dependencies [8c81242]
- Updated dependencies [251cecd]
- Updated dependencies [ce60f56]
  - @inkeep/agents-core@0.38.1

## 0.38.0

### Minor Changes

- 515d808: Upgrade to Vercel AI SDK v6 beta

### Patch Changes

- b69b814: fix biome warnings
- 8114afc: Update to open id connect for release action
- bcee35f: add requiredToFetch on fetch definitions
- 4801d35: status messages for traces shown
- f791c6d: updated artifact handlin
- f1f68cf: new models
- 6dcb6b7: fix signoz for vercel
- b3e49d9: updated schemas
- 31be157: cloud deployment does not have signoz links
- Updated dependencies [b69b814]
- Updated dependencies [8114afc]
- Updated dependencies [515d808]
- Updated dependencies [bcee35f]
- Updated dependencies [a46303b]
- Updated dependencies [4801d35]
- Updated dependencies [f791c6d]
- Updated dependencies [f1f68cf]
- Updated dependencies [6dcb6b7]
- Updated dependencies [b3e49d9]
- Updated dependencies [5fbd137]
- Updated dependencies [31be157]
- Updated dependencies [fcbf008]
  - @inkeep/agents-core@0.38.0

## 0.37.2

### Patch Changes

- 78163b1: mcp hard fail
- f47e391: Use hono zod in run and manage packages
- 1f77578: Fix broken tests: mcpTool.with() returns undefined for empty selectedTools, update agentFull test canUse structure, fix projectFull dataComponents props schema
- Updated dependencies [78163b1]
- Updated dependencies [f47e391]
- Updated dependencies [1f77578]
  - @inkeep/agents-core@0.37.2

## 0.37.1

### Patch Changes

- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- e07c709: Add Cursor command for creating PRs with changeset validation
- c3c0ac4: dependency updates
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default
- Updated dependencies [505749a]
- Updated dependencies [7f1b78a]
- Updated dependencies [e07c709]
- Updated dependencies [c3c0ac4]
- Updated dependencies [fbf0d97]
  - @inkeep/agents-core@0.37.1

## 0.37.0

### Minor Changes

- 45471ab: Implement temporary API key authentication for playground with session-based auth

### Patch Changes

- 56e1b4d: make zod and hono zod internal deps
- 45471ab: Fix error messages to show proper 403 access denied instead of generic internal server error
- Updated dependencies [45471ab]
- Updated dependencies [56e1b4d]
- Updated dependencies [45471ab]
  - @inkeep/agents-core@0.37.0

## 0.36.1

### Patch Changes

- Updated dependencies [1235b18]
  - @inkeep/agents-core@0.36.1

## 0.36.0

### Patch Changes

- @inkeep/agents-core@0.36.0

## 0.35.12

### Patch Changes

- 840ca11: remove clean-package from API packages - was stripping runtime dependencies causing production errors
- Updated dependencies [840ca11]
  - @inkeep/agents-core@0.35.12

## 0.35.11

### Patch Changes

- @inkeep/agents-core@0.35.11

## 0.35.10

### Patch Changes

- Updated dependencies [7a7e726]
  - @inkeep/agents-core@0.35.10

## 0.35.9

### Patch Changes

- Updated dependencies [18c036d]
  - @inkeep/agents-core@0.35.9

## 0.35.8

### Patch Changes

- Updated dependencies [986dad2]
  - @inkeep/agents-core@0.35.8

## 0.35.7

### Patch Changes

- @inkeep/agents-core@0.35.7

## 0.35.6

### Patch Changes

- Updated dependencies [31dbacc]
  - @inkeep/agents-core@0.35.6

## 0.35.5

### Patch Changes

- 15b564d: make inkeep mcp and docker optional in the quickstart
- Updated dependencies [15b564d]
  - @inkeep/agents-core@0.35.5

## 0.35.4

### Patch Changes

- Updated dependencies [e297579]
  - @inkeep/agents-core@0.35.4

## 0.35.3

### Patch Changes

- 89e8c26: cleaned stale components with inkeep pull
- Updated dependencies [89e8c26]
  - @inkeep/agents-core@0.35.3

## 0.35.2

### Patch Changes

- Updated dependencies [769d8a9]
  - @inkeep/agents-core@0.35.2

## 0.35.1

### Patch Changes

- @inkeep/agents-core@0.35.1

## 0.35.0

### Minor Changes

- 0d46d32: Adding auth to the framework

### Patch Changes

- f9a208a: Check for CLI installation in quickstart
- Updated dependencies [f9a208a]
- Updated dependencies [0d46d32]
  - @inkeep/agents-core@0.35.0

## 0.34.1

### Patch Changes

- 699043d: Install inkeep mcp in quickstarte
- e4b5d5c: Inkeep add: usage instructions and target path detection
- Updated dependencies [699043d]
- Updated dependencies [e4b5d5c]
  - @inkeep/agents-core@0.34.1

## 0.34.0

### Patch Changes

- 7426927: add cli installation to quickstart
- 015f9f7: Status Update Model fixed
- bdeee9b: quickstart skip cli install option
- 2434d22: add error handling to github fetch
- af95c9a: added provider config
- Updated dependencies [7426927]
- Updated dependencies [015f9f7]
- Updated dependencies [bdeee9b]
- Updated dependencies [2434d22]
- Updated dependencies [af95c9a]
  - @inkeep/agents-core@0.34.0

## 0.33.3

### Patch Changes

- d957766: updated docs and model pointing
- 9ab5e8b: fix template rendering of '-'
- 3294024: bad schema
- 8bfac58: ADded new models
- 7eafb29: updated agent docs and directory aware inkeep pull
- 7b2db47: added new models
- Updated dependencies [d957766]
- Updated dependencies [9ab5e8b]
- Updated dependencies [3294024]
- Updated dependencies [cd916ee]
- Updated dependencies [8bfac58]
- Updated dependencies [7eafb29]
- Updated dependencies [7b2db47]
  - @inkeep/agents-core@0.33.3

## 0.33.2

### Patch Changes

- 4b2fd62: tool history perserved
- Updated dependencies [4b2fd62]
- Updated dependencies [bbbed5e]
  - @inkeep/agents-core@0.33.2

## 0.33.1

### Patch Changes

- 98f139a: Updated agent cil
- Updated dependencies [98f139a]
  - @inkeep/agents-core@0.33.1

## 0.33.0

### Minor Changes

- b89cbd1: bump next.js to 16, react to 19.2.0

### Patch Changes

- d95a9de: enable Biome noUselessElse rule
- Updated dependencies [b89cbd1]
- Updated dependencies [d2fa856]
- Updated dependencies [d95a9de]
  - @inkeep/agents-core@0.33.0

## 0.32.2

### Patch Changes

- c228770: update create-agents setup script
- Updated dependencies [c228770]
  - @inkeep/agents-core@0.32.2

## 0.32.1

### Patch Changes

- 5bd3d93: update dev deps agent-core
- Updated dependencies [5bd3d93]
  - @inkeep/agents-core@0.32.1

## 0.32.0

### Minor Changes

- a262e1e: postgres migration

### Patch Changes

- cb75c9c: bug fix for pages in traces
- Updated dependencies [185db71]
- Updated dependencies [8d8b6dd]
- Updated dependencies [a262e1e]
- Updated dependencies [cb75c9c]
  - @inkeep/agents-core@0.32.0

## 0.31.7

### Patch Changes

- 5e45a98: added coherent context
- Updated dependencies [5e45a98]
  - @inkeep/agents-core@0.31.7

## 0.31.6

### Patch Changes

- @inkeep/agents-core@0.31.6

## 0.31.5

### Patch Changes

- @inkeep/agents-core@0.31.5

## 0.31.4

### Patch Changes

- 02d6839: optimize queries
- Updated dependencies [02d6839]
  - @inkeep/agents-core@0.31.4

## 0.31.3

### Patch Changes

- f91281b: use forked mcp sdk
- Updated dependencies [f91281b]
  - @inkeep/agents-core@0.31.3

## 0.31.2

### Patch Changes

- 2b515de: added ability to pull without project flag
- Updated dependencies [2b515de]
  - @inkeep/agents-core@0.31.2

## 0.31.1

### Patch Changes

- e81022d: hierarchical timeline
- Updated dependencies [e81022d]
  - @inkeep/agents-core@0.31.1

## 0.31.0

### Patch Changes

- eadc8f8: update agents-cli a bit
- 48a3e3e: fields for copy trace
- b98fd0a: test agents
- Updated dependencies [eadc8f8]
- Updated dependencies [48a3e3e]
- Updated dependencies [b98fd0a]
  - @inkeep/agents-core@0.31.0

## 0.30.4

### Patch Changes

- 26b89c6: upgrade quickstart packages
- 4a73629: remove ai sdk provider input
- Updated dependencies [26b89c6]
- Updated dependencies [4a73629]
  - @inkeep/agents-core@0.30.4

## 0.30.3

### Patch Changes

- 73569ce: agent name and id fixes
- Updated dependencies [73569ce]
  - @inkeep/agents-core@0.30.3

## 0.30.2

### Patch Changes

- 09ac1b4: update sdk provider
- Updated dependencies [09ac1b4]
  - @inkeep/agents-core@0.30.2

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
  - @inkeep/agents-core@0.30.1

## 0.30.0

### Minor Changes

- 94fe795: Move templates into monorepo

### Patch Changes

- e95f0d3: Updated inkeep pull significantly
- Updated dependencies [e95f0d3]
- Updated dependencies [94fe795]
  - @inkeep/agents-core@0.30.0

## 0.29.11

### Patch Changes

- dba5a31: Update quickstart port check
- b0817aa: Fix CLI bugs

  - Quickstart inkeep.config.ts indents and types
  - inkeep init run API and manage API urls

- Updated dependencies [dba5a31]
- Updated dependencies [b0817aa]
  - @inkeep/agents-core@0.29.11

## 0.29.10

### Patch Changes

- Updated dependencies [0663c46]
  - @inkeep/agents-core@0.29.10

## 0.29.9

### Patch Changes

- @inkeep/agents-core@0.29.9

## 0.29.8

### Patch Changes

- 30519fc: cli: fix `error: "[object Object]"`
  - @inkeep/agents-core@0.29.8

## 0.29.7

### Patch Changes

- @inkeep/agents-core@0.29.7

## 0.29.6

### Patch Changes

- 6c52cc6: unknown tenant bug fix
- Updated dependencies [6c52cc6]
  - @inkeep/agents-core@0.29.6

## 0.29.5

### Patch Changes

- Updated dependencies [767d466]
  - @inkeep/agents-core@0.29.5

## 0.29.4

### Patch Changes

- 533fa81: StopWhen agent config fix
- Updated dependencies [533fa81]
  - @inkeep/agents-core@0.29.4

## 0.29.3

### Patch Changes

- d26c5a4: team agent update bug fix
- Updated dependencies [d26c5a4]
  - @inkeep/agents-core@0.29.3

## 0.29.2

### Patch Changes

- @inkeep/agents-core@0.29.2

## 0.29.1

### Patch Changes

- f2ac869: upgrade docs
- 65f4b1a: remove builtin time variables from context
- Updated dependencies [f2ac869]
- Updated dependencies [37e50a6]
- Updated dependencies [65f4b1a]
  - @inkeep/agents-core@0.29.1

## 0.29.0

### Minor Changes

- 38db07a: require name for credentials

### Patch Changes

- Updated dependencies [38db07a]
  - @inkeep/agents-core@0.29.0

## 0.28.0

### Patch Changes

- 74a4d0b: trace filter is all agents for default
- b4e878d: Allow pushing component render
- 96c499d: reject invalid chars in quickstart
- 074e076: mcp evironment settings
- Updated dependencies [74a4d0b]
- Updated dependencies [b4e878d]
- Updated dependencies [96c499d]
- Updated dependencies [074e076]
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

## 0.26.2

### Patch Changes

- 3c5c183: activity-planner default
- 8a637b5: updated inkeep pull to have fiel validation
- Updated dependencies [3c5c183]
- Updated dependencies [8a637b5]
  - @inkeep/agents-core@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [4e3cb6a]
  - @inkeep/agents-core@0.26.1

## 0.26.0

### Patch Changes

- @inkeep/agents-core@0.26.0

## 0.25.0

### Minor Changes

- 51c157e: External agents project scoped

### Patch Changes

- Updated dependencies [51c157e]
  - @inkeep/agents-core@0.25.0

## 0.24.2

### Patch Changes

- 3ad959e: initialize git in quickstart
- 7d8fcb6: cli add mcp support
- 6699b4b: - Revert revert and fix id gen
- Updated dependencies [3ad959e]
- Updated dependencies [7d8fcb6]
- Updated dependencies [6699b4b]
  - @inkeep/agents-core@0.24.2

## 0.24.1

### Patch Changes

- 212fa9e: revert back to nanoid
- Updated dependencies [212fa9e]
  - @inkeep/agents-core@0.24.1

## 0.24.0

### Patch Changes

- 317efb7: use generateId everywhere
- Updated dependencies [317efb7]
- Updated dependencies [be54574]
  - @inkeep/agents-core@0.24.0

## 0.23.5

### Patch Changes

- 42d2dac: ui trace improvements
- Updated dependencies [42d2dac]
  - @inkeep/agents-core@0.23.5

## 0.23.4

### Patch Changes

- dba9591: Migrate CLI to @clack/prompts for improved interactive experience
- Updated dependencies [dba9591]
  - @inkeep/agents-core@0.23.4

## 0.23.3

### Patch Changes

- 2fad1cf: Fixed id collisions to just have variable names matter
- Updated dependencies [2fad1cf]
  - @inkeep/agents-core@0.23.3

## 0.23.2

### Patch Changes

- a3bea34: batch generate llm pull
- Updated dependencies [a3bea34]
  - @inkeep/agents-core@0.23.2

## 0.23.1

### Patch Changes

- @inkeep/agents-core@0.23.1

## 0.23.0

### Patch Changes

- e604038: Updated Pull to support other providers
- Updated dependencies [f878545]
- Updated dependencies [e604038]
  - @inkeep/agents-core@0.23.0

## 0.22.12

### Patch Changes

- 79b1e87: fixed deadlinks
- Updated dependencies [79b1e87]
  - @inkeep/agents-core@0.22.12

## 0.22.11

### Patch Changes

- 1088fb1: Remove inkeep chat command
- Updated dependencies [1088fb1]
  - @inkeep/agents-core@0.22.11

## 0.22.9

### Patch Changes

- @inkeep/agents-core@0.22.9

## 0.22.8

### Patch Changes

- @inkeep/agents-core@0.22.8

## 0.22.7

### Patch Changes

- 550d251: updated inkeep pull :)
- Updated dependencies [550d251]
  - @inkeep/agents-core@0.22.7

## 0.22.6

### Patch Changes

- 28018a0: mcp tool error handling
- Updated dependencies [28018a0]
  - @inkeep/agents-core@0.22.6

## 0.22.5

### Patch Changes

- e5fb3a4: windows quickstart support
- Updated dependencies [e5fb3a4]
  - @inkeep/agents-core@0.22.5

## 0.22.4

### Patch Changes

- e8ba7de: Add background version check to push and pull commands
- 0b8c264: Add self-update command to CLI with automatic package manager detection and version checking
- b788bd8: Use password entry instead of plaintext entry
- f784f72: New models and clean up
- Updated dependencies [e8ba7de]
- Updated dependencies [0b8c264]
- Updated dependencies [b788bd8]
- Updated dependencies [f784f72]
  - @inkeep/agents-core@0.22.4

## 0.22.3

### Patch Changes

- d00742f: misnamed model
- Updated dependencies [d00742f]
  - @inkeep/agents-core@0.22.3

## 0.22.2

### Patch Changes

- abdf614: Default model configs
- Updated dependencies [abdf614]
  - @inkeep/agents-core@0.22.2

## 0.22.1

### Patch Changes

- ba2a297: Support remote sandboxes
- Updated dependencies [ba2a297]
  - @inkeep/agents-core@0.22.1

## 0.22.0

### Patch Changes

- 8a10d65: updated inkeep pull and added new zod schema support for status components
- Updated dependencies [8a10d65]
  - @inkeep/agents-core@0.22.0

## 0.21.1

### Patch Changes

- 1aefe88: Update default project
- eb0ffa2: removed model pinning
- Updated dependencies [4815d3a]
- Updated dependencies [1aefe88]
- Updated dependencies [eb0ffa2]
  - @inkeep/agents-core@0.21.1

## 0.21.0

### Minor Changes

- 88ff25c: Fix table name for sub agent function tool relations

### Patch Changes

- 43cd2f6: updated tests
- Updated dependencies [88ff25c]
- Updated dependencies [43cd2f6]
  - @inkeep/agents-core@0.21.0

## 0.20.1

### Patch Changes

- 1e5188d: split tool execution into tool call and tool result
- Updated dependencies [1e5188d]
  - @inkeep/agents-core@0.20.1

## 0.20.0

### Minor Changes

- fb99085: refactors agentPrompt to prompt

### Patch Changes

- Updated dependencies [fb99085]
  - @inkeep/agents-core@0.20.0

## 0.19.9

### Patch Changes

- @inkeep/agents-core@0.19.9

## 0.19.8

### Patch Changes

- e9048e2: split tool execution into tool call and tool result
- Updated dependencies [e9048e2]
  - @inkeep/agents-core@0.19.8

## 0.19.7

### Patch Changes

- @inkeep/agents-core@0.19.7

## 0.19.6

### Patch Changes

- Updated dependencies [76fb9aa]
- Updated dependencies [0d0166f]
  - @inkeep/agents-core@0.19.6

## 0.19.5

### Patch Changes

- 22b96c4: inkeep cli pull command uses dynamic planner
- Updated dependencies [22b96c4]
  - @inkeep/agents-core@0.19.5

## 0.19.4

### Patch Changes

- 7a3fc7f: Fixed tests
- Updated dependencies [7a3fc7f]
  - @inkeep/agents-core@0.19.4

## 0.19.3

### Patch Changes

- 079a18a: more-model-def-fixes
- Updated dependencies [079a18a]
  - @inkeep/agents-core@0.19.3

## 0.19.2

### Patch Changes

- Updated dependencies [717d483]
  - @inkeep/agents-core@0.19.2

## 0.19.1

### Patch Changes

- @inkeep/agents-core@0.19.1

## 0.19.0

### Minor Changes

- 71a9f03: Rename Graphs to Agents, complete migration from agents to sub agents, various cleanup

### Patch Changes

- 849c6e9: added new cosntants for model and inkeep pull
- Updated dependencies [849c6e9]
- Updated dependencies [71a9f03]
  - @inkeep/agents-core@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [71892f2]
  - @inkeep/agents-core@0.18.1

## 0.18.0

### Minor Changes

- 1600323: rename agents to subAgents within the agents-sdk
- 3684a31: Rename Agents to SubAgents

### Patch Changes

- 81d5a7e: Template variable preservation in placeholders
- 9bdf630: Fixed streamed non final output text tracking
- Updated dependencies [81d5a7e]
- Updated dependencies [2165d9b]
- Updated dependencies [1600323]
- Updated dependencies [3684a31]
- Updated dependencies [9bdf630]
  - @inkeep/agents-core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [94c0c18]
  - @inkeep/agents-core@0.17.0

## 0.16.3

### Patch Changes

- d296913: fix bundle
  - @inkeep/agents-core@0.16.3

## 0.16.2

### Patch Changes

- Updated dependencies [4df3308]
  - @inkeep/agents-core@0.16.2

## 0.16.1

### Patch Changes

- @inkeep/agents-core@0.16.1

## 0.16.0

### Patch Changes

- 35e6c9e: Updated Artifact Schema
- Updated dependencies [5c3bbec]
- Updated dependencies [35e6c9e]
  - @inkeep/agents-core@0.16.0

## 0.15.0

### Minor Changes

- ad5528c: Context config route changes

### Patch Changes

- Updated dependencies [ad5528c]
  - @inkeep/agents-core@0.15.0

## 0.14.16

### Patch Changes

- @inkeep/agents-core@0.14.16

## 0.14.15

### Patch Changes

- @inkeep/agents-core@0.14.15

## 0.14.14

### Patch Changes

- Updated dependencies [8fe8c3e]
  - @inkeep/agents-core@0.14.14

## 0.14.13

### Patch Changes

- @inkeep/agents-core@0.14.13

## 0.14.12

### Patch Changes

- a05d397: reduce log spam during tests runs
- Updated dependencies [a05d397]
  - @inkeep/agents-core@0.14.12

## 0.14.11

### Patch Changes

- ef0a682: Release
- Updated dependencies [ef0a682]
  - @inkeep/agents-core@0.14.11

## 0.14.10

### Patch Changes

- cee3fa1: use type defs from @inkeep/agents-core in llm generated @inkeep/agents-cli pull command prompts
- Updated dependencies [cee3fa1]
  - @inkeep/agents-core@0.14.10

## 0.14.9

### Patch Changes

- Updated dependencies [c7194ce]
  - @inkeep/agents-core@0.14.9

## 0.14.8

### Patch Changes

- @inkeep/agents-core@0.14.8

## 0.14.7

### Patch Changes

- d891309: Fix default graph id
- Updated dependencies [d891309]
- Updated dependencies [735d238]
  - @inkeep/agents-core@0.14.7

## 0.14.6

### Patch Changes

- @inkeep/agents-core@0.14.6

## 0.14.5

### Patch Changes

- Updated dependencies [557afac]
  - @inkeep/agents-core@0.14.5

## 0.14.4

### Patch Changes

- @inkeep/agents-core@0.14.4

## 0.14.3

### Patch Changes

- @inkeep/agents-core@0.14.3

## 0.14.2

### Patch Changes

- @inkeep/agents-core@0.14.2

## 0.14.1

### Patch Changes

- b056d33: Fix graphWithinProject schema
- Updated dependencies [b056d33]
  - @inkeep/agents-core@0.14.1

## 0.14.0

### Patch Changes

- @inkeep/agents-core@0.14.0

## 0.13.0

### Patch Changes

- c43a622: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- Updated dependencies [c43a622]
- Updated dependencies [94e010a]
  - @inkeep/agents-core@0.13.0

## 0.12.1

### Patch Changes

- 2030a35: Fix project init
- 2c255ba: Fix for agents-cli so that inkeep.config.ts values for agentsRunApiUrl and agentsManageApiUrl are respected
- Updated dependencies [2c255ba]
  - @inkeep/agents-core@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies [2b16ae6]
  - @inkeep/agents-core@0.12.0

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

- 3a95469: added default components for status
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
- Updated dependencies [3a95469]
  - @inkeep/agents-core@0.8.2

## 0.8.1

### Patch Changes

- dc19f1a: @inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
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

- @inkeep/agents-core@0.6.1

## 0.6.0

### Minor Changes

- 9e04bb6: Inkeep CLI Project based push and pull functionality. Push and pull an entire project set of resources in one command line.

### Patch Changes

- Updated dependencies [9e04bb6]
  - @inkeep/agents-core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [45b3b91]
  - @inkeep/agents-core@0.5.0

## 0.4.0

### Minor Changes

- a379dec: Added env var loader to agents-cli package

### Patch Changes

- Updated dependencies [0a8352f]
- Updated dependencies [0a8352f]
- Updated dependencies [a379dec]
  - @inkeep/agents-core@0.4.0

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

- Updated dependencies [a7a5ca5]
  - @inkeep/agents-core@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [d445559]
  - @inkeep/agents-core@0.2.2

## 0.2.1

### Patch Changes

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

- 8528928: Public packages
- Updated dependencies [8528928]
  - @inkeep/agents-core@0.1.9

## 0.1.8

### Patch Changes

- @inkeep/agents-core@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [a5756dc]
- Updated dependencies [8aff3c6]
- Updated dependencies [a0d8b97]
  - @inkeep/agents-core@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [3c4fd25]
  - @inkeep/agents-core@0.1.6
