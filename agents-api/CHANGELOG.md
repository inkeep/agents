# @inkeep/agents-api

## 0.69.1

### Patch Changes

- 53bc4df: Allow deprecated API keys to POST /manage feedback
- ae8ebe1: Fix attachment content being dropped from conversation history on resume
- ae8ebe1: Hydrate artifact references returned by `GET /conversations/:id` so replay matches the shape streaming emits, and drop redundant attachment bookkeeping refs (`toolCallId: message_attachment:*`) that were paired with a sibling `file` part.
- Updated dependencies [a6bd5ec]
  - @inkeep/agents-core@0.69.1
  - @inkeep/agents-work-apps@0.69.1
  - @inkeep/agents-email@0.69.1
  - @inkeep/agents-mcp@0.69.1

## 0.69.0

### Minor Changes

- 52d0831: Resolve `{{$conversation.id}}` in agent prompts to the current conversation ID. Works with or without a `contextConfig`; propagates through A2A delegation so a child sub-agent resolves to the parent's (user-initiated) conversation ID. Agents whose prompts don't reference `{{$conversation.` see no behavior change.

  Edge cases: when `conversationId` is absent, empty, or the literal `'default'` sentinel, the variable resolves to an empty string.

  **Note for external A2A callers:** A2A JSON-RPC clients that bypass Inkeep's delegation tool must pass `contextId` in the message body for the variable to resolve to the user's overarching conversation. Without it, the handler falls back to `generateId()` and the variable resolves to an unrelated synthetic ID.

### Patch Changes

- 57a5b70: Ensure only default agent is permitted with app credentials
- c63567e: Add credential gateway token-exchange endpoint (RFC 8693) for Support Copilot
- 4f7396f: fix branch-unaware agent existence check
- c63567e: Revoke SpiceDB credential grant when deleting a support_copilot app
- 32bce4f: Add quickActions support to support_copilot app config (schema, persistence, editor UI)
- Updated dependencies [52d0831]
- Updated dependencies [c63567e]
- Updated dependencies [32bce4f]
  - @inkeep/agents-core@0.69.0
  - @inkeep/agents-work-apps@0.69.0
  - @inkeep/agents-email@0.69.0
  - @inkeep/agents-mcp@0.69.0

## 0.68.4

### Patch Changes

- Updated dependencies [7438f76]
  - @inkeep/agents-work-apps@0.68.4
  - @inkeep/agents-core@0.68.4
  - @inkeep/agents-email@0.68.4
  - @inkeep/agents-mcp@0.68.4

## 0.68.3

### Patch Changes

- e8776f5: Add Microsoft as a social sign-in provider
- Updated dependencies [e8776f5]
  - @inkeep/agents-core@0.68.3
  - @inkeep/agents-work-apps@0.68.3
  - @inkeep/agents-email@0.68.3
  - @inkeep/agents-mcp@0.68.3

## 0.68.2

### Patch Changes

- 557f700: Add support_copilot app type with OAuth 2.1 JWT auth, tenant-level app discovery endpoint, and apps UI for configuring support copilot apps with credentials
- 4e0fd65: Add POST /manage/api/invitations endpoint supporting bulk invite with project assignments
- Updated dependencies [557f700]
- Updated dependencies [4e0fd65]
  - @inkeep/agents-core@0.68.2
  - @inkeep/agents-work-apps@0.68.2
  - @inkeep/agents-email@0.68.2
  - @inkeep/agents-mcp@0.68.2

## 0.68.1

### Patch Changes

- 0018f02: Filters out evaluators whose scope doesn't include the conversation's agent in batched evaluations
- Updated dependencies [a074f63]
  - @inkeep/agents-mcp@0.68.1
  - @inkeep/agents-core@0.68.1
  - @inkeep/agents-email@0.68.1
  - @inkeep/agents-work-apps@0.68.1

## 0.68.0

### Minor Changes

- d1e18a8: Add OAuth 2.1 / OIDC provider support via Better Auth oauth-provider plugin

### Patch Changes

- e223ac8: Fix tool chaining schema breaking Anthropic constrained JSON generation by replacing per-property anyOf wrapping with a map approach
- accbb2e: Update MCP server catalog: fix broken URLs, migrate SSE to Streamable HTTP, add 17 new servers
- Updated dependencies [d1e18a8]
  - @inkeep/agents-core@0.68.0
  - @inkeep/agents-work-apps@0.68.0
  - @inkeep/agents-email@0.68.0
  - @inkeep/agents-mcp@0.68.0

## 0.67.4

### Patch Changes

- @inkeep/agents-core@0.67.4
- @inkeep/agents-email@0.67.4
- @inkeep/agents-mcp@0.67.4
- @inkeep/agents-work-apps@0.67.4

## 0.67.3

### Patch Changes

- ab65543: Fix text file artifacts being returned as base64-encoded file parts instead of decoded text content
  - @inkeep/agents-core@0.67.3
  - @inkeep/agents-email@0.67.3
  - @inkeep/agents-mcp@0.67.3
  - @inkeep/agents-work-apps@0.67.3

## 0.67.2

### Patch Changes

- @inkeep/agents-core@0.67.2
- @inkeep/agents-email@0.67.2
- @inkeep/agents-mcp@0.67.2
- @inkeep/agents-work-apps@0.67.2

## 0.67.1

### Patch Changes

- 2bf0d15: Add GET /agents/{agentId}/tool-status endpoint returning deduped MCP tool health per agent
- ad12123: Skip artifact creation for text document attachments that are already inlined into the prompt
  - @inkeep/agents-core@0.67.1
  - @inkeep/agents-email@0.67.1
  - @inkeep/agents-mcp@0.67.1
  - @inkeep/agents-work-apps@0.67.1

## 0.67.0

### Minor Changes

- 757ac77: Add multi-user webhook triggers with per-user dispatch delay and invocation tracking.

### Patch Changes

- 4e0f7c4: Improve tool chaining with ref-aware schemas, better error messages, and shared schema description constants
- Updated dependencies [757ac77]
  - @inkeep/agents-core@0.67.0
  - @inkeep/agents-work-apps@0.67.0
  - @inkeep/agents-email@0.67.0
  - @inkeep/agents-mcp@0.67.0

## 0.66.1

### Patch Changes

- @inkeep/agents-core@0.66.1
- @inkeep/agents-email@0.66.1
- @inkeep/agents-mcp@0.66.1
- @inkeep/agents-work-apps@0.66.1

## 0.66.0

### Patch Changes

- 9b60e24: Add pending approval polling endpoint and graceful SSE failure handling for durable tool approvals
- 2dbefca: Register binary attachment artifacts for executions API and unify persisted upload context
- 63a1358: Migrate logger calls to use scoped context — remove repeated ambient fields, adopt string-only logger calls
- 0318750: Fix approval queue ordering by keying on toolCallId instead of toolName
- 2dbefca: Fix `get_reference_artifact` to hydrate blob-backed binary artifacts into model-usable file parts. This allows agents to inspect referenced binary artifacts instead of only seeing blob metadata.
- Updated dependencies [5596ecb]
- Updated dependencies [63a1358]
- Updated dependencies [01a960d]
- Updated dependencies [4d0169b]
  - @inkeep/agents-core@0.66.0
  - @inkeep/agents-work-apps@0.66.0
  - @inkeep/agents-email@0.66.0
  - @inkeep/agents-mcp@0.66.0

## 0.65.2

### Patch Changes

- 867b0f5: Fix durable approval replay: validate originalToolCallId before applying pre-approved decisions
- ce94912: dispatched triggers without requiring user associations
- 93eb31e: Add log context middleware for automatic tenantId/projectId/agentId propagation via AsyncLocalStorage
- 34e1d67: Fix Doltgres error logging to surface root cause details, redact SQL bind params, and re-throw auto-commit failures to prevent silent data loss
- a951178: Fix tool denial context lost across durable workflow steps
- Updated dependencies [b33134a]
- Updated dependencies [50f57fa]
- Updated dependencies [fa18f84]
- Updated dependencies [34e1d67]
- Updated dependencies [93eb31e]
  - @inkeep/agents-mcp@0.65.2
  - @inkeep/agents-work-apps@0.65.2
  - @inkeep/agents-core@0.65.2
  - @inkeep/agents-email@0.65.2

## 0.65.1

### Patch Changes

- 78c78d7: Fix summarizer and base model resolution falling back to empty agent ModelSettings objects instead of project-level config when no defaultSubAgentId is set
- 6f2619d: Fix execution route paths to use OpenAPI {param} syntax
- dbee04b: Add feedback CRUD API, database table, and Manage UI for collecting user feedback on conversations and messages
- Updated dependencies [3735393]
- Updated dependencies [dbee04b]
  - @inkeep/agents-core@0.65.1
  - @inkeep/agents-work-apps@0.65.1
  - @inkeep/agents-email@0.65.1
  - @inkeep/agents-mcp@0.65.1

## 0.65.0

### Minor Changes

- e332202: Add multi-user scheduled trigger support with per-user dispatch, sub-resource endpoints, and dispatch delay

### Patch Changes

- Updated dependencies [e332202]
  - @inkeep/agents-core@0.65.0
  - @inkeep/agents-work-apps@0.65.0
  - @inkeep/agents-email@0.65.0
  - @inkeep/agents-mcp@0.65.0

## 0.64.10

### Patch Changes

- @inkeep/agents-core@0.64.10
- @inkeep/agents-email@0.64.10
- @inkeep/agents-mcp@0.64.10
- @inkeep/agents-work-apps@0.64.10

## 0.64.9

### Patch Changes

- @inkeep/agents-core@0.64.9
- @inkeep/agents-email@0.64.9
- @inkeep/agents-mcp@0.64.9
- @inkeep/agents-work-apps@0.64.9

## 0.64.8

### Patch Changes

- @inkeep/agents-core@0.64.8
- @inkeep/agents-email@0.64.8
- @inkeep/agents-mcp@0.64.8
- @inkeep/agents-work-apps@0.64.8

## 0.64.7

### Patch Changes

- @inkeep/agents-core@0.64.7
- @inkeep/agents-email@0.64.7
- @inkeep/agents-mcp@0.64.7
- @inkeep/agents-work-apps@0.64.7

## 0.64.6

### Patch Changes

- 09c6eb0: Add stream resumption for interrupted conversations with Postgres-backed chunk buffering
- 528f69c: logging for for Doltgres database operations"
- 6fddd34: Bugfix App Prompt Security Vulerability
- cc56dda: Fix durable workflow not resolving user-scoped MCP credentials and improve MCP tool loading resilience
- Updated dependencies [09c6eb0]
- Updated dependencies [3237c45]
- Updated dependencies [528f69c]
- Updated dependencies [6fddd34]
  - @inkeep/agents-core@0.64.6
  - @inkeep/agents-work-apps@0.64.6
  - @inkeep/agents-email@0.64.6
  - @inkeep/agents-mcp@0.64.6

## 0.64.5

### Patch Changes

- e91d67b: Patched Doltgres Backslash Escaping
- Updated dependencies [e91d67b]
  - @inkeep/agents-core@0.64.5
  - @inkeep/agents-work-apps@0.64.5
  - @inkeep/agents-email@0.64.5
  - @inkeep/agents-mcp@0.64.5

## 0.64.4

### Patch Changes

- @inkeep/agents-core@0.64.4
- @inkeep/agents-email@0.64.4
- @inkeep/agents-mcp@0.64.4
- @inkeep/agents-work-apps@0.64.4

## 0.64.3

### Patch Changes

- d85f7ca: Fix CI triggers on changeset PR by disabling checkout credential persistence
- f0d61ab: Fix changeset bot CI trigger by passing App token as github-token input to changesets/action
- 7aa1fac: Remove tryTempJwtAuth auth strategy and copilot tenant bypass in favor of app credential auth
- 4ace590: Remove axios dependency in favor of native fetch for improved security
- f5460ba: Baggage added for traces with durable execution
- Updated dependencies [7aa1fac]
- Updated dependencies [4ace590]
  - @inkeep/agents-core@0.64.3
  - @inkeep/agents-work-apps@0.64.3
  - @inkeep/agents-email@0.64.3
  - @inkeep/agents-mcp@0.64.3

## 0.64.2

### Patch Changes

- f099221: Fix app prompt encoding errors by resolving prompt from database via appId instead of forwarding text in HTTP headers
- Updated dependencies [f099221]
  - @inkeep/agents-core@0.64.2
  - @inkeep/agents-work-apps@0.64.2
  - @inkeep/agents-email@0.64.2
  - @inkeep/agents-mcp@0.64.2

## 0.64.1

### Patch Changes

- 0fc8043: Add S3 presigned URL support for private media delivery
- Updated dependencies [a26343d]
  - @inkeep/agents-work-apps@0.64.1
  - @inkeep/agents-core@0.64.1
  - @inkeep/agents-email@0.64.1
  - @inkeep/agents-mcp@0.64.1

## 0.64.0

### Minor Changes

- a929847: Add server-side config merge for web client app updates, enforce allowAnonymous across all auth paths, flatten auth config into webClient, and add migration to backfill allowAnonymous for existing apps

### Patch Changes

- 47915b3: Add agent-scoped datasets and evaluators with direct agent execution for dataset runs
- 2ebe1c4: Extend /capabilities with modelFallback and costTracking flags
- 704026c: Bind tenant/project into anonymous session JWTs for global apps
- abc3b5d: Add per-role seat limit enforcement to invitations and members UI
- Updated dependencies [47915b3]
- Updated dependencies [2ebe1c4]
- Updated dependencies [68a55f5]
- Updated dependencies [abc3b5d]
  - @inkeep/agents-core@0.64.0
  - @inkeep/agents-mcp@0.64.0
  - @inkeep/agents-work-apps@0.64.0
  - @inkeep/agents-email@0.64.0

## 0.63.3

### Patch Changes

- cfcdc30: Fix anonymous auth path accepting arbitrary tenant/project headers for global apps
  - @inkeep/agents-core@0.63.3
  - @inkeep/agents-email@0.63.3
  - @inkeep/agents-mcp@0.63.3
  - @inkeep/agents-work-apps@0.63.3

## 0.63.2

### Patch Changes

- dc818c0: Add support for nested files and folders within Skills. Each skill is now a directory containing a `SKILL.md` entry file plus any number of nested reference files (templates, checklists, examples). The SDK `loadSkills()` function recursively discovers all files under each skill directory. The CLI `pull` command writes one file per skill file path. The Visual Builder shows a file-tree sidebar with per-file editing, context menus for adding and removing files, and breadcrumb navigation. The API accepts a `files` array for skill create and update, with four new file-level endpoints for individual CRUD operations. `SKILL.md` frontmatter remains the source of truth for skill name, description, and metadata.
- dc818c0: Load nested skill files in the built-in load_skill tool.
- Updated dependencies [dc818c0]
- Updated dependencies [dc818c0]
  - @inkeep/agents-core@0.63.2
  - @inkeep/agents-work-apps@0.63.2
  - @inkeep/agents-email@0.63.2
  - @inkeep/agents-mcp@0.63.2

## 0.63.1

### Patch Changes

- 4141e26: Return 403 Forbidden with "Origin not allowed for this app" when origin validation fails, instead of misleading 401 "Invalid Token"
- 02eb244: Updated Cost UI
- 0f0247e: Fix delegation metadata leaking API key to external agents
- 7dc35b6: Set `initiatedBy` in execution context metadata for app credential auth paths so user-scoped MCP credentials (e.g. Linear OAuth) are resolved correctly
  - @inkeep/agents-core@0.63.1
  - @inkeep/agents-email@0.63.1
  - @inkeep/agents-mcp@0.63.1
  - @inkeep/agents-work-apps@0.63.1

## 0.63.0

### Minor Changes

- 0f77d00: Add scheduler workflow with centralized trigger dispatch and deploy restart endpoint

### Patch Changes

- Updated dependencies [0f77d00]
  - @inkeep/agents-core@0.63.0
  - @inkeep/agents-work-apps@0.63.0
  - @inkeep/agents-email@0.63.0
  - @inkeep/agents-mcp@0.63.0

## 0.62.2

### Patch Changes

- f614c56: Add environment-aware domain verification for the playground app
- ccedaca: Harden media download route to allowlist only safe image MIME types instead of blocklisting HTML
- Updated dependencies [f614c56]
- Updated dependencies [6332134]
  - @inkeep/agents-core@0.62.2
  - @inkeep/agents-email@0.62.2
  - @inkeep/agents-work-apps@0.62.2
  - @inkeep/agents-mcp@0.62.2

## 0.62.1

### Patch Changes

- 9728814: Perserve Part Ordering in Conversations API
- 6e88d12: Improve playground app startup logging for production observability
- 8b74409: Add inline text document attachments to the run chat APIs for `text/plain`, `text/markdown`, `text/html`, `text/csv`, `text/x-log`, and `application/json` while keeping remote URLs limited to PDFs. Persist text attachments as blob-backed file parts and replay them into model input as XML-tagged text blocks.
  - @inkeep/agents-core@0.62.1
  - @inkeep/agents-email@0.62.1
  - @inkeep/agents-mcp@0.62.1
  - @inkeep/agents-work-apps@0.62.1

## 0.62.0

### Patch Changes

- ce9c516: Add startup auto-registration of playground public key and derived kid for key rotation
- b1507d1: Fix evaluation scoring returning null and display evaluation results in local time
- Updated dependencies [ce9c516]
  - @inkeep/agents-core@0.62.0
  - @inkeep/agents-work-apps@0.62.0
  - @inkeep/agents-email@0.62.0
  - @inkeep/agents-mcp@0.62.0

## 0.61.0

### Patch Changes

- 1e4f05d: Refactor agent graph editor to use deterministic graph keys and single source of truth for form state

  ### Graph identity system
  - Add deterministic graph key derivation for all node types (`getSubAgentGraphKey`, `getMcpGraphKey`, `getFunctionToolGraphKey`, `getExternalAgentGraphKey`, `getTeamAgentGraphKey`) via new `graph-keys.ts`, `graph-identity.ts`, `sub-agent-identity.ts`, and `function-tool-identity.ts` modules
  - Replace unstable `generateId()` UUIDs with stable, domain-meaningful identifiers derived from persisted IDs (relation IDs, tool IDs, agent IDs)
  - URL-based sidepane selection now uses graph keys instead of raw React Flow IDs, so deep-links survive re-renders and saves

  ### RHF as single source of truth
  - Strip `node.data` down to a thin identity envelope (`nodeKey` + minimal refs like `toolId`) — all business fields (name, description, prompt, models, code, etc.) are read exclusively from React Hook Form state
  - Remove `hydrateNodesWithFormData()` entirely; `editorToPayload()` now reads all business data directly from a `SerializeAgentFormState` bundle with `requireFormValue()` fail-fast guards
  - Rename `FullAgentUpdateSchema` → `FullAgentFormSchema`, remove `.transform()` from schema (resolution now happens at serialize-time), split types into `FullAgentFormValues` / `FullAgentFormInputValues`

  ### Connection state consolidation
  - Collapse scattered `tempSelectedTools`/`tempHeaders`/`tempToolPolicies` on node data into `mcpRelations` and `functionToolRelations` RHF record maps with factory helpers (`createMcpRelationFormInput`, `createFunctionToolRelationFormInput`)
  - Edge removal triggers synchronous `form.unregister()` instead of deferred `requestAnimationFrame` — only `relationshipId` is unregistered for MCP relations to avoid a race condition where headers would be set to empty string on removal
  - Remove `subAgentId` manipulation from Zustand store's `onEdgesChange`

  ### Save-cycle reconciliation
  - Expand `syncSavedAgentGraph` to reconcile three categories of server-assigned IDs: tool `canUse` relations, external agent delegate relations, and team agent delegate relations
  - Rename MCP node IDs to deterministic graph keys post-save; preserve URL selection state via `findNodeByGraphKey`/`findEdgeByGraphKey`
  - Collapse redundant double `isNodeType` patterns into single guards

  ### Bug fixes
  - Fix function tool "requires approval" flag not persisting across save/reload by hydrating `needsApproval` tool policies from `canUse` relations back into form state during `apiToFormValues()`
  - Fix model inheritance display: use `getModelInheritanceStatus()` instead of bare `!subAgent.models` check to correctly show "(inherited)" label
  - Fix MCP node editor crash on deep-link/reload: consolidate null guards for `toolData`, `tool`, and `mcpRelation` with proper JSX fallback UI
  - Fix function tool node editor crash after node removal: add early return when `functionId` is undefined
  - Fix race condition when MCP relation is removed but component is still mounted

  ### Performance
  - Replace `useWatch({ name: 'functionTools' })` with targeted `useWatch({ name: 'functionTools.${id}.functionId' })` to eliminate O(N²) re-renders across function tool nodes
  - Remove `getFunctionIdForTool` helper that iterated the entire `functionTools` map

  ### Schema changes
  - Rename form field `defaultSubAgentId` → `defaultSubAgentNodeId` to clarify it holds a node key; translation to persisted ID happens at serialization time
  - Add `FunctionToolRelationSchema` and `functionToolRelations` record field to form schema
  - OpenAPI: `defaultSubAgentId` uses `$ref` to `ResourceId`, `maxTransferCount` type corrected to `integer`, function tool `dependencies` simplified to `StringRecord`

  ### Test coverage
  - Add 7 new test files covering graph identity, function tool identity, form-state defaults, and sync-saved-agent-graph scenarios
  - Expand serialize and deserialize test suites with new architecture patterns
  - Add roundtrip test for approval policy hydration

- ad874d0: Add durable execution mode for agent runs with tool approvals and crash recovery
- f4a9c69: Fix key_findings persistence in compressor by using proper update instead of insert-only upsert
- Updated dependencies [12722d9]
- Updated dependencies [f4a9c69]
  - @inkeep/agents-core@0.61.0
  - @inkeep/agents-work-apps@0.61.0
  - @inkeep/agents-email@0.61.0
  - @inkeep/agents-mcp@0.61.0

## 0.60.0

### Minor Changes

- 1199d45: BREAKING: File parts on `/run/api/chat` use a Vercel-compatible shape (`url` and required `mediaType`; no `text` or `mimeType`). Add PDF URL ingestion for chat attachments with explicit bad-request errors on PDF URL ingest failures.

### Patch Changes

- 2eaebb3: Fix deterministic ID generation for sub-agent relation/junction tables to prevent Dolt merge conflicts
- c0018a6: Use actual AI SDK token usage for compression decisions and fix pricing service model ID lookup
- ed10886: Add optional prompt field to app deployments for surface-specific behavioral tuning
- Updated dependencies [2eaebb3]
- Updated dependencies [c0018a6]
- Updated dependencies [ed10886]
- Updated dependencies [b1199eb]
  - @inkeep/agents-core@0.60.0
  - @inkeep/agents-work-apps@0.60.0
  - @inkeep/agents-email@0.60.0
  - @inkeep/agents-mcp@0.60.0

## 0.59.4

### Patch Changes

- be7f056: Add two-phase Doltgres branch merge API with stateless conflict preview and per-row resolution
- 99b5edf: Update TypeScript to 6.0.2
- Updated dependencies [be7f056]
- Updated dependencies [6a8a439]
- Updated dependencies [99b5edf]
  - @inkeep/agents-core@0.59.4
  - @inkeep/agents-work-apps@0.59.4
  - @inkeep/agents-email@0.59.4
  - @inkeep/agents-mcp@0.59.4

## 0.59.3

### Patch Changes

- 6ca8164: v4 to v5 signoz migration
- Updated dependencies [51d6dfd]
- Updated dependencies [6ca8164]
  - @inkeep/agents-core@0.59.3
  - @inkeep/agents-work-apps@0.59.3
  - @inkeep/agents-email@0.59.3
  - @inkeep/agents-mcp@0.59.3

## 0.59.2

### Patch Changes

- 5aad291: Fix conversation endpoint to return Vercel AI SDK FileUIPart-compliant file parts with resolved blob URIs
- c6bcd18: Fix fetchTraceFromSigNoz method in the EvaluationService
  - @inkeep/agents-core@0.59.2
  - @inkeep/agents-email@0.59.2
  - @inkeep/agents-mcp@0.59.2
  - @inkeep/agents-work-apps@0.59.2

## 0.59.1

### Patch Changes

- fddbd38: Fix OpenTelemetry SDK startup crash during Vite HMR by making initialization idempotent
- b396a88: Fix scheduled trigger invocations being skipped when trigger is edited without changing the next execution time
- 65c151d: adding app.id to span attributes
- bab9603: Add Composio connected account ID pinning to prevent cross-project credential leakage
- Updated dependencies [bab9603]
  - @inkeep/agents-core@0.59.1
  - @inkeep/agents-work-apps@0.59.1
  - @inkeep/agents-email@0.59.1
  - @inkeep/agents-mcp@0.59.1

## 0.59.0

### Minor Changes

- b1e6ced: Add SSO configuration, auth method management, and domain-filtered login and invitation flows

### Patch Changes

- Updated dependencies [b1e6ced]
  - @inkeep/agents-core@0.59.0
  - @inkeep/agents-work-apps@0.59.0
  - @inkeep/agents-email@0.59.0
  - @inkeep/agents-mcp@0.59.0

## 0.58.21

### Patch Changes

- @inkeep/agents-core@0.58.21
- @inkeep/agents-email@0.58.21
- @inkeep/agents-mcp@0.58.21
- @inkeep/agents-work-apps@0.58.21

## 0.58.20

### Patch Changes

- 7daab01: Remove unreachable ZodError catch blocks from agentFull and projectFull handlers
- 15c6752: Add ref fields to runtime tables for branch tracking support
- 62aad0e: Fix API key leakage vulnerability in Slack/GitHub MCP integrations by adding URL trust validation
- 62a7aa2: Allow legacy API key authentication for GET conversation-by-ID manage endpoint
- 9e0dd71: fix unauthenticated access to span details
- ac53c07: rename the api to remove references to signoz
- Updated dependencies [3a868c0]
- Updated dependencies [15c6752]
- Updated dependencies [62aad0e]
- Updated dependencies [b4baf66]
  - @inkeep/agents-core@0.58.20
  - @inkeep/agents-work-apps@0.58.20
  - @inkeep/agents-email@0.58.20
  - @inkeep/agents-mcp@0.58.20

## 0.58.19

### Patch Changes

- 1571ef1: Fix project-level auth bypass in app CRUD endpoints — GET, UPDATE, and DELETE now filter by projectId in addition to tenantId, preventing cross-project access within a tenant
- Updated dependencies [f8f16f4]
- Updated dependencies [1571ef1]
- Updated dependencies [9660fc2]
  - @inkeep/agents-core@0.58.19
  - @inkeep/agents-work-apps@0.58.19
  - @inkeep/agents-email@0.58.19
  - @inkeep/agents-mcp@0.58.19

## 0.58.18

### Patch Changes

- 128845e: Fix message ID mismatch between server and client for feedback records
  - @inkeep/agents-core@0.58.18
  - @inkeep/agents-email@0.58.18
  - @inkeep/agents-mcp@0.58.18
  - @inkeep/agents-work-apps@0.58.18

## 0.58.17

### Patch Changes

- f94a089: service name filtering added to signoz queries
  - @inkeep/agents-core@0.58.17
  - @inkeep/agents-email@0.58.17
  - @inkeep/agents-mcp@0.58.17
  - @inkeep/agents-work-apps@0.58.17

## 0.58.16

### Patch Changes

- 5065552: Fix GET /conversations to return all message part types matching the streaming protocol
- Updated dependencies [5065552]
  - @inkeep/agents-core@0.58.16
  - @inkeep/agents-work-apps@0.58.16
  - @inkeep/agents-email@0.58.16
  - @inkeep/agents-mcp@0.58.16

## 0.58.15

### Patch Changes

- 644afb3: Fix agent ID filtering for continuous evaluation tests
- 6e8e655: Standardize CRUD HTTP method conventions: PATCH for partial updates, PUT for upsert/set-replace; hide legacy dual-method routes from OpenAPI spec and SDK generation
- 4b46b9e: Updating Signoz service name from inkeep-agents-run-api to inkeep-agents-api
- 3b02868: removes unused workflowProcessHandler
- Updated dependencies [b10c96f]
- Updated dependencies [1ca09cd]
- Updated dependencies [abaefda]
  - @inkeep/agents-work-apps@0.58.15
  - @inkeep/agents-core@0.58.15
  - @inkeep/agents-email@0.58.15
  - @inkeep/agents-mcp@0.58.15

## 0.58.14

### Patch Changes

- 36e80be: Add rolling token refresh for anonymous session endpoints
- c9a4890: Fix route handlers to forward all validated body fields to the data access layer using spread pattern
- d147f0e: Fix agent create/update handlers to forward all schema fields (models, statusUpdates, prompt, stopWhen)
  - @inkeep/agents-core@0.58.14
  - @inkeep/agents-email@0.58.14
  - @inkeep/agents-mcp@0.58.14
  - @inkeep/agents-work-apps@0.58.14

## 0.58.13

### Patch Changes

- 9ed6710: Fix user ID forwarding during agent delegation
  - @inkeep/agents-core@0.58.13
  - @inkeep/agents-email@0.58.13
  - @inkeep/agents-mcp@0.58.13
  - @inkeep/agents-work-apps@0.58.13

## 0.58.12

### Patch Changes

- 19b1168: rerun scheduled triggers from traces
- Updated dependencies [ad8a7cd]
- Updated dependencies [ad8a7cd]
  - @inkeep/agents-core@0.58.12
  - @inkeep/agents-work-apps@0.58.12
  - @inkeep/agents-email@0.58.12
  - @inkeep/agents-mcp@0.58.12

## 0.58.11

### Patch Changes

- Updated dependencies [c87dc3e]
  - @inkeep/agents-core@0.58.11
  - @inkeep/agents-work-apps@0.58.11
  - @inkeep/agents-email@0.58.11
  - @inkeep/agents-mcp@0.58.11

## 0.58.10

### Patch Changes

- fa64456: Security and bug fixes
- 1e280e5: Security and bug fixes
- 02bcd0e: Fix authorization bypass vulnerability in @hono/node-server (CVE-2026-29087)
- b588ac4: Security and bug fixes
- f41500b: Security and bug fixes
- Updated dependencies [fa64456]
- Updated dependencies [02bcd0e]
- Updated dependencies [f41500b]
- Updated dependencies [41af59e]
  - @inkeep/agents-core@0.58.10
  - @inkeep/agents-work-apps@0.58.10
  - @inkeep/agents-email@0.58.10
  - @inkeep/agents-mcp@0.58.10

## 0.58.9

### Patch Changes

- f150b28: Fix user-scoped credential references to upsert instead of failing on duplicate unique constraint
- 6144fc9: Fix app credential auth failing on internal A2A self-calls by always using service tokens
- Updated dependencies [f150b28]
- Updated dependencies [49909bf]
- Updated dependencies [4816f02]
  - @inkeep/agents-core@0.58.9
  - @inkeep/agents-work-apps@0.58.9
  - @inkeep/agents-email@0.58.9
  - @inkeep/agents-mcp@0.58.9

## 0.58.8

### Patch Changes

- e89948d: Add app credentials with anonymous JWT sessions, domain validation, and PoW challenge support
- e89948d: Add anonymous user session conversation history endpoint
- Updated dependencies [e89948d]
  - @inkeep/agents-core@0.58.8
  - @inkeep/agents-work-apps@0.58.8
  - @inkeep/agents-email@0.58.8
  - @inkeep/agents-mcp@0.58.8

## 0.58.7

### Patch Changes

- b1b440a: daisy chain trigger
  - @inkeep/agents-core@0.58.7
  - @inkeep/agents-email@0.58.7
  - @inkeep/agents-mcp@0.58.7
  - @inkeep/agents-work-apps@0.58.7

## 0.58.6

### Patch Changes

- a9c2857: bumping nango dependencies and adding posthog to mcpCatalog
- 16e5e8d: Fix mid-generation context compression: accurate context slicing across multiple compression cycles, improved distillation quality, and richer compression telemetry
- Updated dependencies [a9c2857]
- Updated dependencies [16e5e8d]
  - @inkeep/agents-work-apps@0.58.6
  - @inkeep/agents-core@0.58.6
  - @inkeep/agents-email@0.58.6
  - @inkeep/agents-mcp@0.58.6

## 0.58.5

### Patch Changes

- @inkeep/agents-core@0.58.5
- @inkeep/agents-email@0.58.5
- @inkeep/agents-mcp@0.58.5
- @inkeep/agents-work-apps@0.58.5

## 0.58.4

### Patch Changes

- f475d74: Fix GitHub MCP tool access to be project-scoped instead of globally scoped by toolId
- Updated dependencies [0451e1d]
- Updated dependencies [d7c1001]
- Updated dependencies [87ac81f]
- Updated dependencies [b6a126f]
- Updated dependencies [f475d74]
- Updated dependencies [2d6ec44]
  - @inkeep/agents-core@0.58.4
  - @inkeep/agents-work-apps@0.58.4
  - @inkeep/agents-email@0.58.4
  - @inkeep/agents-mcp@0.58.4

## 0.58.3

### Patch Changes

- 0714ac6: Add Slack MCP server with post-message tool for agent-to-Slack messaging
- 676d18b: Fix optional data component fields accepting null values in structured output validation
- Updated dependencies [0714ac6]
  - @inkeep/agents-work-apps@0.58.3
  - @inkeep/agents-core@0.58.3
  - @inkeep/agents-email@0.58.3
  - @inkeep/agents-mcp@0.58.3

## 0.58.2

### Patch Changes

- ee5b4c9: Add image persistence to conversation history
- eb5b16f: timeout recorded in spans
- 558e723: Refactor Agent.ts into focused domain modules (generation, streaming, tools, services) and reorganize run-domain utilities into artifacts, compression, session, and stream subdirectories
- ee5b4c9: Image security for chat API: URL validation, byte sniffing, format allowlist
- Updated dependencies [31c0f68]
- Updated dependencies [ee5b4c9]
- Updated dependencies [eb5b16f]
  - @inkeep/agents-core@0.58.2
  - @inkeep/agents-work-apps@0.58.2
  - @inkeep/agents-email@0.58.2
  - @inkeep/agents-mcp@0.58.2

## 0.58.1

### Patch Changes

- 9876f88: Add Sentry capability configuration to agents-api and modify create-agents template
  - @inkeep/agents-core@0.58.1
  - @inkeep/agents-email@0.58.1
  - @inkeep/agents-mcp@0.58.1
  - @inkeep/agents-work-apps@0.58.1

## 0.58.0

### Minor Changes

- 1abeeeb: Change tool approval response to support batch approvals (BREAKING: response shape changed from flat object to results array)

### Patch Changes

- 93f1265: Resolve user profile timezone for webhook and scheduled trigger executions
- Updated dependencies [3d88636]
  - @inkeep/agents-core@0.58.0
  - @inkeep/agents-work-apps@0.58.0
  - @inkeep/agents-email@0.58.0
  - @inkeep/agents-mcp@0.58.0

## 0.57.0

### Minor Changes

- 5bc298e: Add user profile support with timezone storage and profile settings page

### Patch Changes

- 31b5e8b: Fix tool approval denial reason not propagating to LLM or parent agent
- 95e2477: Fix provider-specific per-call options not being forwarded to AI SDK streamText calls
- Updated dependencies [5bc298e]
- Updated dependencies [95e2477]
  - @inkeep/agents-core@0.57.0
  - @inkeep/agents-work-apps@0.57.0
  - @inkeep/agents-email@0.57.0
  - @inkeep/agents-mcp@0.57.0

## 0.56.2

### Patch Changes

- @inkeep/agents-core@0.56.2
- @inkeep/agents-email@0.56.2
- @inkeep/agents-mcp@0.56.2
- @inkeep/agents-work-apps@0.56.2

## 0.56.1

### Patch Changes

- c620c02: Add copilot bypass for tenant/project access checks when INKEEP*COPILOT*\* env vars are configured
- a175379: Add hasErrors filter to traces page and fix agent.name span attribute
  - @inkeep/agents-core@0.56.1
  - @inkeep/agents-email@0.56.1
  - @inkeep/agents-mcp@0.56.1
  - @inkeep/agents-work-apps@0.56.1

## 0.56.0

### Minor Changes

- 06e8c12: Add user-scoped execution identity (runAsUserId) to webhook triggers

### Patch Changes

- Updated dependencies [06e8c12]
  - @inkeep/agents-core@0.56.0
  - @inkeep/agents-work-apps@0.56.0
  - @inkeep/agents-email@0.56.0
  - @inkeep/agents-mcp@0.56.0

## 0.55.3

### Patch Changes

- @inkeep/agents-core@0.55.3
- @inkeep/agents-email@0.55.3
- @inkeep/agents-mcp@0.55.3
- @inkeep/agents-work-apps@0.55.3

## 0.55.2

### Patch Changes

- add0b4b: Pass cron timezone to agent in scheduled trigger execution.
- 4414e25: Add email integration for BetterAuth callbacks (invitation and password reset emails via SMTP)
- Updated dependencies [4414e25]
  - @inkeep/agents-core@0.55.2
  - @inkeep/agents-work-apps@0.55.2
  - @inkeep/agents-email@0.55.2
  - @inkeep/agents-mcp@0.55.2

## 0.55.1

### Patch Changes

- 55eb8cb: debug 500 signoz errors and reduce timerange query
  - @inkeep/agents-core@0.55.1
  - @inkeep/agents-mcp@0.55.1
  - @inkeep/agents-work-apps@0.55.1

## 0.55.0

### Minor Changes

- 08d678d: Group MCP tools by server in system prompt using mcp_server blocks with server-level instructions; extract MCP connection management into AgentMcpManager

### Patch Changes

- Updated dependencies [08d678d]
  - @inkeep/agents-core@0.55.0
  - @inkeep/agents-work-apps@0.55.0
  - @inkeep/agents-mcp@0.55.0

## 0.54.0

### Minor Changes

- addc4a0: Move workspace default agent config from Nango metadata to PostgreSQL
- addc4a0: Remove denormalized agent names from Slack channel configs — resolve names at read time from manage DB, clean up orphaned configs on agent/project deletion, validate agent existence on write

### Patch Changes

- 00c21ec: Add artifact and tool result passing as tool arguments

  Agents can now pass saved artifacts directly to tools as arguments without reconstructing data manually. The system automatically resolves full artifact data — including non-preview fields — before the tool executes.

  Agents can also chain tool calls by passing the raw output of one tool directly into the next, with no artifact creation required for intermediate results. Primitive return types (strings, numbers, booleans) are fully supported for chaining.

- Updated dependencies [addc4a0]
- Updated dependencies [addc4a0]
  - @inkeep/agents-core@0.54.0
  - @inkeep/agents-work-apps@0.54.0
  - @inkeep/agents-mcp@0.54.0

## 0.53.13

### Patch Changes

- e915ef8: Fix MCP client TCP connection leak causing ephemeral port exhaustion
- 03629e8: Fix premature conversation compression when tool results are persisted as artifacts
- d62c5b0: Add support for passing artifacts as tool arguments
- Updated dependencies [e915ef8]
- Updated dependencies [23b6b48]
  - @inkeep/agents-core@0.53.13
  - @inkeep/agents-work-apps@0.53.13
  - @inkeep/agents-mcp@0.53.13

## 0.53.12

### Patch Changes

- 6762a28: Fix Agent Card 400 error caused by system identifiers in x-inkeep-run-as-user-id header (PRD-6187)
  - @inkeep/agents-core@0.53.12
  - @inkeep/agents-mcp@0.53.12
  - @inkeep/agents-work-apps@0.53.12

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
