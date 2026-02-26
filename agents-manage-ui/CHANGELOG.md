# @inkeep/agents-manage-ui

## 0.53.10

### Patch Changes

- eacb0dc: adding stream timeout to trace timeline
- 33780a8: Refactor agent form to use shared Zod schemas from `agents-core`
- ff9e307: Fix broken logout on app.inkeep.com by using full page navigation for route handler and clearing cookies on all candidate domains
- 901058e: extract aria-invalid classes into reused `inkeep-aria-invalid`, fixes form error state propagation for `Select` and `ComboBox` components
- Updated dependencies [eacb0dc]
- Updated dependencies [33780a8]
  - @inkeep/agents-core@0.53.10

## 0.53.9

### Patch Changes

- 9a2d783: Fix stale session cookie blocking dev auto-login after setup re-run
- Updated dependencies [9a2d783]
- Updated dependencies [27cd96b]
- Updated dependencies [603d7a8]
  - @inkeep/agents-core@0.53.9

## 0.53.8

### Patch Changes

- 7e60710: Update @inkeep/agents-ui package to version 0.15.13
- a879934: Fix Collapse All / Expand All on traces page to collapse and expand all tree hierarchy nodes in addition to AI message content
  - @inkeep/agents-core@0.53.8

## 0.53.7

### Patch Changes

- 54985c0: feat(dashboard): refactor external agents form to use zod schemas from `agents-core`
- Updated dependencies [aa37d3f]
- Updated dependencies [54985c0]
  - @inkeep/agents-core@0.53.7

## 0.53.6

### Patch Changes

- 946d729: Hide member column in slack channels list
  - @inkeep/agents-core@0.53.6

## 0.53.5

### Patch Changes

- @inkeep/agents-core@0.53.5

## 0.53.4

### Patch Changes

- 35ca5cb: Refactor API key validation schemas to use shared definitions from `agents-core`
- df4b020: fix breadcrumb `Error` on trigger invocations page
- Updated dependencies [35ca5cb]
  - @inkeep/agents-core@0.53.4

## 0.53.3

### Patch Changes

- Updated dependencies [f7e47ab]
  - @inkeep/agents-core@0.53.3

## 0.53.2

### Patch Changes

- 090bedc: Fix dev auto-login proxy to check ENVIRONMENT instead of NODE_ENV, enabling auto-login when running via inkeep dev standalone build
  - @inkeep/agents-core@0.53.2

## 0.53.1

### Patch Changes

- e06a945: fix generic combobox text color and chevron color, fix select hover color on light mode
- 2222e08: Show MCP tool overrides in agent editor sidepane — display name, description, and schema overrides are now reflected in the tool configuration table
- 75fbceb: Add smart Slack link — preserve user questions in JWT intent claims and auto-resume after account linking
- Updated dependencies [75fbceb]
  - @inkeep/agents-core@0.53.1

## 0.53.0

### Patch Changes

- f54846b: Add code formatting action button for Prompt, Markdown and JavaScript Monaco editors
- 08ba7c2: rename `JsonSchemaInput` to `GenericJsonSchemaEditor` and add `JsonSchemaEditor` component
- 9c293ff: Improve function tool form, add a toggle between visual and JSON editing modes for Input Schema field
- a5f8f24: Fix double skeleton rendering in header menus
- f868a96: Enforce single Slack workspace per tenant and improve error handling
- Updated dependencies [0a0cb6e]
  - @inkeep/agents-core@0.53.0

## 0.52.0

### Patch Changes

- d717f54: Add clear option to Slack workspace default agent selector dropdown
- Updated dependencies [886b2da]
- Updated dependencies [eea5f0a]
- Updated dependencies [65f71b5]
  - @inkeep/agents-core@0.52.0

## 0.51.0

### Patch Changes

- fe36caa: Add join-from-workspace toggle and auto-invite flow for Slack users
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

- d50fa44: Released Gemini 3.1-pro
- 13197d8: improve trace performance
- 0aea45a: Add OpenTelemetry instrumentation for server-side tracing
- Updated dependencies [2005b87]
- Updated dependencies [d50fa44]
  - @inkeep/agents-core@0.50.3

## 0.50.2

### Patch Changes

- fa71905: Added Oversized Artifact Handling and Context Window Size Management at Provider Options
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

### Patch Changes

- d32f38f: fix filtering being undone by polling
  - @inkeep/agents-core@0.50.0

## 0.49.0

### Patch Changes

- 97d5fce: fix azure form
- a998bb3: Harden dev auto-login: require bypass secret on /api/auth/dev-session and move auto-login to server-side proxy
  - @inkeep/agents-core@0.49.0

## 0.48.7

### Patch Changes

- Updated dependencies [3532557]
  - @inkeep/agents-core@0.48.7

## 0.48.6

### Patch Changes

- 2e8d956: Added sonnet 4-6
- 4afaf71: Improve cron schedule display in Triggers table with human-readable descriptions and tooltips showing the raw expression
- Updated dependencies [2e8d956]
  - @inkeep/agents-core@0.48.6

## 0.48.5

### Patch Changes

- 1c85bf0: Fix breadcrumb error on GitHub work-app detail page
- ded8362: improve performance time for traces on vercel
  - @inkeep/agents-core@0.48.5

## 0.48.4

### Patch Changes

- Updated dependencies [11f4e14]
  - @inkeep/agents-core@0.48.4

## 0.48.3

### Patch Changes

- 6b561f6: Fix Docker deployments to evaluate environment variables at request time instead of build time
- Updated dependencies [24e75fb]
- Updated dependencies [79dffed]
  - @inkeep/agents-core@0.48.3

## 0.48.2

### Patch Changes

- 5287615: Add "View Traces" button to agent builder toolbar for quick access to agent-specific trace analytics
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
- 26b3b88: Fix existingRender prop reference in ComponentRenderGenerator to use defaultValues instead of static initialData
- 615713f: Fix fullscreen editor dialog styling and improve ExpandableField layout
- e551124: Make `ExpandablePromptEditor` work on markdown files without the "Add variables" action button. The component now supports both template files (showing the variables button) and regular markdown files (without the button), enabling it to be used as a general-purpose markdown editor.
- 5d3f136: Add `GenericJsonEditor` and `GenericPromptEditor` components with react-hook-form integration
- 5b0b1f1: fix max height for card content on traces conversation page
- 228d4e2: Fix nested error message display in form validation

  - Add `firstNestedMessage` helper to recursively extract error messages from nested Zod validation objects
  - Display error path location (e.g., `→ at ["foo", "bar"]`) for deeply nested validation errors
  - Refactor `createCustomHeadersSchema` to use Zod `.pipe()` for cleaner error path propagation
  - Rename `HeadersSchema` to `StringRecordSchema` for broader applicability

- c0c922b: fixed azure model selector
- 627df66: Fix layout styling in GenericPromptEditor and GenericJsonEditor components
- 9ed110c: Add `--ui` flag to CLI `add` command for downloading UI components from the dashboard
- 7ad7e21: Refactor artifact and data component validation to use centralized Zod schemas from agents-core. This eliminates duplicate validation logic and improves consistency across the codebase.
- 4476af0: performance improvements traces
- 73d79bd: local time for traces, end date when agent is done running
- 0bf078c: Render function execute code using the CodeDiff component instead of TextDiff
- 95a3abc: Add scheduled/cron trigger support across the full stack — database schema, API routes, Manage UI
- 32bff8f: Warn when trying to connect already connected MCP tools and show 'No tools' instead of '0' badge
- Updated dependencies [f981006]
- Updated dependencies [e11fae9]
- Updated dependencies [228d4e2]
- Updated dependencies [7ad7e21]
- Updated dependencies [95a3abc]
- Updated dependencies [b2a6078]
  - @inkeep/agents-core@0.48.0

## 0.47.5

### Patch Changes

- 1ae697c: Polish tool calls breakdown pages
  - @inkeep/agents-core@0.47.5

## 0.47.4

### Patch Changes

- 6fb0715: Fix hydration error by adding UTC timezone to all date formatting functions. Ensures server and client render identical date strings regardless of server/client timezone differences.
- 83346fc: Retry/rerun functionality for webhook triggers in the traces UI
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

- 2307d76: Fix MCP Tool Calls card scrollbox to fill parent container instead of being capped at 120px
- f6010a1: Improve form component type inference from Zod schemas with transformed values. This ensures proper TypeScript types flow through form fields when using Zod's `.transform()` methods. Also adds `isRequired` and `serializeJson` utility functions for form validation.
- Updated dependencies [f6010a1]
- Updated dependencies [07a027d]
  - @inkeep/agents-core@0.46.1

## 0.46.0

### Patch Changes

- 4811c97: performance imp trace
- 99388e9: Fix script to keep both original and hashed dependencies in package.json for Turbopack server-only packages
- 12ad286: - Temp fix for chat to edit
- Updated dependencies [4811c97]
- Updated dependencies [12ad286]
  - @inkeep/agents-core@0.46.0

## 0.45.3

### Patch Changes

- 14a2e6f: bump `next` to `^16.1.6` to fix pnpm audit vulnerabilities
- 4d291f1: Fix custom headers modal to automatically open when validation errors are present on mount
- 4a83260: Add custom headers validation in playground chat. Users are now notified when custom headers are invalid or required based on the agent's headers schema configuration.
- fd323b4: Fix `ModelSelector` layout where custom model inputs were cut off and improve `ModelSelector` architecture with new shadcn `ButtonGroup` component
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

- cd28e97: Fix optional chaining for data.details in error case to prevent runtime errors
- 21e6ae5: bump zod to latest 4.3.6 and fix `.omit() cannot be used on object schemas containing refinements` error
- Updated dependencies [21e6ae5]
  - @inkeep/agents-core@0.45.1

## 0.45.0

### Minor Changes

- bab4641: add format action button for code editor

### Patch Changes

- 4f91394: add new available-agents route and authz permissions to runAuth middleware
- 8f067f4: chore(dashboard): update vitest deps and add image snapshots for form error state
- 48b5400: Fix text overflow for function tool node and placeholder node in agent flow
- Updated dependencies [938ffb8]
- Updated dependencies [4f91394]
- Updated dependencies [6f5bd15]
  - @inkeep/agents-core@0.45.0

## 0.44.0

### Minor Changes

- 08aa941: Add GitHub app management functionality
- 0ff87cf: feat(dashboard): sort available tools first by active status, after by name
- 0f3c2e5: feat(dashboard): use official node collision solution in agent flow

### Patch Changes

- f23d445: invalidate cache when updating mcp servers
- 4f2b927: If the sidebar is expanded via hover and the user clicks the toggle, keep the sidebar open (persist the expanded state).
- 5bb2da2: fix(agents-core): add AST validation for function tools `executeCode`
- 9ea2de8: fix(dashboard): ignore hydration errors from radix DialogTrigger
- 707d1c8: Prefer `React.use` over `React.useContext`
- 7a57040: Refactor ux for tool overrides
- 046f799: chore(dashboard): mark `useAgentActions`, `useMonacoActions`, `useProjectActions`, `useTheme#setTheme` as stable references to avoid warning from `useExhaustiveDependencies` biome rule
- da3f64f: fix(dashboard): add toast with error when user want to remove undeletable nodes
- 0d18b7e: remove feature flag
- 5704c38: fix login redirect
- 5e7cede: fix orphaned tools case
- afd01d5: specify stable functions from `useReactFlow` hook for `useExhaustiveDependencies` biome rule
- Updated dependencies [08aa941]
- Updated dependencies [5bb2da2]
- Updated dependencies [8a283ea]
- Updated dependencies [bcc26b4]
- Updated dependencies [ba853ef]
  - @inkeep/agents-core@0.44.0

## 0.43.0

### Minor Changes

- a5ba56c: Add UI for configurable webhook signature verification

  Added comprehensive UI for configuring webhook signature verification with support for GitHub, Slack, Stripe, Zendesk, and custom webhook providers.

  **New Features:**

  - Replaced plaintext signing secret input with credential reference selector
  - Added algorithm selector (sha256, sha512, sha384, sha1, md5) with deprecation warnings
  - Added encoding selector (hex, base64)
  - Added signature location configuration (header, query, body with JMESPath)
  - Added signed components builder with reordering, add/remove functionality
  - Added component join configuration (strategy and separator)
  - Added quick setup presets for GitHub, Slack, Zendesk, and Stripe
  - Added advanced validation options (case sensitivity, empty body, Unicode normalization)
  - Added client-side JMESPath and regex validation with error messages
  - All new fields integrate with existing trigger form validation and submission

  **UI Improvements:**

  - Collapsible "Advanced Validation Options" section reduces visual clutter
  - Provider preset buttons enable one-click configuration for common webhooks
  - Dynamic field labels and placeholders based on selected options
  - Helpful tooltips and FormDescription text throughout
  - Reorder buttons (up/down arrows) for signed components
  - Success toast confirmation when applying presets

- b215936: add metadata title and descriptions for pages
- 0b75a6d: add `METADATA_BASE_URL`, `METADATA_TWITTER_SITE` and `METADATA_TWITTER_CREATOR` env variable for setup metadata tags

### Patch Changes

- 0497b9a: bump agents-ui package
- 5f432f9: stats page
- eef0a3f: new OAuth callback route
- 2f9d367: trigger fix
- 3e3a0db: unneeded code for stats
- 0f83405: Fix trigger message template removal not working from UI
- 5ffbf6b: trigger traces
- 0f86f53: use tanstack query for:
  - `fetchThirdPartyMCPServer`
  - `fetchEvaluators`
  - `fetchEvaluationSuiteConfigEvaluators`
  - `fetchEvaluationSuiteConfig`
  - `fetchUserScopedCredential`
  - `getAllAgentsAction`
- 05a8a12: adding authorization checks and spicedb setup
- f1920e3: address unused exports
- e8da68a: fix(dashboard): use latest `react@19.3.0-canary` to fix hydration errors mismatches due radix componenents and react `useId` hook
- 0fff69c: Use centralized jmes validation
- 503ce52: feat(manage-ui): upload source maps if sentry is enabled
- caefccc: improve mcp servers page loading
- 720d42f: trigger fix for vercel
- c47f630: fix(dashboard): variables in prompt editor weren't properly highlighted inside HTML tags, or were incorrectly highlighted inside `[]` brackets
- 27a6e3f: Clear context configs when empty in agent serialization
- 5f66967: triggers for vercel
- 82b959b: fix hydration errors on triggerId/invocations page
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
- Updated dependencies [8160ded]
- Updated dependencies [cfa81bb]
  - @inkeep/agents-core@0.43.0

## 0.42.0

### Minor Changes

- d6830a0: add sentry logs about unexpected behavior of data animations
- c302c77: update `knip` to latest, enable `--files` flag to report unused files, cleanup unused files
- 7d46f27: feat(dashboard): add `useMcpToolsQuery`, `useExternalAgentsQuery`, `useCredentialStoresQuery` without manual `useEffect`
- a210291: Doltgres migration and evaluation system.
- 82afd5b: Replace auth type dropdown with dynamic header list for trigger authentication configuration
- a11bb6b: automatically generate and render breadcrumbs in dashboard with Next.js `/[tenantId]/@breadcrumbs/[...slug]/page.tsx` parallel route

### Patch Changes

- 3940062: added extra prompting optionally to mcp tools
- 00fbaec: output schema filtering for evals
- 4f05b56: Change the way subagents are selected
- b336b0e: Fix bug with agent name and description not updating
- 322a6d6: Remove throwOnError option from default QueryClient settings in tanstack
- d7da349: move all React context Provider in `@/contexts` (except shadcn providers)

  remove unnecessary `.Provider` suffix React context components. Starting in React 19, you can render `<SomeContext>` as a provider.

- e7b571b: Add templates for json fields
- a0d4594: setup React compiler for `/[tenantId]/projects/[projectId]/agents/[agentId]` page
- 44461fe: trace default
- 14041da: pagination fix
- 568c1b2: added timestamp
- 09768e3: remove `forwardRef` usages. In React 19, `forwardRef` is no longer necessary. Pass `ref` as a prop instead.
- c422f89: bug fix for user message evals
- a5c9830: Improve trigger form to show transform type selector with clear guidance on when to use Object Transformation vs JMESPath
- 4c65924: process attributes removed
- 0893319: Update trigger form to make messageTemplate optional with improved help text explaining data part inclusion
- 3c5aac4: add log for data operation animation
- b68b15c: fix(sentry): Enable wider client file upload for source maps
- 468fb23: remove extra closing tags for components without `children` and lint check
- b241c06: vercel workflow
- 3e656cd: simple refactor to reorder models
- 9109949: fix color for flow edge markers
- 2d0d77a: Add ability to edit name and description from agent card
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
- d32fdb8: Fix import for streamdown css
- 01ca1e6: - Fix bug with trying to use the useRuntimeConfig hook within the shadow dom"
- c584a64: Remove `fixedOverflowWidgets` option from monaco-editor config
- 86273ec: fix: add missing border for shadcn tooltip arrow
- e5e12d9: Disable warnings for `–’` characters in Prompt editor
- 2e86062: warning status messages
- Updated dependencies [112b5c7]
- Updated dependencies [de84714]
- Updated dependencies [af347c8]
- Updated dependencies [2e86062]
  - @inkeep/agents-core@0.41.2

## 0.41.1

### Patch Changes

- d1f60f3: added azure provider
- 53acc10: - Bump agents-ui package, remove the need to force refresh the widget when headers change
- Updated dependencies [d1f60f3]
  - @inkeep/agents-core@0.41.1

## 0.41.0

### Minor Changes

- de60268: remove `[tenantId]/projects/[projectId]/page.tsx` file in favour of redirect in `next.config` file
- 1c46e8f: add syntax highlighting for markdown/html elements in prompt editors

### Patch Changes

- 49ec561: fix auth dependencies
- 5d095da: Properly contain overflow of trace card content
- f1a6cd4: compression ui improvements
- 7a00f08: use `bg-sidebar` for `<body>` for pages with sidebar
- 1257b10: `useEffect` is always called on the client, and the `window` object is defined
- 561605f: Export DEFAULT_NANGO_STORE_ID from @inkeep/agents-core main exports
- c890035: When using `@inkeep/agents-manage-ui` as dependency we are getting following error:
  Failed to load external module pino-51ec28aa490c8dec: Error: Cannot find module 'pino-51ec28aa490c8dec'

  because Turbopack appends hash for server-only packages listed in `serverExternalPackages`

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
- 811b6e2: Deduplicate Data Fetching with `@tanstack/react-query`
- 90c4cfb: remove unused variables/functions
- 44d5516: setup sentry for pilot.inkeep.com
- 50ed255: remove unused types

### Patch Changes

- 7317cb1: fix user not found error
- be0131e: user info for spans
- 07f77ab: Remove unused exports using Knip automation tool
- 8b95949: context tracking in traces
- b2c2fd9: fix trace viewer panes to scroll independently
- b231869: set `compilerOptions.verbatimModuleSyntax: true` in all `tsconfig.json` files
- ff51b72: fix diagnostics highlighting in JSON editor
- 1ef2557: dashboard: do not overflow main content container
- 5b32e12: Fix container size
- d27e015: fix double breadcrumbs on `/projects` error page
- 153d4e5: Added Conversation COmpression
- 970a7bd: update Next.js to 16.1.0, use Turbopack for build
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

- 9f654ab: move `monaco.setTheme` call from `<ThemeToggle />` component to `<HeaderMenus />`
- 9474027: fix missing scope for mcp server
- 31e0d6e: dashboard: improve navigation by proper using Next.js `loading` files and `React.Suspense` in agent page
- d13e4c2: Fix quickstart
- 231abec: Hide chat to create
- 9e4deda: Added dynamic model context limit checks
- e420660: dashbord: dynamically load `<Agent />` page only on client
- Updated dependencies [d13e4c2]
- Updated dependencies [9e4deda]
  - @inkeep/agents-manage-api@0.39.5
  - @inkeep/agents-run-api@0.39.5
  - @inkeep/agents-core@0.39.5

## 0.39.4

### Patch Changes

- fcb3adc: added gemini 3 flash
- 9403533: improve mcp connect for chat to edit
- Updated dependencies [fcb3adc]
- Updated dependencies [9403533]
  - @inkeep/agents-core@0.39.4
  - @inkeep/agents-manage-api@0.39.4
  - @inkeep/agents-run-api@0.39.4

## 0.39.3

### Patch Changes

- eba0e6b: Increase default page size to 100 (API max) for all list endpoints to show more resources without full pagination
- a3b79b2: adjust auth settings
- 2b156b6: migrate from tsup to tsdown
- 9afba48: fix: resolve create-agents test mock issue with node:util and node:child_process module paths
- e4b0e1b: - fix shiki theme being wrongly overwritten in monaco-editor
  - lazy loading monaco only pages with editors
- 68ef774: Add x-speakeasy-pagination extension to all paginated list endpoints for Speakeasy SDK native pagination support
- Updated dependencies [eba0e6b]
- Updated dependencies [a3b79b2]
- Updated dependencies [2b156b6]
- Updated dependencies [9afba48]
- Updated dependencies [68ef774]
  - @inkeep/agents-core@0.39.3
  - @inkeep/agents-manage-api@0.39.3
  - @inkeep/agents-run-api@0.39.3

## 0.39.2

### Patch Changes

- bc3cd69: Bump agents ui and improve stat opts
- 0f2b040: added backup parser
- Updated dependencies [0f2b040]
  - @inkeep/agents-core@0.39.2
  - @inkeep/agents-run-api@0.39.2
  - @inkeep/agents-manage-api@0.39.2

## 0.39.1

### Patch Changes

- cbb7c09: batch flushing
- 00be449: found bug in system prpomt
- 6411569: remove `React.CSSProperties` type override
- 71a83d0: improve redirect logic and better-auth session use
- Updated dependencies [cbb7c09]
- Updated dependencies [00be449]
- Updated dependencies [71a83d0]
  - @inkeep/agents-run-api@0.39.1
  - @inkeep/agents-manage-api@0.39.1
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
  - @inkeep/agents-manage-api@0.39.0
  - @inkeep/agents-run-api@0.39.0

## 0.38.3

### Patch Changes

- @inkeep/agents-manage-api@0.38.3
- @inkeep/agents-run-api@0.38.3
- @inkeep/agents-core@0.38.3

## 0.38.2

### Patch Changes

- 907fb8f: updated models to have gpt-5-2
- 5f4fa55: Update tool parsing to match tool name changes in updated mcp
- Updated dependencies [907fb8f]
  - @inkeep/agents-core@0.38.2
  - @inkeep/agents-manage-api@0.38.2
  - @inkeep/agents-run-api@0.38.2

## 0.38.1

### Patch Changes

- 32c4c34: improve ux for scoped credentials
- 8c81242: ui for tool breakdown and warnings for tool calls
- 4d28a93: Fix text contrast in approval dialogs and Monaco editor wrappers for dark mode
- 251cecd: added mid generation compression
- ce60f56: multi tenant auth for signoz queries
- Updated dependencies [32c4c34]
- Updated dependencies [8c81242]
- Updated dependencies [251cecd]
- Updated dependencies [ce60f56]
  - @inkeep/agents-core@0.38.1
  - @inkeep/agents-manage-api@0.38.1
  - @inkeep/agents-run-api@0.38.1

## 0.38.0

### Minor Changes

- c3ffb34: Add GET /logout endpoint for debugging login/logout issues. Supports direct URL-based logout without requiring JavaScript execution. Includes security hardening to prevent open redirect vulnerabilities.
- 515d808: Upgrade to Vercel AI SDK v6 beta
- 4b64b94: - add spinner in `Save changes` button in agent workflow
  - remove `inPreviewDisabled` prop from `<Toolbar />` component

### Patch Changes

- b69b814: fix biome warnings
- 8114afc: Update to open id connect for release action
- bcee35f: add requiredToFetch on fetch definitions
- f4628aa: fix multiple copy value icons when value contains multiple quotes
- a2928eb: filter out disabled providers
- 4f2b325: Add missing repo field to package json
- bc2bb7e: fix: update tool-approval tests to use correct underscore-based tool name format
- a46303b: fix blue dot appears on inverted delegation on top left corner, refactor retrieving relationshipId in agents-core
- d29440f: Bump next
- af7704c: fix empty agent prompt field not updating in database
- 4801d35: status messages for traces shown
- f791c6d: updated artifact handlin
- f1f68cf: new models
- 6dcb6b7: fix signoz for vercel
- 5e2c81d: - set max height for monaco editor to avoid page freezes up / lags when clicking into it
  - add toggle text wrap action button for `JsonEditorWithCopy`
- b3e49d9: updated schemas
- 5fbd137: fix `Module not found: Can't resolve '../build/Release/keytar.node'` in dashboard, ignore `keytar` from bundling with `webpackIgnore` comment
- 576c9d9: fix `TypeError: Cannot destructure property 'relationshipId' of 'data.details' as it is undefined.`
- 609e8fe: Fix bug with team agent fetch
- 31be157: cloud deployment does not have signoz links
- fcbf008: add creator to mcp server name
- e53c50a: remove `(with-react-flow-provider)` folder group
- 6001b74: Fix schema for render generations when using anthropic models
- Updated dependencies [b69b814]
- Updated dependencies [8114afc]
- Updated dependencies [2cf1070]
- Updated dependencies [515d808]
- Updated dependencies [bcee35f]
- Updated dependencies [6ee52a8]
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
  - @inkeep/agents-manage-api@0.38.0
  - @inkeep/agents-run-api@0.38.0

## 0.37.2

### Patch Changes

- 6cdde56: add org settings page
- 78163b1: mcp hard fail
- f47e391: Use hono zod in run and manage packages
- 1f77578: Fix broken tests: mcpTool.with() returns undefined for empty selectedTools, update agentFull test canUse structure, fix projectFull dataComponents props schema
- Updated dependencies [78163b1]
- Updated dependencies [f47e391]
- Updated dependencies [1f77578]
  - @inkeep/agents-run-api@0.37.2
  - @inkeep/agents-manage-api@0.37.2
  - @inkeep/agents-core@0.37.2

## 0.37.1

### Patch Changes

- 505749a: Fix orphaned resource deletion in full project updates - tools, functions, credentialReferences, externalAgents, dataComponents, and artifactComponents are now properly removed when not present in the update payload
- 7f1b78a: fix linter errors
- 777d8ef: UI improvements for Evaluations
- e07c709: Add Cursor command for creating PRs with changeset validation
- c3c0ac4: dependency updates
- fbf0d97: Add validation error when attempting to delete a sub-agent that is set as default
- Updated dependencies [505749a]
- Updated dependencies [7f1b78a]
- Updated dependencies [e07c709]
- Updated dependencies [c3c0ac4]
- Updated dependencies [fbf0d97]
  - @inkeep/agents-core@0.37.1
  - @inkeep/agents-manage-api@0.37.1
  - @inkeep/agents-run-api@0.37.1

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
  - @inkeep/agents-manage-api@0.37.0
  - @inkeep/agents-run-api@0.37.0

## 0.36.1

### Patch Changes

- 1235b18: improve cors policy
- Updated dependencies [1235b18]
  - @inkeep/agents-core@0.36.1
  - @inkeep/agents-manage-api@0.36.1
  - @inkeep/agents-run-api@0.36.1

## 0.36.0

### Minor Changes

- 7f0f13a: 1. Add persistence in localStorage for the sidebar open state.

  2. Make the `project switcher`, `Next.js DevTools logo`, and `breadcrumbs` elements to not trigger sidebar expansion.

### Patch Changes

- c59e3db: add cypress test for should create project, navigate to agents page and update project switcher
- Updated dependencies [604c74c]
  - @inkeep/agents-manage-api@0.36.0
  - @inkeep/agents-run-api@0.36.0
  - @inkeep/agents-core@0.36.0

## 0.35.12

### Patch Changes

- 840ca11: remove clean-package from API packages - was stripping runtime dependencies causing production errors
- Updated dependencies [840ca11]
  - @inkeep/agents-core@0.35.12
  - @inkeep/agents-manage-api@0.35.12
  - @inkeep/agents-run-api@0.35.12

## 0.35.11

### Patch Changes

- Updated dependencies [287027e]
  - @inkeep/agents-manage-api@0.35.11
  - @inkeep/agents-run-api@0.35.11
  - @inkeep/agents-core@0.35.11

## 0.35.10

### Patch Changes

- 7a7e726: handle next*public* for vercel
- Updated dependencies [7a7e726]
  - @inkeep/agents-core@0.35.10
  - @inkeep/agents-manage-api@0.35.10
  - @inkeep/agents-run-api@0.35.10

## 0.35.9

### Patch Changes

- Updated dependencies [18c036d]
  - @inkeep/agents-core@0.35.9
  - @inkeep/agents-manage-api@0.35.9
  - @inkeep/agents-run-api@0.35.9

## 0.35.8

### Patch Changes

- 986dad2: update better-auth
- Updated dependencies [986dad2]
  - @inkeep/agents-core@0.35.8
  - @inkeep/agents-manage-api@0.35.8
  - @inkeep/agents-run-api@0.35.8

## 0.35.7

### Patch Changes

- 8684c97: Make delegation the default relationship
  - @inkeep/agents-manage-api@0.35.7
  - @inkeep/agents-run-api@0.35.7
  - @inkeep/agents-core@0.35.7

## 0.35.6

### Patch Changes

- 31dbacc: handle google sign in
- Updated dependencies [31dbacc]
  - @inkeep/agents-core@0.35.6
  - @inkeep/agents-manage-api@0.35.6
  - @inkeep/agents-run-api@0.35.6

## 0.35.5

### Patch Changes

- 15b564d: make inkeep mcp and docker optional in the quickstart
- Updated dependencies [15b564d]
  - @inkeep/agents-core@0.35.5
  - @inkeep/agents-manage-api@0.35.5
  - @inkeep/agents-run-api@0.35.5

## 0.35.4

### Patch Changes

- e297579: pull third party mcp servers
- Updated dependencies [e297579]
  - @inkeep/agents-core@0.35.4
  - @inkeep/agents-manage-api@0.35.4
  - @inkeep/agents-run-api@0.35.4

## 0.35.3

### Patch Changes

- 89e8c26: cleaned stale components with inkeep pull
- Updated dependencies [89e8c26]
  - @inkeep/agents-manage-api@0.35.3
  - @inkeep/agents-run-api@0.35.3
  - @inkeep/agents-core@0.35.3

## 0.35.2

### Patch Changes

- Updated dependencies [769d8a9]
  - @inkeep/agents-core@0.35.2
  - @inkeep/agents-manage-api@0.35.2
  - @inkeep/agents-run-api@0.35.2

## 0.35.1

### Patch Changes

- 23c5018: Disable quick suggestions in prompt editor
- fc243b4: fix baseUrl for auth client
- 6fdfb87: `inPreview` property is missing in JSON and form builder in artifacts page
- 447bdf2: - allow saving JSON schema without `required` field
  - highlight header of form builder if there are errors
  - highlight border of JSON Schema editor if there are errors
  - @inkeep/agents-manage-api@0.35.1
  - @inkeep/agents-run-api@0.35.1
  - @inkeep/agents-core@0.35.1

## 0.35.0

### Minor Changes

- 0d46d32: Adding auth to the framework

### Patch Changes

- f9a208a: Check for CLI installation in quickstart
- Updated dependencies [f9a208a]
- Updated dependencies [0d46d32]
  - @inkeep/agents-core@0.35.0
  - @inkeep/agents-manage-api@0.35.0
  - @inkeep/agents-run-api@0.35.0

## 0.34.1

### Patch Changes

- 699043d: Install inkeep mcp in quickstarte
- e4b5d5c: Inkeep add: usage instructions and target path detection
- Updated dependencies [699043d]
- Updated dependencies [e4b5d5c]
  - @inkeep/agents-core@0.34.1
  - @inkeep/agents-manage-api@0.34.1
  - @inkeep/agents-run-api@0.34.1

## 0.34.0

### Minor Changes

- 8af5738: - should collapses when opening an agent page and re-expands when returning to other page
  - should keeps the sidebar collapsed after a manual toggle even when leaving the agent page

### Patch Changes

- 7426927: add cli installation to quickstart
- 015f9f7: Status Update Model fixed
- 817b43e: fix JSON mode in JSON schema from builder, when JSON mode is enabled it override JSON schema to empty
- bdeee9b: quickstart skip cli install option
- 2434d22: add error handling to github fetch
- af95c9a: added provider config
- 2672603: Fix scroll in widgets inside of the ship modal
- Updated dependencies [7426927]
- Updated dependencies [015f9f7]
- Updated dependencies [bdeee9b]
- Updated dependencies [2434d22]
- Updated dependencies [af95c9a]
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
