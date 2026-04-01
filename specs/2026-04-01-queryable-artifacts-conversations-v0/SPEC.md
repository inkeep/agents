# SPEC: Queryable Artifacts & Conversations (V0)

## 1. Problem Statement

**Situation:** Inkeep agents produce artifacts (tool results) and have conversations with users. Artifacts already have LLM-generated names and descriptions. Conversations have no auto-generated titles or summaries.

**Complication:** There are no API endpoints to list or retrieve individual artifacts. Conversation list endpoints lack `agentId` filtering and `summary` in the response. Conversation titles are only computed at read-time as a fallback (first 100 chars of first user message). There's no mechanism to generate conversation titles or summaries.

**Resolution:** Add list + get endpoints for artifacts (mirroring conversation APIs). Add `agentId` filter and `summary` to conversation list endpoints. Unify artifact and conversation metadata generation into a shared module. Generate conversation title + summary on every turn (LLM decides whether to update).

---

## 2. Decisions Log

| # | Decision | Status | Type |
|---|----------|--------|------|
| D1 | V0 scope: list + get endpoints with filters. No full-text search indexes, no tsvector, no ranking algorithms. | LOCKED | Product |
| D2 | "Search" = list endpoint returning id, name/title, summary with optional filters (agentId, userId, conversationId). Agent can grep/navigate results itself. | LOCKED | Product |
| D3 | Add `summary` column to `conversations` table. No changes to `ledgerArtifacts` (already has name, description, summary). | LOCKED | Technical |
| D4 | Unified metadata generation module following compressor pattern: `BaseMetadataGenerator` → `ArtifactMetadataGenerator` / `ConversationMetadataGenerator`. | LOCKED | Technical |
| D5 | Conversation metadata generation triggered every assistant message. LLM decides whether to update via `shouldUpdate` boolean. Fire-and-forget. | LOCKED | Technical |
| D6 | Artifact list filtered by userId/agentId via inner join to conversations table (artifacts link to conversations via `contextId`). | LOCKED | Technical |
| D7 | Authorization: Run API = end-user sees own only (JWT sub). Manage API = admin sees all in project, optional userId/agentId filters. | LOCKED | Product |

---

## 3. Schema Changes

### 3.1 Add `summary` to `conversations` table

```typescript
// packages/agents-core/src/db/runtime/runtime-schema.ts (~line 118, next to existing `title`)

export const conversations = pgTable(
  'conversations',
  {
    // ... existing fields ...
    title: text('title'),
    summary: text('summary'),    // NEW: auto-generated conversation summary
    // ... rest of fields ...
  },
  // ... indexes unchanged
);
```

One Drizzle migration via `pnpm db:generate`.

### 3.2 No changes to `ledgerArtifacts`

Already has: `name` (varchar 256, nullable), `description` (text, nullable), `summary` (text, nullable, auto-truncated from description at insert time).

`contextId` already serves as `conversationId` (FK to conversations exists).

---

## 4. Unified Metadata Generation Module

### 4.1 Motivation

Artifact metadata generation currently lives as a ~500-line private method `processArtifact()` in `AgentSession` (lines 1368-1898). It handles model resolution, retry logic, telemetry, prompt construction, and persistence — all tightly coupled.

Conversation metadata generation needs the same infrastructure (model resolution, retry, telemetry, fire-and-forget). Rather than duplicating, extract into a shared module following the compressor pattern (`BaseCompressor` → `MidGenerationCompressor` / `ConversationCompressor`).

### 4.2 Module Structure

```
agents-api/src/domains/run/metadata/
  BaseMetadataGenerator.ts          -- abstract base: model resolution, retry, telemetry
  ArtifactMetadataGenerator.ts      -- artifact-specific: prompt, schema, save, uniqueness
  ConversationMetadataGenerator.ts  -- conversation-specific: prompt, schema, shouldUpdate
  types.ts                          -- shared types
  index.ts                          -- exports
```

### 4.3 BaseMetadataGenerator (abstract)

Extracts shared concerns from `AgentSession.processArtifact()`:

```typescript
// agents-api/src/domains/run/metadata/BaseMetadataGenerator.ts

export interface MetadataGeneratorConfig {
  sessionId: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  subAgentId?: string;
  conversationId: string;
  summarizerModel?: ModelSettings;
  baseModel?: ModelSettings;
  executionContext: ExecutionContext;
}

export abstract class BaseMetadataGenerator<TResult> {
  protected config: MetadataGeneratorConfig;

  constructor(config: MetadataGeneratorConfig) {
    this.config = config;
  }

  // Shared: model resolution chain (summarizerModel → baseModel → sub-agent model → undefined)
  // Extracted from AgentSession.processArtifact() lines 1528-1576
  protected resolveModel(): ModelSettings | undefined { ... }

  // Shared: generateText with retry (3 attempts, exponential backoff)
  // Extracted from AgentSession.processArtifact() lines 1684-1769
  protected async generateWithRetry(prompt: string, schema: ZodSchema): Promise<TResult> { ... }

  // Shared: telemetry span creation and tracking
  protected createSpan(name: string, attributes: Record<string, unknown>): Span { ... }

  // Template method: orchestrates the full generation flow
  async generate(context: TContext): Promise<void> {
    const model = this.resolveModel();
    if (!model) {
      await this.saveFallback(context);
      return;
    }
    const prompt = this.buildPrompt(context);
    const schema = this.getSchema();
    const result = await this.generateWithRetry(prompt, schema);
    await this.processAndSave(result, context);
  }

  // Abstract methods — subclasses implement
  abstract buildPrompt(context: TContext): string;
  abstract getSchema(): ZodSchema<TResult>;
  abstract getGenerationType(): string;
  abstract processAndSave(result: TResult, context: TContext): Promise<void>;
  abstract saveFallback(context: TContext): Promise<void>;
}
```

### 4.4 ArtifactMetadataGenerator

Extracted from `AgentSession.processArtifact()` lines 1368-1898. Zero behavior change — same prompt, same schema, same save logic, same uniqueness check, same fallback.

```typescript
// agents-api/src/domains/run/metadata/ArtifactMetadataGenerator.ts

interface ArtifactMetadataContext {
  artifactData: ArtifactSavedData;
  existingNames: string[];
  lastUserMessage: string | null;
  conversationHistory: string;
  toolContext?: { toolName: string; args: unknown };
  artifactService: ArtifactService;
}

export class ArtifactMetadataGenerator extends BaseMetadataGenerator<{
  name: string;
  description: string;
}> {
  getGenerationType(): string {
    return GENERATION_TYPES.ARTIFACT_METADATA;
  }

  getSchema() {
    return z.object({
      name: z.string().describe('Concise, descriptive name for the artifact'),
      description: z.string().describe("Brief description of the artifact's relevance"),
    });
  }

  buildPrompt(ctx: ArtifactMetadataContext): string {
    // Existing prompt from lines 1623-1655 — unchanged
  }

  async processAndSave(result, ctx: ArtifactMetadataContext): Promise<void> {
    // Name uniqueness check (lines 1773-1792)
    // Save via artifactService.saveArtifact() (line 1799)
    // Fallback save on failure (lines 1835-1889)
  }

  async saveFallback(ctx: ArtifactMetadataContext): Promise<void> {
    // Generic name from artifact type + toolCallId suffix (lines 1580-1586)
  }
}
```

### 4.5 ConversationMetadataGenerator

```typescript
// agents-api/src/domains/run/metadata/ConversationMetadataGenerator.ts

interface ConversationMetadataContext {
  existingTitle: string | null;
  existingSummary: string | null;
  recentMessages: FormattedMessage[];  // last 10 messages
  db: AgentsRunDatabaseClient;
  scopes: ProjectScopeConfig;
  conversationId: string;
}

export class ConversationMetadataGenerator extends BaseMetadataGenerator<{
  title: string;
  summary: string;
  shouldUpdate: boolean;
}> {
  getGenerationType(): string {
    return GENERATION_TYPES.CONVERSATION_METADATA;  // new constant
  }

  getSchema() {
    return z.object({
      title: z.string().describe('Concise conversation title, max 80 chars'),
      summary: z.string().describe('Brief conversation summary, max 200 chars'),
      shouldUpdate: z.boolean().describe(
        'true if title/summary should be updated because the conversation topic has meaningfully shifted. ' +
        'false if the existing title and summary still accurately capture the conversation.'
      ),
    });
  }

  buildPrompt(ctx: ConversationMetadataContext): string {
    const formattedMessages = ctx.recentMessages
      .map(m => `${m.role}: ${extractText(m.content)}`)
      .join('\n');

    return `You are generating metadata for a conversation.

Current title: ${ctx.existingTitle || 'None'}
Current summary: ${ctx.existingSummary || 'None'}

Recent conversation:
${formattedMessages}

Generate a title (max 80 chars) and summary (max 200 chars) for this conversation.
If the current title and summary still accurately capture the conversation's topic and spirit, set shouldUpdate to false and return them unchanged.
Only update when the conversation has meaningfully shifted direction or covered substantial new ground.`;
  }

  async processAndSave(result, ctx: ConversationMetadataContext): Promise<void> {
    if (!result.shouldUpdate) return;  // LLM decided no update needed

    await updateConversation(ctx.db)({
      scopes: ctx.scopes,
      conversationId: ctx.conversationId,
      data: {
        title: result.title,
        summary: result.summary,
      },
    });
  }

  async saveFallback(ctx: ConversationMetadataContext): Promise<void> {
    // If no model available AND no title exists, use first user message fallback
    // (existing behavior from run routes, now persisted)
    if (!ctx.existingTitle && ctx.recentMessages.length > 0) {
      const firstUserMsg = ctx.recentMessages.find(m => m.role === 'user');
      if (firstUserMsg) {
        const text = extractText(firstUserMsg.content);
        if (text) {
          const title = text.length > 100 ? `${text.slice(0, 100)}...` : text;
          await updateConversation(ctx.db)({
            scopes: ctx.scopes,
            conversationId: ctx.conversationId,
            data: { title },
          });
        }
      }
    }
  }
}
```

### 4.6 Trigger Integration

**Artifacts:** `AgentSession.processArtifact()` delegates to `ArtifactMetadataGenerator.generate()`. Same fire-and-forget pattern. Zero behavior change.

**Conversations:** triggered every assistant message completion in execution handler:

```typescript
// agents-api/src/domains/run/handlers/executionHandler.ts
// After turn completes (where triggerConversationEvaluation is already called fire-and-forget)

void conversationMetadataGenerator.generate({
  existingTitle: conversation.title,
  existingSummary: conversation.summary,
  recentMessages,  // last 10 visible messages
  db: runDbClient,
  scopes: { tenantId, projectId },
  conversationId,
}).catch((error) => {
  logger.error(
    { error, conversationId },
    'Failed to generate conversation metadata (non-blocking)'
  );
});
```

### 4.7 Migration path

1. Extract `ArtifactMetadataGenerator` from `AgentSession.processArtifact()` — `AgentSession` delegates to it. Zero behavior change.
2. Add `ConversationMetadataGenerator` and wire trigger.
3. Keep existing read-time title fallback in run conversation routes as graceful degradation for pre-existing conversations.

---

## 5. API Endpoints

### 5.1 Run Domain (end-user)

#### Update: `GET /v1/conversations` (existing)

Add `agentId` optional query param. Add `summary` to response.

```
GET /v1/conversations
  Query params: page, limit, agentId? (NEW)
  Auth: API key + JWT (existing)
  Response schema update:
    ConversationListItemSchema adds: summary (string, nullable)
```

#### New: `GET /v1/artifacts`

```
GET /v1/artifacts
  Query params: page, limit, conversationId?, agentId?
  Auth: API key + JWT (same as conversation list)
  Scoping: userId always from JWT sub. Artifacts scoped via join:
    ledgerArtifacts.contextId → conversations.id
    WHERE conversations.userId = endUserId
    AND (conversations.agentId = agentId if provided)
    AND (ledgerArtifacts.contextId = conversationId if provided)
  Response: {
    data: ArtifactListItem[],
    pagination: { page, limit, total, pages }
  }

ArtifactListItem = {
  id: string,
  name: string | null,
  summary: string | null,
  type: string,
  conversationId: string,   // = contextId
  toolName: string | null,   // from metadata
  createdAt: string,
}
```

#### New: `GET /v1/artifacts/{artifactId}`

```
GET /v1/artifacts/{artifactId}
  Auth: API key + JWT. Verify artifact's conversation belongs to end-user.
  Response: {
    data: {
      id, name, description, summary, type,
      parts, metadata, conversationId,
      toolCallId, createdAt, updatedAt
    }
  }
```

File: `agents-api/src/domains/run/routes/artifacts.ts` (new)
Register in: `agents-api/src/domains/run/index.ts`

### 5.2 Manage Domain (admin)

#### Update: `GET /projects/:projectId/conversations` (existing)

Add `agentId` optional query param. Add `summary` to response.

```
GET /projects/:projectId/conversations
  Query params: page, limit, userId?, agentId? (NEW)
  Auth: requireProjectPermission('view')
  Response schema update:
    ManageConversationListItemSchema adds: summary (string, nullable)
```

#### New: `GET /projects/:projectId/artifacts`

```
GET /projects/:projectId/artifacts
  Query params: page, limit, userId?, agentId?, conversationId?
  Auth: requireProjectPermission('view')
  Scoping: project-wide. Optional userId/agentId via join to conversations.
  Response: same shape as run domain artifact list
```

#### New: `GET /projects/:projectId/artifacts/{id}`

```
GET /projects/:projectId/artifacts/{id}
  Auth: requireProjectPermission('view')
  Response: full artifact data
```

File: `agents-api/src/domains/manage/routes/artifacts.ts` (new, separate from `artifactComponents.ts` which manages type definitions)
Register in: `agents-api/src/domains/manage/routes/index.ts`

### 5.3 Authorization Model

| Domain | Who sees what |
|---|---|
| **Run API** | End-user sees own artifacts/conversations only (JWT `sub` = userId) |
| **Manage API** | Admin sees all in project. Optional userId/agentId filters for scoping |

Follows existing patterns exactly:
- Run: `agents-api/src/domains/run/routes/conversations.ts` (API key + JWT)
- Manage: `agents-api/src/domains/manage/routes/conversations.ts` (`requireProjectPermission('view')`)

---

## 6. Data Access Layer Changes

### 6.1 Update `listConversations` — add `agentId` filter

```typescript
// packages/agents-core/src/data-access/runtime/conversations.ts

export const listConversations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    userId?: string;
    agentId?: string;      // NEW
    pagination?: PaginationConfig;
  }) => {
    const whereConditions = [projectScopedWhere(conversations, params.scopes)];

    if (params.userId) {
      whereConditions.push(eq(conversations.userId, params.userId));
    }
    if (params.agentId) {                                          // NEW
      whereConditions.push(eq(conversations.agentId, params.agentId));  // NEW
    }                                                               // NEW

    // ... rest unchanged (orderBy, limit, offset, count)
  };
```

### 6.2 New: `listLedgerArtifacts` — paginated list with filters

```typescript
// packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts

export const listLedgerArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextId?: string;        // = conversationId
    userId?: string;           // requires join to conversations
    agentId?: string;          // requires join to conversations
    pagination?: PaginationConfig;
  }): Promise<{ artifacts: LedgerArtifactSelect[]; total: number }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 20, 200);
    const offset = (page - 1) * limit;

    const needsJoin = !!params.userId || !!params.agentId;

    const whereConditions = [projectScopedWhere(ledgerArtifacts, params.scopes)];

    if (params.contextId) {
      whereConditions.push(eq(ledgerArtifacts.contextId, params.contextId));
    }

    // Build base query — conditionally join conversations for userId/agentId filtering
    let baseQuery = db.select().from(ledgerArtifacts);

    if (needsJoin) {
      baseQuery = baseQuery.innerJoin(
        conversations,
        and(
          eq(ledgerArtifacts.contextId, conversations.id),
          eq(ledgerArtifacts.tenantId, conversations.tenantId),
          eq(ledgerArtifacts.projectId, conversations.projectId),
        ),
      );
      if (params.userId) {
        whereConditions.push(eq(conversations.userId, params.userId));
      }
      if (params.agentId) {
        whereConditions.push(eq(conversations.agentId, params.agentId));
      }
    }

    const artifactList = await baseQuery
      .where(and(...whereConditions))
      .orderBy(desc(ledgerArtifacts.createdAt))
      .limit(limit)
      .offset(offset);

    // Count query (same joins + conditions)
    // ... follows existing pattern from listConversations

    return { artifacts: artifactList, total };
  };
```

### 6.3 New: `getLedgerArtifactById`

```typescript
export const getLedgerArtifactById =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    artifactId: string;
  }): Promise<LedgerArtifactSelect | undefined> => {
    const result = await db
      .select()
      .from(ledgerArtifacts)
      .where(
        and(
          projectScopedWhere(ledgerArtifacts, params.scopes),
          eq(ledgerArtifacts.id, params.artifactId),
        ),
      )
      .limit(1);

    return result[0];
  };
```

---

## 7. SDK Methods

```typescript
// packages/agents-sdk/src/

// Conversations
client.conversations.list({ userId?, agentId?, page?, limit? })
client.conversations.get(conversationId)

// Artifacts
client.artifacts.list({ conversationId?, userId?, agentId?, page?, limit? })
client.artifacts.get(artifactId)
```

Thin HTTP wrappers over the manage API endpoints.

---

## 8. Files to Modify

### New files

| File | Purpose |
|------|---------|
| `agents-api/src/domains/run/metadata/BaseMetadataGenerator.ts` | Abstract base: model resolution, retry, telemetry |
| `agents-api/src/domains/run/metadata/ArtifactMetadataGenerator.ts` | Artifact-specific: prompt, schema, save, uniqueness |
| `agents-api/src/domains/run/metadata/ConversationMetadataGenerator.ts` | Conversation-specific: prompt, schema, shouldUpdate |
| `agents-api/src/domains/run/metadata/types.ts` | Shared types |
| `agents-api/src/domains/run/metadata/index.ts` | Exports |
| `agents-api/src/domains/run/routes/artifacts.ts` | Run domain: artifact list + get endpoints |
| `agents-api/src/domains/manage/routes/artifacts.ts` | Manage domain: artifact list + get endpoints |

### Modified files

| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `summary` column to `conversations` |
| `packages/agents-core/src/data-access/runtime/conversations.ts` | Add `agentId` filter to `listConversations` |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Add `listLedgerArtifacts` + `getLedgerArtifactById` |
| `agents-api/src/domains/run/session/AgentSession.ts` | Delegate `processArtifact()` to `ArtifactMetadataGenerator` |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | Add conversation metadata generation trigger |
| `agents-api/src/domains/run/routes/conversations.ts` | Add `agentId` query param + `summary` to response |
| `agents-api/src/domains/manage/routes/conversations.ts` | Add `agentId` query param + `summary` to response |
| `agents-api/src/domains/run/index.ts` | Register artifact routes |
| `agents-api/src/domains/manage/routes/index.ts` | Register artifact routes |

### Migration files

| Migration | Content |
|-----------|---------|
| `XXXX_add_conversation_summary.sql` | `ALTER TABLE conversations ADD COLUMN summary text;` |

---

## 9. Phasing

### Phase 1: Schema + DAL

1. Add `summary` column to `conversations` table in runtime-schema.ts
2. Generate and apply Drizzle migration
3. Add `agentId` filter to `listConversations` DAL
4. Add `listLedgerArtifacts` + `getLedgerArtifactById` DAL functions

### Phase 2: Metadata generation module

1. Create `BaseMetadataGenerator` with shared model resolution, retry, telemetry
2. Create `ArtifactMetadataGenerator` — extract from `AgentSession.processArtifact()`
3. Refactor `AgentSession.processArtifact()` to delegate to `ArtifactMetadataGenerator` (zero behavior change)
4. Create `ConversationMetadataGenerator`
5. Wire conversation metadata trigger into execution handler (fire-and-forget, every turn)
6. Add `GENERATION_TYPES.CONVERSATION_METADATA` telemetry constant

### Phase 3: API endpoints

1. Create `run/routes/artifacts.ts` — end-user artifact list + get
2. Create `manage/routes/artifacts.ts` — admin artifact list + get
3. Update both conversation list endpoints: add `agentId` filter + `summary` in response
4. Register new routes in domain index files

### Phase 4: SDK

1. Add conversation list/get methods
2. Add artifact list/get methods

---

## 10. Acceptance Criteria

1. **Artifact endpoints exist and work:**
   - `GET /v1/artifacts` returns paginated list with name, summary, type, conversationId
   - `GET /v1/artifacts/{id}` returns full artifact data
   - Manage equivalents work with admin auth and optional userId/agentId filters
   - End-user can only see artifacts from their own conversations

2. **Conversation list updated:**
   - `agentId` optional filter works on both run and manage list endpoints
   - `summary` field included in list response

3. **Conversation metadata auto-generated:**
   - After several messages, conversations have non-null `title` and `summary`
   - LLM only updates when conversation direction meaningfully changes
   - Fire-and-forget — never blocks user response
   - Telemetry tracked as `CONVERSATION_METADATA` generation type

4. **Artifact metadata refactored:**
   - Existing artifact name/description generation works identically after refactor
   - `AgentSession.processArtifact()` delegates to `ArtifactMetadataGenerator`
   - Same prompt, same schema, same retry logic, same fallback behavior

5. **No regression:**
   - Existing conversation list/get endpoints unchanged (additive only)
   - Existing artifact creation/retrieval unchanged
   - Read-time title fallback preserved for pre-existing conversations

---

## 11. What's NOT in This Spec (Deferred)

| Deferred capability | Why |
|---|---|
| Full-text search indexes (tsvector, GIN) | List + grep is sufficient for V0 |
| Search ranking (RRF, recency weighting) | No search index to rank |
| Platform tools for agent self-search | V1 — agents will use list/get endpoints via tools |
| MCP adapter for search tools | Depends on platform tools |
| Semantic/vector search (pgvector) | V2+ — when keyword filtering proves insufficient |
| Text-based ILIKE filtering on name/summary | Can add if list scanning is too coarse |
| Windowed message search within conversations | V1+ |
| Cross-conversation artifact retrieval tool | V1+ |

---

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| LLM call every turn adds cost | Small prompt, summarizer model, most calls return `shouldUpdate: false`. Track via telemetry. |
| Conversation metadata generation fails | Fire-and-forget with error logging. Read-time title fallback preserved. |
| Artifact list with join is slow at scale | Project-scoped queries limit cardinality. Add indexes if needed. |
| Large artifact refactor introduces bugs | Zero behavior change on artifact path — same prompt, schema, save logic. Test thoroughly. |
| `ledgerArtifacts` PK is 4-part composite (tenantId, projectId, id, taskId) | `getLedgerArtifactById` returns first match by `id` + project scope. Multiple artifacts can share an `id` across `taskId`s — may need disambiguation in V1. |
