# App Deployment Prompt

## 1. Problem Statement

**Situation:** Apps are deployment configurations that bind agents to surfaces (web widgets, APIs). The same agent definition can be deployed through multiple apps. Today, apps control *which* agent runs and *who* can access it, but not *how* the agent behaves in that context.

**Complication:** Customers want the same agent to behave differently depending on the deployment surface — e.g., a support agent on a docs site should be concise and link-heavy, while the same agent in an API integration should return structured data. Today, the only way to achieve this is duplicating the entire agent (and all its sub-agents, tools, and relations) per surface, creating maintenance burden and config drift.

**Resolution:** Add an optional `prompt` field to the app configuration. This prompt is injected as supplemental context into the agent's system prompt at runtime — a new `<app_context>` section — allowing surface-specific behavioral tuning without agent duplication.

## 2. Goals

1. Allow app creators to configure a supplemental prompt per app deployment
2. The app prompt supplements (never replaces) the agent's existing instructions
3. Minimal changes to the existing data model and runtime — additive only
4. Support `web_client` and `api` app types

## 3. Non-Goals

1. Override/replace agent or sub-agent prompts from the app level
2. Template variable support in app prompts (future work)
3. Work app (Slack, GitHub) prompt support (deferred — different config surfaces)
4. Per-sub-agent app prompts (the app prompt applies to all sub-agents uniformly)

## 4. Personas

| Persona | Motivation |
|---------|-----------|
| **Builder** (configures agents via manage UI/API) | Wants to deploy one agent to multiple surfaces with different behavioral tuning without duplicating config |
| **Platform User** (interacts via widget/API) | Expects coherent, surface-appropriate responses |

## 5. Current State

### App Data Model
- **Table**: `apps` (runtime PostgreSQL database)
- **Config**: `jsonb` column with discriminated union (`web_client` | `api`)
- **No prompt field exists** — apps only store: name, description, type, defaultAgentId, enabled, config (domain allowlist), timestamps

### System Prompt Assembly
The system prompt template (`templates/v1/prompt/system-prompt.xml`) assembles sections in order:
1. `<agent_identity>` — static base
2. `{{CURRENT_TIME_SECTION}}`
3. `{{SKILLS_SECTION}}`
4. `<core_instructions>` — sub-agent's prompt
5. `{{AGENT_CONTEXT_SECTION}}` — agent-level prompt
6. `{{ARTIFACTS_SECTION}}`
7. `{{TOOLS_SECTION}}`
8. `{{DATA_COMPONENTS_SECTION}}`
9. `<behavioral_constraints>` — security + interaction guidelines

### Threading Gap
The app object is resolved in `runAuth.ts` but only the `agentId` and metadata flow to the execution context. The app itself (and any future prompt field) is not available in the prompt builder. This is the main plumbing gap.

## 6. Target State

### Data Model Changes

**New column on `apps` table:**
```
prompt: text('prompt')  -- nullable, optional
```

This is a **top-level column**, not nested inside the `config` jsonb. Rationale: the prompt is not type-specific (both `web_client` and `api` use it the same way), and a top-level column is easier to query, validate, and migrate.

**Schema changes:**
- `AppInsertSchema` → add `prompt: z.string().optional()`
- `AppUpdateSchema` → inherits via `.partial()`
- `AppApiInsertSchema` / `AppApiUpdateSchema` → inherit automatically

### Runtime Threading

The app prompt must flow from auth → execution context → prompt builder:

```
runAuth.ts (resolves app)
  ↓ Sets metadata.appPrompt on BaseExecutionContext
generateTaskHandler.ts (creates agent config)
  ↓ Reads executionContext.metadata.appPrompt
system-prompt.ts:buildSystemPrompt()
  ↓ Passes appPrompt into SystemPromptV1 config
PromptConfig.ts:assemble()
  ↓ Renders {{APP_CONTEXT_SECTION}} in template
```

### System Prompt Template

New section after `{{AGENT_CONTEXT_SECTION}}`:

```xml
  {{AGENT_CONTEXT_SECTION}}
  {{APP_CONTEXT_SECTION}}        <!-- NEW -->
  {{ARTIFACTS_SECTION}}
```

The `<app_context>` section is omitted entirely when no app prompt is configured (same pattern as other optional sections).

### Prompt Assembly (`PromptConfig.ts`)

New method `generateAppContextSection(appPrompt?: string)` following the same pattern as `generateAgentContextSection()`:
- If `appPrompt` is present and non-empty → wrap in `<app_context>` tags
- If absent/empty → remove the placeholder from the template

## 7. Vertical Slice

### User Journey
1. Builder creates/updates an app via manage API, setting the `prompt` field
2. End user sends a chat request through that app
3. Auth middleware resolves the app and extracts the prompt
4. Prompt builder injects the app prompt as `<app_context>` in the system message
5. Agent responds with surface-appropriate behavior

### API Surface
- `POST /manage/.../apps` — accepts optional `prompt` field
- `PATCH /manage/.../apps/{id}` — accepts optional `prompt` field
- `GET /manage/.../apps/{id}` — returns `prompt` in response
- `GET /manage/.../apps` — returns `prompt` in list response

### Files Changed (estimated)

| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `prompt` column to `apps` table |
| `packages/agents-core/src/validation/schemas.ts` | Add `prompt` to insert/update schemas |
| `packages/agents-core/src/types/utility.ts` | Update `BaseExecutionContext.metadata` type |
| `agents-api/src/middleware/runAuth.ts` | Thread `app.prompt` into execution context metadata |
| `agents-api/src/domains/run/agents/types.ts` | Add `appPrompt?` to `SystemPromptV1` |
| `agents-api/src/domains/run/agents/generation/system-prompt.ts` | Pass `appPrompt` to config |
| `agents-api/src/domains/run/agents/versions/v1/PromptConfig.ts` | Render `{{APP_CONTEXT_SECTION}}` |
| `agents-api/templates/v1/prompt/system-prompt.xml` | Add `{{APP_CONTEXT_SECTION}}` placeholder |
| `drizzle/` | New migration for `prompt` column |

### UI Surface
- App create/edit form in manage UI should include a prompt textarea field

### Documentation
- Update app credentials docs to document the `prompt` field

## 8. Product Surface Area Impact

| Surface | Impact |
|---------|--------|
| **Manage API** (CRUD routes) | New optional field on create/update/read |
| **Manage UI** (app form) | New textarea field |
| **Runtime API** (chat completions) | Behavioral change — app prompt injected into system message |
| **SDK** (TypeScript) | Types regenerated from OpenAPI — additive field |
| **Docs** | Document the `prompt` field in app credentials docs |
| **Slack/GitHub work apps** | No impact (deferred) |

## 9. Internal Surface Area Impact

| Subsystem | Impact |
|-----------|--------|
| **Runtime DB schema** | New nullable column + migration |
| **Execution context** | New metadata field |
| **System prompt builder** | New template section + assembly logic |
| **Auth middleware** | Thread app prompt to context |
| **Tests** | New unit tests for prompt injection, existing app CRUD tests updated |

## 10. Decision Log

| # | Decision | Type | Status | Reversibility |
|---|----------|------|--------|---------------|
| D1 | App prompt is supplemental (append), never overrides agent instructions | Product | LOCKED | 1-way door (sets user expectation) |
| D2 | Scope to `web_client` and `api` app types only; work apps deferred | Product | LOCKED | Reversible (additive later) |
| D3 | New `<app_context>` section in system prompt after `agent_context` | Technical | LOCKED | Reversible (can move section) |
| D4 | `prompt` is a top-level column on `apps` table, not in `config` jsonb | Technical | DIRECTED | Reversible |
| D5 | Thread app prompt via `executionContext.metadata.appPrompt` | Technical | DIRECTED | Reversible |
| D6 | No character/token limit on app prompt — consistent with agent prompts | Technical | LOCKED | Reversible (can add limits later) |
| D7 | App prompt token count added to system prompt breakdown; no raw text in traces | Technical | LOCKED | Reversible |
| D8 | Field name is `prompt` — matches `agents.prompt` and `subAgents.prompt` naming | Product | LOCKED | 1-way door (API field name) |

## 11. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Should we support template variables (e.g., `{{endUserId}}`, `{{origin}}`) in app prompts? | Product | P2 | Deferred — additive, no architectural impact |
| OQ2 | Should there be a character/token limit on the app prompt? | Technical | P0 | **Resolved** — no limit, consistent with agent prompts (D6) |
| OQ3 | Should the app prompt be visible in traces/observability (e.g., as a span attribute)? | Technical | P0 | **Resolved** — token count in breakdown only, no raw text (D7) |
| OQ5 | Field name: `prompt`, `instructions`, or `additionalInstructions`? | Product | P0 | **Resolved** — `prompt`, consistent with agent/sub-agent naming (D8) |
| OQ4 | Should the manage UI show a preview of how the app prompt appears in the final system prompt? | Product | P2 | Deferred |

## 12. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | The `apps` table is in the runtime PostgreSQL DB, so adding a column requires a runtime DB migration (not a Doltgres manage migration) | HIGH | Verified — `runtime-schema.ts` line 163 |
| A2 | Adding `metadata.appPrompt` to `BaseExecutionContext` won't break existing consumers — metadata is already an optional bag | HIGH | Verified — metadata is `?` typed |
| A3 | The prompt template placeholder pattern (replace or remove section) is well-established in `PromptConfig.ts` | HIGH | Verified — same pattern for core_instructions, agent_context, skills, etc. |

## 13. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | App prompt conflicts with agent instructions (contradictory guidance) | Medium | Medium | Document that app prompt is supplemental; agent instructions take precedence in the template ordering |
| R2 | Large app prompts consume token budget, displacing conversation history | Low | Medium | Accepted risk — no limit for now (D6), consistent with agent prompts. Can add limits later if needed. |
| R3 | App prompt injection attacks (user who can edit apps injects malicious instructions) | Low | Low | App editors already have `edit` permission on the project — same trust level as editing agent prompts |

## 14. Future Work

| Item | Maturity | Notes |
|------|----------|-------|
| Template variables in app prompts | Identified | Could inject `{{endUserId}}`, `{{origin}}`, `{{appId}}` for dynamic personalization. No architectural blockers — `TemplateEngine.render()` already supports this pattern for agent prompts. |
| Work app (Slack/GitHub) prompts | Identified | Different config tables and CRUD surfaces. Same runtime injection pattern would apply. Needs its own scope pass. |
| Per-sub-agent app prompts | Noted | Would allow fine-grained tuning per sub-agent within an app. Significantly more complex (mapping app → sub-agent overrides). |
| App prompt preview in manage UI | Noted | Show builders what the final system prompt looks like with their app prompt injected. |

## 15. Acceptance Criteria

1. **CRUD**: App `prompt` field can be set on create, updated on patch, returned on get/list, and set to null to clear
2. **Runtime injection**: When a chat request comes through an app with a prompt, the system prompt includes an `<app_context>` section with the app's prompt text
3. **No prompt = no section**: When an app has no prompt (null/empty), the `<app_context>` section is omitted entirely from the system prompt
4. **Supplemental only**: The app prompt never replaces or modifies the agent's `<core_instructions>` or `<agent_context>` sections
5. **Tests**: Unit tests cover prompt injection, empty prompt handling, and CRUD operations
6. **Migration**: Runtime DB migration adds the `prompt` column as nullable text
7. **Observability**: App prompt token count appears in system prompt breakdown logging (no raw text in traces)

## 16. Agent Constraints

**SCOPE:**
- `packages/agents-core/src/db/runtime/runtime-schema.ts` — add column
- `packages/agents-core/src/validation/schemas.ts` — update app schemas
- `packages/agents-core/src/types/utility.ts` — update execution context metadata type
- `agents-api/src/middleware/runAuth.ts` — thread app prompt
- `agents-api/src/domains/run/agents/types.ts` — update SystemPromptV1
- `agents-api/src/domains/run/agents/generation/system-prompt.ts` — pass app prompt
- `agents-api/src/domains/run/agents/versions/v1/PromptConfig.ts` — render section
- `agents-api/templates/v1/prompt/system-prompt.xml` — add placeholder
- `drizzle/` — migration file
- `agents-manage-ui/src/components/` — app form update
- `agents-docs/` — app credentials doc update

**EXCLUDE:**
- Work app configs (`work_app_slack_*`, `work_app_github_*` tables)
- Agent or sub-agent prompt fields
- Template engine changes
- Context resolver changes

**STOP_IF:**
- Migration would require downtime or data backfill
- Changes to `BaseExecutionContext` break type compatibility
- App prompt needs to vary per sub-agent (requires different design)

**ASK_FIRST:**
- Any changes to the system prompt template beyond adding the `{{APP_CONTEXT_SECTION}}` placeholder
- Any changes to the auth middleware beyond reading `app.prompt` and setting metadata
