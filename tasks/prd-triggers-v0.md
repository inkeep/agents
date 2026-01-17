# PRD: Triggers V0 (MVP)

## Introduction

Triggers are wrappers around Agents that enable webhook-based invocation for non-monitored tasks. Third-party services (Slack, GitHub, Stripe, etc.) send webhook payloads with predefined schemas, and Triggers transform these payloads into agent invocations via the `/api/chat` endpoint (Vercel AI SDK style).

This is a **non-AI transformation layer**—Triggers use JSON transformation (JMESPath via the existing `JsonTransformer` utility) to map incoming webhook payloads to chat API requests. Each Trigger invocation creates a new conversation scoped to a single Agent.

**Relationship:** Many Triggers → One Agent (many-to-one)

## Goals

- Enable webhook-based agent invocation from third-party services
- Provide flexible input validation via JSON Schema
- Transform webhook payloads to chat API payloads using existing `JsonTransformer`
- Support template interpolation for constructing the initial message
- Offer multiple authentication options for securing webhook endpoints
- Fire-and-forget execution model (no response handling in V0)
- Provide SDK support via `@inkeep/agents-sdk` for programmatic trigger definition
- Enable invocation history viewing for debugging webhook integrations

## User Stories

### US-001: Create Trigger database schema
**Description:** As a developer, I need database tables to store Trigger configurations so they persist and can be managed.

**Acceptance Criteria:**
- [ ] Create `triggers` table with columns: id, tenantId, projectId, agentId, name, description, enabled, inputSchema (jsonb), outputTransform (jsonb), messageTemplate (text), authentication (jsonb), signingSecret (text, nullable), createdAt, updatedAt
- [ ] Create `trigger_invocations` table with columns: id, triggerId, tenantId, projectId, agentId, conversationId (nullable), status ('pending' | 'success' | 'failed'), requestPayload (jsonb), transformedPayload (jsonb, nullable), errorMessage (text, nullable), createdAt
- [ ] Add foreign key constraints: triggers → agents (cascade delete), trigger_invocations → triggers (cascade delete)
- [ ] No unique constraint on name (names are not unique; search is out of scope)
- [ ] Add index on trigger_invocations(triggerId, createdAt) for efficient listing
- [ ] Generate and run migration successfully
- [ ] Typecheck passes

### US-002: Create Trigger data access layer
**Description:** As a developer, I need CRUD operations for Triggers and Trigger Invocations following existing data-access patterns.

**Acceptance Criteria:**
- [ ] Create `triggers.ts` in `packages/agents-core/src/data-access/manage/`
- [ ] Implement `createTrigger`, `getTriggerById`, `updateTrigger`, `deleteTrigger`, `listTriggersPaginated`
- [ ] Create `triggerInvocations.ts` in `packages/agents-core/src/data-access/manage/`
- [ ] Implement `createTriggerInvocation`, `getTriggerInvocationById`, `listTriggerInvocationsPaginated`, `updateTriggerInvocationStatus`
- [ ] Follow existing curried function pattern: `(db) => async (params) => ...`
- [ ] Scope all queries by tenantId and projectId
- [ ] Export from data-access index
- [ ] Write unit tests for all CRUD operations (create, read, update, delete, list)
- [ ] Write unit tests for invocation status transitions
- [ ] Tests pass
- [ ] Typecheck passes

### US-003: Define Trigger Zod schemas
**Description:** As a developer, I need Zod schemas for Trigger and Trigger Invocation validation in API routes.

**Acceptance Criteria:**
- [ ] Create `TriggerSchema` with all fields from database schema
- [ ] Create `TriggerInsertSchema` for creation (omit id, timestamps)
- [ ] Create `TriggerUpdateSchema` for updates (all fields optional except id)
- [ ] Create `TriggerAuthenticationSchema` supporting: `api_key`, `basic_auth`, `bearer_token`, `none`
- [ ] Create `TriggerOutputTransformSchema` with `jmespath` and/or `objectTransformation` fields
- [ ] Create `TriggerInvocationSchema` with all fields from invocations table
- [ ] Create `TriggerInvocationStatusEnum` with values: `pending`, `success`, `failed`
- [ ] Write unit tests for schema validation (valid and invalid inputs for each schema)
- [ ] Write unit tests for each authentication type schema
- [ ] Tests pass
- [ ] Typecheck passes

### US-004: Implement webhook endpoint for Trigger invocation
**Description:** As an external service, I want to POST to a webhook URL so that an agent is invoked with my payload.

**Acceptance Criteria:**
- [ ] Create `POST /tenants/:tenantId/projects/:projectId/agents/:agentId/triggers/:triggerId` endpoint in agents-run-api
- [ ] Validate incoming request against Trigger's `inputSchema` (JSON Schema validation)
- [ ] Return 400 with validation errors if input schema fails
- [ ] Return 404 if trigger not found or disabled
- [ ] Return 401/403 if authentication fails
- [ ] Return 202 Accepted on successful invocation (fire-and-forget)
- [ ] Write integration tests for webhook endpoint (success path, 400, 401, 403, 404 responses)
- [ ] Write integration test for disabled trigger returning 404
- [ ] Tests pass
- [ ] Typecheck passes

### US-005: Implement webhook authentication verification
**Description:** As a platform, I need to verify incoming webhook requests using the configured authentication method.

**Acceptance Criteria:**
- [ ] Support `api_key` auth: verify header name contains expected value
- [ ] Support `basic_auth`: verify Authorization header with base64(username:password)
- [ ] Support `bearer_token`: verify Authorization: Bearer <token>
- [ ] Support `none`: skip authentication (allow all requests)
- [ ] Implement signing secret verification (HMAC-SHA256 of request body)
- [ ] Return 401 for missing credentials, 403 for invalid credentials
- [ ] Write unit tests for each authentication type (valid and invalid credentials)
- [ ] Write unit tests for signing secret verification (valid signature, invalid signature, missing signature)
- [ ] Tests pass
- [ ] Typecheck passes

### US-006: Implement input transformation using JsonTransformer
**Description:** As a platform, I need to transform the incoming webhook payload to match the chat API payload structure.

**Acceptance Criteria:**
- [ ] Use existing `JsonTransformer.transformWithConfig()` for transformation
- [ ] Support both `jmespath` and `objectTransformation` config patterns
- [ ] Handle transformation errors gracefully (return 422 with error details)
- [ ] Validate transformed output has required chat API fields
- [ ] Write unit tests for JMESPath transformation with various expressions
- [ ] Write unit tests for objectTransformation pattern
- [ ] Write unit tests for transformation error handling
- [ ] Tests pass
- [ ] Typecheck passes

### US-007: Implement message template interpolation
**Description:** As a trigger creator, I want to define a message template with placeholders so the initial message is dynamically constructed from the transformed payload.

**Acceptance Criteria:**
- [ ] Support `{{path.to.value}}` placeholder syntax in messageTemplate
- [ ] Resolve placeholders from transformed payload using dot notation
- [ ] Handle missing values gracefully (empty string or configurable default)
- [ ] Support nested paths: `{{user.profile.name}}`
- [ ] Escape special characters in resolved values
- [ ] Write unit tests for placeholder resolution (simple paths, nested paths, arrays)
- [ ] Write unit tests for missing value handling
- [ ] Write unit tests for special character escaping
- [ ] Tests pass
- [ ] Typecheck passes

### US-008: Invoke agent via /api/chat endpoint
**Description:** As a platform, I need to invoke the agent's chat endpoint with the transformed payload using the Vercel AI SDK style `/api/chat` pattern.

**Acceptance Criteria:**
- [ ] Create new conversation for each trigger invocation
- [ ] Construct request payload matching `/api/chat` format: `{ messages: [{ role: 'user', content: interpolatedMessage }] }`
- [ ] Call `/api/chat` endpoint internally (HTTP call to run-api or direct function invocation)
- [ ] Pass agent context (tenantId, projectId, agentId) in request
- [ ] Use agent's default subAgent as entry point
- [ ] Fire-and-forget: do not wait for streaming response to complete
- [ ] Log invocation for debugging/audit (triggerId, conversationId, timestamp)
- [ ] Write integration tests for successful agent invocation (conversation created, invocation logged)
- [ ] Write integration tests for invocation failure handling (invocation marked as failed)
- [ ] Tests pass
- [ ] Typecheck passes

### US-009: Create Trigger management API endpoints
**Description:** As an admin, I want CRUD endpoints for managing Triggers in the manage-api.

**Acceptance Criteria:**
- [ ] `POST /projects/:projectId/agents/:agentId/triggers` - Create trigger
- [ ] `GET /projects/:projectId/agents/:agentId/triggers` - List triggers (paginated)
- [ ] `GET /projects/:projectId/agents/:agentId/triggers/:triggerId` - Get trigger by ID
- [ ] `PATCH /projects/:projectId/agents/:agentId/triggers/:triggerId` - Update trigger
- [ ] `DELETE /projects/:projectId/agents/:agentId/triggers/:triggerId` - Delete trigger
- [ ] All endpoints require appropriate permissions
- [ ] Return webhook URL in response: `webhookUrl` field (fully qualified with tenant/project/agent/trigger path)
- [ ] Write integration tests for all CRUD endpoints (create, list, get, update, delete)
- [ ] Write integration tests for permission checks (unauthorized access returns 403)
- [ ] Write integration tests for webhookUrl generation
- [ ] Tests pass
- [ ] Typecheck passes

### US-010: Add Trigger UI to manage dashboard
**Description:** As an admin, I want to create and manage Triggers in the dashboard UI.

**Acceptance Criteria:**
- [ ] Add "Triggers" section under Agent detail page
- [ ] List view showing all triggers for an agent (name, enabled status, webhook URL)
- [ ] Create trigger form with: name, description, input schema editor, output transform editor, message template editor, authentication config (agent is implicit from context)
- [ ] Edit trigger form (same fields)
- [ ] Delete trigger with confirmation
- [ ] Copy webhook URL button
- [ ] Toggle enabled/disabled status
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Create Trigger Invocation API endpoints
**Description:** As an admin, I want API endpoints to view trigger invocation history for debugging purposes.

**Acceptance Criteria:**
- [ ] `GET /projects/:projectId/agents/:agentId/triggers/:triggerId/invocations` - List invocations (paginated, newest first)
- [ ] `GET /projects/:projectId/agents/:agentId/triggers/:triggerId/invocations/:invocationId` - Get single invocation details
- [ ] Support filtering by status query param (`?status=success|failed|pending`)
- [ ] Support date range filtering (`?from=ISO8601&to=ISO8601`)
- [ ] Include request payload and transformed payload in response
- [ ] All endpoints require appropriate permissions
- [ ] Write integration tests for list endpoint (pagination, ordering)
- [ ] Write integration tests for status filtering
- [ ] Write integration tests for date range filtering
- [ ] Tests pass
- [ ] Typecheck passes

### US-012: Add Trigger Invocation UI
**Description:** As an admin, I want to view trigger invocation history in the dashboard for debugging webhook integrations.

**Acceptance Criteria:**
- [ ] Add "Invocations" tab/section within Trigger detail view
- [ ] List view showing recent invocations: timestamp, status (color-coded badge), conversationId (if available)
- [ ] Click invocation to expand/view details: request payload (JSON viewer), transformed payload (JSON viewer), error message (if failed)
- [ ] Filter by status (All | Success | Failed | Pending)
- [ ] Pagination or infinite scroll for history
- [ ] Link to conversation if conversationId exists
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Create Trigger class in SDK
**Description:** As an SDK user, I want a `Trigger` class to define webhook triggers programmatically.

**Acceptance Criteria:**
- [ ] Create `trigger.ts` in `packages/agents-sdk/src/`
- [ ] Implement `Trigger` class with config: id, name, description, enabled, inputSchema, outputTransform, messageTemplate, authentication, signingSecret
- [ ] Implement `getId()`, `getName()`, `getConfig()` methods following existing patterns
- [ ] Implement `with()` method for configuration overrides (e.g., `trigger.with({ enabled: false })`)
- [ ] Export `TriggerInterface` type for use in agent configuration
- [ ] Write unit tests for Trigger class instantiation and methods
- [ ] Write unit tests for `with()` method returning new instance with overrides
- [ ] Tests pass
- [ ] Typecheck passes

### US-014: Create trigger() builder function in SDK
**Description:** As an SDK user, I want a `trigger()` builder function to create triggers with a clean API.

**Acceptance Criteria:**
- [ ] Add `trigger()` function to `builderFunctions.ts`
- [ ] Accept `TriggerConfig` with: id (required), name, description, inputSchema (Zod schema or JSON Schema object), outputTransform (jmespath string or object transformation), messageTemplate (string with `{{placeholder}}` syntax), authentication, signingSecret
- [ ] Auto-generate id from name using `generateIdFromName()` if id not provided
- [ ] Support Zod schemas for inputSchema (convert to JSON Schema internally via `zod-to-json-schema`)
- [ ] Export from package index
- [ ] Write unit tests for trigger() builder function
- [ ] Write unit tests for id auto-generation from name
- [ ] Write unit tests for Zod schema to JSON Schema conversion
- [ ] Tests pass
- [ ] Typecheck passes

### US-015: Attach triggers to agents in SDK
**Description:** As an SDK user, I want to attach triggers to agents using the familiar getter pattern.

**Acceptance Criteria:**
- [ ] Add `triggers?: () => TriggerInterface[]` to `AgentConfig` type in `types.ts`
- [ ] Add `getTriggers(): Record<string, Trigger>` method to `Agent` class
- [ ] Add `addTrigger(...triggers: TriggerInterface[])` method for runtime additions
- [ ] Resolve triggers lazily using existing `resolveGetter()` helper
- [ ] Write unit tests for agent with triggers via config
- [ ] Write unit tests for getTriggers() returning correct record
- [ ] Write unit tests for addTrigger() runtime additions
- [ ] Tests pass
- [ ] Typecheck passes

### US-016: Serialize triggers in SDK toFullAgentDefinition
**Description:** As an SDK user, I want triggers to be included when the agent definition is serialized for the API.

**Acceptance Criteria:**
- [ ] Add `triggers` field to `FullAgentDefinition` type
- [ ] Include triggers in `Agent.toFullAgentDefinition()` output
- [ ] Convert Zod inputSchema to JSON Schema during serialization
- [ ] Generate webhook URL template in serialized output: `webhookUrlTemplate` field
- [ ] Write unit tests for toFullAgentDefinition() including triggers
- [ ] Write unit tests for Zod to JSON Schema conversion during serialization
- [ ] Write unit tests for webhookUrlTemplate generation
- [ ] Tests pass
- [ ] Typecheck passes

### US-017: Add SDK trigger types to agents-core
**Description:** As a developer, I need the trigger types from the SDK to be compatible with the backend API types.

**Acceptance Criteria:**
- [ ] Export `TriggerConfig`, `TriggerInterface` types from SDK
- [ ] Ensure SDK trigger serialization matches `TriggerInsertSchema` in agents-core
- [ ] Add conversion utilities if needed for schema format differences
- [ ] Typecheck passes

## Functional Requirements

- **FR-1:** The system must validate incoming webhook payloads against the Trigger's configured JSON Schema (`inputSchema`)
- **FR-2:** The system must transform valid payloads using JMESPath expressions via `JsonTransformer`
- **FR-3:** The system must interpolate `{{placeholder}}` values in the message template from the transformed payload
- **FR-4:** The system must support four authentication types: `api_key`, `basic_auth`, `bearer_token`, and `none`
- **FR-5:** The system must support optional HMAC-SHA256 signing secret verification for webhook integrity
- **FR-6:** The system must create a new conversation for each trigger invocation
- **FR-7:** The system must invoke the agent via `/api/chat` endpoint with the constructed message (Vercel AI SDK style)
- **FR-8:** The system must return 202 Accepted immediately (fire-and-forget)
- **FR-9:** The system must persist all trigger invocations to the database with: triggerId, conversationId, timestamp, status, request payload, transformed payload, and error message (if applicable)
- **FR-10:** Trigger names are not required to be unique (search/filtering by name is out of scope)
- **FR-11:** The system must allow enabling/disabling triggers without deletion
- **FR-12:** The system must cascade delete triggers when parent agent is deleted
- **FR-13:** The system must provide API endpoints to list and view trigger invocation history
- **FR-14:** The system must cascade delete invocations when parent trigger is deleted
- **FR-15:** The SDK must provide a `trigger()` builder function for defining triggers programmatically
- **FR-16:** The SDK must support attaching triggers to agents via the `triggers` getter pattern
- **FR-17:** The SDK must serialize triggers in `toFullAgentDefinition()` for API submission
- **FR-18:** The SDK must support Zod schemas for inputSchema validation (converted to JSON Schema)

## Non-Goals (Out of Scope for V0)

- **No queuing/job system** - Invocations are synchronous fire-and-forget (queuing is future work)
- **No response handling** - Agent responses are not captured, transformed, or forwarded
- **No callback webhooks** - No outgoing webhooks to notify of completion
- **No retry logic** - Failed invocations are not retried
- **No rate limiting** - No per-trigger or per-agent rate limits
- **No scheduled/cron triggers** - Only webhook-based invocation
- **No batch invocation** - One webhook = one conversation
- **No conditional routing** - Cannot route to different subAgents based on payload
- **No invocation log retention policy** - Logs are kept indefinitely (retention is future work)
- **No trigger search** - No search/filter by trigger name or other fields (list by agent only)

## Technical Considerations

### Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `JsonTransformer` | `packages/agents-core/src/utils/JsonTransformer.ts` | Payload transformation |
| `createConversation` | `packages/agents-core/src/data-access/run/conversations.ts` | New conversation creation |
| `/api/chat` endpoint | `agents-run-api/src/routes/chat.ts` | Agent invocation (Vercel AI SDK style) |
| Hono + Zod OpenAPI | Existing API patterns | Endpoint definitions |
| Permission middleware | `agents-manage-api/src/middleware/` | Auth for manage endpoints |
| SDK builder pattern | `packages/agents-sdk/src/builderFunctions.ts` | trigger() builder function |
| SDK Agent class | `packages/agents-sdk/src/agent.ts` | triggers getter attachment |

### SDK Usage Example

```typescript
import { agent, subAgent, trigger } from '@inkeep/agents-sdk';
import { z } from 'zod';

// Define a trigger with Zod schema for input validation
const githubIssueTrigger = trigger({
  id: 'github-issue-trigger',
  name: 'GitHub Issue Created',
  description: 'Triggered when a new GitHub issue is created',
  inputSchema: z.object({
    action: z.literal('opened'),
    issue: z.object({
      number: z.number(),
      title: z.string(),
      body: z.string().nullable(),
      user: z.object({
        login: z.string(),
      }),
    }),
    repository: z.object({
      full_name: z.string(),
    }),
  }),
  outputTransform: {
    issueNumber: 'issue.number',
    issueTitle: 'issue.title',
    issueBody: 'issue.body',
    author: 'issue.user.login',
    repo: 'repository.full_name',
  },
  messageTemplate: `New GitHub issue #{{issueNumber}} in {{repo}} by {{author}}:

**{{issueTitle}}**

{{issueBody}}`,
  authentication: {
    type: 'none', // GitHub uses signing secret instead
  },
  signingSecret: process.env.GITHUB_WEBHOOK_SECRET,
});

// Attach trigger to an agent
const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: subAgent({
    id: 'triage-agent',
    name: 'Issue Triage',
    prompt: 'You help triage incoming support issues...',
  }),
  triggers: () => [githubIssueTrigger],
});
```

### Database Schema

```sql
CREATE TABLE triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  input_schema JSONB, -- JSON Schema for validation
  output_transform JSONB, -- {jmespath?: string, objectTransformation?: Record<string,string>}
  message_template TEXT NOT NULL, -- "User {{user.name}} said: {{message}}"
  authentication JSONB, -- {type: 'api_key'|'basic_auth'|'bearer_token'|'none', data: {...}}
  signing_secret TEXT, -- HMAC-SHA256 secret for webhook verification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_triggers_agent ON triggers(agent_id);
CREATE INDEX idx_triggers_project ON triggers(tenant_id, project_id);

CREATE TABLE trigger_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  conversation_id UUID, -- nullable: only set on successful invocation
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed'
  request_payload JSONB NOT NULL, -- original webhook payload
  transformed_payload JSONB, -- result after JMESPath transformation (nullable if transform fails)
  error_message TEXT, -- error details if status = 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trigger_invocations_trigger ON trigger_invocations(trigger_id, created_at DESC);
CREATE INDEX idx_trigger_invocations_status ON trigger_invocations(trigger_id, status);
```

### Authentication Schema

```typescript
type TriggerAuthentication =
  | { type: 'api_key'; data: { name: string; value: string }; add_position: 'header' }
  | { type: 'basic_auth'; data: { username: string; password: string }; add_position: 'header' }
  | { type: 'bearer_token'; data: { token: string }; add_position: 'header' }
  | { type: 'none' };
```

### Webhook URL Format

```
POST https://{run-api-domain}/tenants/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/{triggerId}
```

This fully-scoped URL structure:
- Enables validation that the trigger belongs to the specified agent/project/tenant
- Supports future multi-tenant routing decisions
- Makes the resource hierarchy explicit in the URL

### Message Template Interpolation

```typescript
// Input template
"New issue from {{user.name}}: {{issue.title}}\n\nDescription: {{issue.body}}"

// Transformed payload
{ user: { name: "Alice" }, issue: { title: "Bug report", body: "App crashes on login" } }

// Resulting message
"New issue from Alice: Bug report\n\nDescription: App crashes on login"
```

### Signing Secret Verification

```typescript
// Webhook sends header: X-Signature-256: sha256=<hex-digest>
const expectedSignature = crypto
  .createHmac('sha256', trigger.signingSecret)
  .update(requestBody)
  .digest('hex');

const isValid = crypto.timingSafeEqual(
  Buffer.from(providedSignature),
  Buffer.from(`sha256=${expectedSignature}`)
);
```

## Success Metrics

- Triggers can be created, updated, and deleted via API and UI
- Webhook payloads are validated against input schema with clear error messages
- Payloads are successfully transformed and interpolated into agent messages
- All four authentication types work correctly
- Signing secret verification prevents tampered requests
- Agent invocations complete successfully (conversation created, message sent)
- Webhook endpoint returns 202 within 500ms (before agent execution)
- Invocation history is viewable in UI with request/response payloads for debugging
- SDK users can define triggers with Zod schemas and attach them to agents
- SDK triggers serialize correctly and create triggers via the API when agents are deployed

## Open Questions

1. **Sensitive data:** Should authentication credentials be encrypted at rest? (Currently stored in JSONB)
2. **Conversation metadata:** Should trigger invocations tag conversations with trigger source for filtering?
3. **Error notifications:** Should failed trigger invocations notify admins? (Out of scope for V0, but design consideration)
4. **Payload size limits:** Should we limit the size of request/transformed payloads stored in the database?
