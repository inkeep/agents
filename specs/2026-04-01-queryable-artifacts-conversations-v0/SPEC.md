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
| D5 | Conversation metadata generation triggered every assistant message (fire-and-forget). Conversations with < 3 user messages use cheap fallback (first message as title). 3+ messages: LLM generates title + summary (nullable — null means "current value is fine", saves output tokens). | LOCKED | Technical |
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

Also add a composite index for `agentId` filtering (no existing index covers this):

```typescript
// Add to conversations table indexes
index('conversations_agent_id_idx').on(
  table.tenantId,
  table.projectId,
  table.agentId,
),
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

Extracts shared concerns from `AgentSession.processArtifact()`. The base class owns infrastructure (model resolution, retry, telemetry, context formatting). Prompts stay fully owned by each subclass — they're too different in structure to template usefully.

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

export abstract class BaseMetadataGenerator<TResult, TContext> {
  protected config: MetadataGeneratorConfig;

  constructor(config: MetadataGeneratorConfig) {
    this.config = config;
  }

  // --- Shared infrastructure ---

  // Model resolution chain (summarizerModel → baseModel → sub-agent model → undefined)
  // Extracted from AgentSession.processArtifact() lines 1528-1576
  protected resolveModel(): ModelSettings | undefined { ... }

  // generateText with retry (3 attempts, exponential backoff)
  // Extracted from AgentSession.processArtifact() lines 1684-1769
  protected async generateWithRetry(prompt: string, schema: ZodSchema): Promise<TResult> { ... }

  // Telemetry span creation and tracking
  protected createSpan(name: string, attributes: Record<string, unknown>): Span { ... }

  // --- Shared prompt helpers (used by subclasses, not a shared template) ---

  // Format recent conversation messages for inclusion in any prompt
  protected formatConversationHistory(messages: FormattedMessage[], maxMessages = 10): string {
    return messages
      .slice(-maxMessages)
      .map(m => `${m.role}: ${extractText(m.content)}`)
      .join('\n');
  }

  // Truncate text to fit within a fraction of the model's context window
  // Used by ArtifactMetadataGenerator for data preview, available to all subclasses
  protected truncateForModel(text: string, fraction = 0.2): string {
    const model = this.resolveModel();
    if (!model) return text.slice(0, 2000);
    const modelContextInfo = getModelContextInfo(model);
    if (!modelContextInfo.hasValidContextWindow) return text.slice(0, 2000);
    const maxTokens = Math.floor(modelContextInfo.contextWindow * fraction);
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) +
      `\n...\n[Truncated: showing first ~${Math.floor(maxTokens / 1000)}K tokens]`;
  }

  // --- Template method ---

  async generate(context: TContext): Promise<void> {
    if (!this.shouldGenerate(context)) {
      // Still run fallback so early conversations get a title immediately
      await this.saveFallback(context);
      return;
    }

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

  // --- Abstract methods — subclasses own their prompts and persistence ---

  abstract buildPrompt(context: TContext): string;
  abstract getSchema(): ZodSchema<TResult>;
  abstract getGenerationType(): string;
  abstract processAndSave(result: TResult, context: TContext): Promise<void>;
  abstract saveFallback(context: TContext): Promise<void>;

  // Optional: subclass can skip generation entirely (default: always generate)
  protected shouldGenerate(_context: TContext): boolean { return true; }
}
```

**Design note:** The prompts for artifacts and conversations are structurally different — artifact prompts care about tool name, args, data truncation, and name uniqueness examples; conversation prompts care about drift detection and update semantics. Forcing them into a shared template would be artificial. The base class provides shared *helpers* (`formatConversationHistory`, `truncateForModel`) that subclasses compose into their own prompts.

### 4.4 ArtifactMetadataGenerator

Extracted from `AgentSession.processArtifact()` lines 1368-1898. Zero behavior change — same prompt, same schema, same save logic, same uniqueness check, same fallback. Uses base class helpers for conversation history formatting and data truncation.

```typescript
// agents-api/src/domains/run/metadata/ArtifactMetadataGenerator.ts

interface ArtifactMetadataContext {
  artifactData: ArtifactSavedData;
  existingNames: string[];
  lastUserMessage: string | null;
  recentMessages: FormattedMessage[];
  toolContext?: { toolName: string; args: unknown };
  artifactService: ArtifactService;
}

export class ArtifactMetadataGenerator extends BaseMetadataGenerator<
  { name: string; description: string },
  ArtifactMetadataContext
> {
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
    const toolName = ctx.toolContext?.toolName ?? ctx.artifactData.metadata?.toolName ?? 'unknown';
    const conversationHistory = this.formatConversationHistory(ctx.recentMessages);
    const truncatedData = this.truncateForModel(
      JSON.stringify(ctx.artifactData.data || ctx.artifactData.summaryData, null, 2),
      0.2,  // 20% of context window for data preview
    );

    // Existing prompt structure from lines 1623-1655 — unchanged
    return `Create a unique name and description for this tool result artifact.

CRITICAL: Your name must be different from these existing artifacts: ${ctx.existingNames.length > 0 ? ctx.existingNames.join(', ') : 'None yet'}

User's question: ${ctx.lastUserMessage ?? 'Unknown'}
Tool called: ${toolName}
Tool args: ${ctx.toolContext ? JSON.stringify(ctx.toolContext.args, null, 2) : 'No args'}
Recent conversation:
${conversationHistory}
Type: ${ctx.artifactData.artifactType || 'data'}
Data: ${truncatedData}

Requirements:
- Name: Max 50 chars, be extremely specific to THIS EXACT tool execution
- Description: Max 150 chars, describe what THIS SPECIFIC tool call returned
- Focus on the unique aspects of this particular tool execution result
- Be descriptive about the actual content returned, not just the tool type

BAD Examples (too generic):
- "Search Results"
- "Tool Results"
- "${toolName} Results"

GOOD Examples:
- "GitHub API Rate Limits & Auth Methods"
- "React Component Props Documentation"
- "Database Schema for User Tables"
- "Pricing Tiers with Enterprise Features"`;
  }

  async processAndSave(result, ctx: ArtifactMetadataContext): Promise<void> {
    // Name uniqueness check with toolCallId suffix (lines 1773-1792)
    // Save via ctx.artifactService.saveArtifact() (line 1799)
    // Fallback save on failure with generic name (lines 1835-1889)
  }

  async saveFallback(ctx: ArtifactMetadataContext): Promise<void> {
    // Generic name from artifact type + toolCallId suffix (lines 1580-1586)
    // Save via ctx.artifactService.saveArtifact()
  }
}
```

### 4.5 ConversationMetadataGenerator

```typescript
// agents-api/src/domains/run/metadata/ConversationMetadataGenerator.ts

interface ConversationMetadataContext {
  existingTitle: string | null;
  existingSummary: string | null;
  recentMessages: FormattedMessage[];
  userMessageCount: number;            // total user messages in conversation
  persistMetadata: (data: { title?: string; summary?: string }) => Promise<void>;
}

export class ConversationMetadataGenerator extends BaseMetadataGenerator<
  { title: string; summary: string; shouldUpdate: boolean },
  ConversationMetadataContext
> {
  getGenerationType(): string {
    return GENERATION_TYPES.CONVERSATION_METADATA;
  }

  // Skip LLM call when conversation is too short to benefit.
  // First 2 user messages: use fallback (first message as title, no summary).
  // 3+ user messages: start calling LLM to generate richer title + summary.
  protected shouldGenerate(ctx: ConversationMetadataContext): boolean {
    return ctx.userMessageCount >= 3;
  }

  getSchema() {
    return z.object({
      title: z.string().nullable().describe(
        'Concise conversation title, max 80 chars. ' +
        'null if current title still accurately captures the conversation.'
      ),
      summary: z.string().nullable().describe(
        'Brief conversation summary, max 200 chars. ' +
        'null if current summary still accurately captures the conversation.'
      ),
    });
  }

  buildPrompt(ctx: ConversationMetadataContext): string {
    const conversationHistory = this.formatConversationHistory(ctx.recentMessages);
    const hasExisting = ctx.existingTitle || ctx.existingSummary;

    return `Generate a title and summary for this conversation.

${hasExisting ? `Current title: ${ctx.existingTitle}\nCurrent summary: ${ctx.existingSummary}` : 'This conversation has no title or summary yet. Always generate both.'}

Recent conversation:
${conversationHistory}

Requirements:
- Title: Max 80 chars. Capture the specific topic, not a generic label.
- Summary: Max 200 chars. Describe what was discussed, decided, or accomplished.
${hasExisting ? '- Return null for title and/or summary if the current value still accurately captures the conversation. Only generate new values when the topic has meaningfully shifted or substantial new ground was covered.' : ''}

BAD title examples (too generic):
- "Chat with Assistant"
- "Help Request"
- "Technical Discussion"
- "Question and Answer"

GOOD title examples:
- "Migrating Auth from JWT to OAuth2 PKCE"
- "Debugging Memory Leak in Worker Pool"
- "Q3 Pricing Model for Enterprise Tier"
- "Setting Up CI/CD Pipeline for Monorepo"`;
  }

  async processAndSave(result, ctx: ConversationMetadataContext): Promise<void> {
    // null fields = no update needed (LLM skipped generating them)
    const updates: Record<string, string> = {};
    if (result.title !== null) updates.title = result.title;
    if (result.summary !== null) updates.summary = result.summary;
    if (Object.keys(updates).length === 0) return;
    await ctx.persistMetadata(updates);
  }

  async saveFallback(ctx: ConversationMetadataContext): Promise<void> {
    // No model available — use first user message as title (existing behavior, now persisted)
    if (!ctx.existingTitle && ctx.recentMessages.length > 0) {
      const firstUserMsg = ctx.recentMessages.find(m => m.role === 'user');
      if (firstUserMsg) {
        const text = extractText(firstUserMsg.content);
        if (text) {
          const title = text.length > 100 ? `${text.slice(0, 100)}...` : text;
          await ctx.persistMetadata({ title });
        }
      }
    }
  }
}
```

**Design notes:**

1. **`shouldGenerate` gate:** Conversations with < 3 user messages skip the LLM call entirely and use the cheap fallback (first message as title). This avoids paying for an LLM call on every single-question conversation, which is the majority of traffic.

2. **`persistMetadata` callback:** Persistence is injected via context rather than passing a DB client directly. The caller constructs it:
   ```typescript
   persistMetadata: (data) => updateConversation(runDbClient)({
     scopes: { tenantId, projectId },
     conversationId,
     data,
   })
   ```
   This matches the artifact pattern where `artifactService` is injected, and keeps the generator decoupled from the DAL.

3. **Prompt quality:** Includes good/bad examples (same pattern as artifact prompt) to guide the LLM toward specific, useful titles rather than generic labels.

### 4.6 Trigger Integration

**Artifacts:** `AgentSession.processArtifact()` delegates to `ArtifactMetadataGenerator.generate()`. Same fire-and-forget pattern. Zero behavior change.

**Conversations:** triggered every assistant message completion in execution handler. The generator's `shouldGenerate()` gate skips the LLM call for conversations with < 3 user messages — those get the cheap fallback instead.

```typescript
// agents-api/src/domains/run/handlers/executionHandler.ts
// After turn completes (where triggerConversationEvaluation is already called fire-and-forget)

void conversationMetadataGenerator.generate({
  existingTitle: conversation.title,
  existingSummary: conversation.summary,
  recentMessages,          // last 10 visible messages
  userMessageCount,        // total user messages in conversation
  persistMetadata: (data) => updateConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    data,
  }),
}).catch((error) => {
  logger.error(
    { error, conversationId },
    'Failed to generate conversation metadata (non-blocking)'
  );
});
```

**Cost profile:**
- Conversations with 1-2 user messages: no LLM call, just fallback (first message as title)
- Conversations with 3+ user messages: LLM call every turn, but most return `shouldUpdate: false` (no DB write)
- Uses summarizer model (cheapest available), small prompt (~500 tokens)

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
  Query params: page, limit, conversationId?, agentId?, toolName?
  Auth: API key + JWT (same as conversation list)
  Scoping: userId always from JWT sub. Artifacts scoped via join:
    ledgerArtifacts.contextId → conversations.id
    WHERE conversations.userId = endUserId
    AND (conversations.agentId = agentId if provided)
    AND (ledgerArtifacts.contextId = conversationId if provided)
    AND (ledgerArtifacts.metadata->>'toolName' = toolName if provided)
  Response: {
    data: ArtifactListItem[],
    pagination: { page, limit, total, pages }
  }

ArtifactListItem = {
  id: string,
  name: string | null,
  description: string | null,  // full description (often < 200 chars; more useful than truncated summary)
  type: string,
  conversationId: string,      // = contextId
  toolName: string | null,     // extracted from metadata JSONB: metadata->>'toolName'
  createdAt: string,
}
```

#### New: `GET /v1/artifacts/{artifactId}`

```
GET /v1/artifacts/{artifactId}
  Auth: API key + JWT. Ownership verified in single query via
    getLedgerArtifactById({ ..., userId: endUserId }) which joins
    to conversations table (no second query needed).
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
  Query params: page, limit, userId?, agentId?, conversationId?, toolName?
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

### 5.4 Consistency Model

Conversation `title` and `summary` fields are generated asynchronously (fire-and-forget) after each turn. Callers should expect:
- `title` may be `null` for brand-new conversations (before the first fallback runs)
- `summary` may be `null` for conversations with < 3 user messages
- Both fields may be briefly stale immediately after a turn completes (generation is in-flight)
- The existing read-time title fallback in run conversation routes covers the `null` title case for display purposes

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

**Security note:** Run API route handlers MUST always pass `userId: endUserId` from JWT. The DAL accepts `userId` as optional to support the Manage API (admin queries without user scoping), but omitting it on the Run domain would leak cross-user data. Route handlers enforce this, not the DAL — consistent with `listConversations` which follows the same pattern.

**Drizzle implementation note:** Conditional joins change the query return type in Drizzle (`LedgerArtifactSelect[]` vs `{ ledger_artifacts: ..., conversations: ... }[]`). The implementation should either: (a) always join and use `db.select(getTableColumns(ledgerArtifacts))` to normalize the output shape, or (b) use two separate query builders sharing a WHERE conditions array. Option (a) is simpler.

**Vocabulary note:** The API exposes `conversationId` in request/response schemas. Internally this maps to `ledgerArtifacts.contextId` in the database. The DAL uses `contextId` (matching the column name); the route layer maps it.

```typescript
// packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts

export const listLedgerArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextId?: string;        // = conversationId (API) → contextId (DB)
    userId?: string;           // Run API: ALWAYS pass from JWT. Manage API: optional.
    agentId?: string;          // optional filter
    toolName?: string;         // filter by tool name (JSONB access)
    pagination?: PaginationConfig;
  }): Promise<{ artifacts: LedgerArtifactSelect[]; total: number }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 20, 200);
    const offset = (page - 1) * limit;

    const whereConditions = [projectScopedWhere(ledgerArtifacts, params.scopes)];

    if (params.contextId) {
      whereConditions.push(eq(ledgerArtifacts.contextId, params.contextId));
    }
    if (params.toolName) {
      // toolName is stored in JSONB metadata column, not a top-level column
      whereConditions.push(
        sql`${ledgerArtifacts.metadata}->>'toolName' = ${params.toolName}`
      );
    }
    if (params.userId) {
      whereConditions.push(eq(conversations.userId, params.userId));
    }
    if (params.agentId) {
      whereConditions.push(eq(conversations.agentId, params.agentId));
    }

    // Always join to conversations — normalizes Drizzle return type and
    // ensures userId/agentId filters work. The join is cheap (FK indexed).
    const artifactList = await db
      .select(getTableColumns(ledgerArtifacts))  // only return artifact columns
      .from(ledgerArtifacts)
      .innerJoin(
        conversations,
        and(
          eq(ledgerArtifacts.contextId, conversations.id),
          eq(ledgerArtifacts.tenantId, conversations.tenantId),
          eq(ledgerArtifacts.projectId, conversations.projectId),
        ),
      )
      .where(and(...whereConditions))
      .orderBy(desc(ledgerArtifacts.createdAt))
      .limit(limit)
      .offset(offset);

    // Count query (same join + conditions)
    // ... follows existing pattern from listConversations

    return { artifacts: artifactList, total };
  };
```

### 6.3 New: `getLedgerArtifactById`

Handles the composite PK issue: `ledgerArtifacts` PK is `(tenantId, projectId, id, taskId)` — the same `id` can appear with different `taskId`s. Returns the most recent one. Supports optional `userId` param for auth-in-one-query on the Run domain (avoids a second query to verify conversation ownership).

```typescript
export const getLedgerArtifactById =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    artifactId: string;
    userId?: string;    // optional: when set, joins conversations to verify ownership
  }): Promise<LedgerArtifactSelect | undefined> => {
    const whereConditions = [
      projectScopedWhere(ledgerArtifacts, params.scopes),
      eq(ledgerArtifacts.id, params.artifactId),
    ];

    let query = db.select().from(ledgerArtifacts);

    if (params.userId) {
      query = query.innerJoin(
        conversations,
        and(
          eq(ledgerArtifacts.contextId, conversations.id),
          eq(ledgerArtifacts.tenantId, conversations.tenantId),
          eq(ledgerArtifacts.projectId, conversations.projectId),
        ),
      );
      whereConditions.push(eq(conversations.userId, params.userId));
    }

    const result = await query
      .where(and(...whereConditions))
      .orderBy(desc(ledgerArtifacts.createdAt))  // most recent taskId variant
      .limit(1);

    return result[0];
  };
```

---

## 7. SDK Methods

The SDK uses flat methods on client classes (no sub-client namespaces). See `EvaluationClient` for the established pattern: single class, `buildUrl()` + `buildHeaders()` helpers, `apiFetch()` from `@inkeep/agents-core` for HTTP calls.

### New file: `packages/agents-sdk/src/runtimeClient.ts`

```typescript
import { apiFetch } from '@inkeep/agents-core';

interface RuntimeClientConfig {
  tenantId: string;
  projectId: string;
  apiUrl: string;       // manage API base URL
  apiKey?: string;
}

export class RuntimeClient {
  private config: RuntimeClientConfig;

  constructor(config: RuntimeClientConfig) {
    this.config = config;
  }

  private buildUrl(...segments: string[]): string { ... }
  private buildHeaders(): Record<string, string> { ... }

  // --- Conversations ---

  async listConversations(params?: {
    userId?: string;
    agentId?: string;
    page?: number;
    limit?: number;
  }) { ... }

  async getConversation(conversationId: string) { ... }

  // --- Artifacts ---

  async listArtifacts(params?: {
    conversationId?: string;
    userId?: string;
    agentId?: string;
    toolName?: string;
    page?: number;
    limit?: number;
  }) { ... }

  async getArtifact(artifactId: string) { ... }
}
```

Calls the manage API endpoints (`GET /projects/:projectId/conversations`, `GET /projects/:projectId/artifacts`, etc.). Follows the same `apiFetch` + error handling pattern as `EvaluationClient`.

Export from `packages/agents-sdk/src/index.ts`:
```typescript
export { RuntimeClient } from './runtimeClient';
export type { RuntimeClientConfig } from './runtimeClient';
```

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
| `packages/agents-sdk/src/runtimeClient.ts` | SDK client: conversation + artifact list/get methods |

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
| `packages/agents-sdk/src/index.ts` | Export `RuntimeClient` |

### Migration files

| Migration | Content |
|-----------|---------|
| `XXXX_add_conversation_summary_and_agent_idx.sql` | `ALTER TABLE conversations ADD COLUMN summary text;` + `CREATE INDEX conversations_agent_id_idx ON conversations (tenant_id, project_id, agent_id);` |

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

## 10. Open Questions

| # | Question | Leaning | Priority |
|---|----------|---------|----------|
| OQ1 | `ledgerArtifacts` has a 4-part composite PK `(tenantId, projectId, id, taskId)`. Same `id` can appear with different `taskId`s. `getLedgerArtifactById` currently returns the most recent by `createdAt`. Should it return all rows? Require `taskId`? Or is most-recent sufficient? | Most-recent (Option A) is sufficient for V0. The list endpoint doesn't expose `taskId`, so requiring it would break the get-by-id flow. Revisit if users need version-specific retrieval. | P2 |

---

## 11. Acceptance Criteria

1. **Artifact endpoints exist and work:**
   - `GET /v1/artifacts` returns paginated list with name, description, type, conversationId
   - `GET /v1/artifacts/{id}` returns full artifact data
   - `toolName` filter works on both run and manage artifact list endpoints
   - Manage equivalents work with admin auth and optional userId/agentId/toolName filters
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

## 12. What's NOT in This Spec (Deferred)

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

## 13. Risks

| Risk | Mitigation |
|------|-----------|
| LLM call every turn adds cost | Gated: no LLM call for conversations < 3 user messages (majority of traffic). 3+ messages: small prompt, summarizer model, most calls return `shouldUpdate: false`. Track via telemetry. |
| Conversation metadata generation fails | Fire-and-forget with error logging. Read-time title fallback preserved. |
| Artifact list with join is slow at scale | Project-scoped queries limit cardinality. Add indexes if needed. |
| Large artifact refactor introduces bugs | Zero behavior change on artifact path — same prompt, schema, save logic. Test thoroughly. |
| `ledgerArtifacts` PK is 4-part composite (tenantId, projectId, id, taskId) | `getLedgerArtifactById` returns most recent by `createdAt` when multiple rows share an `id`. See OQ1. |
