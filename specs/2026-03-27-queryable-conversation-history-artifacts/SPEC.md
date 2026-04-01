# SPEC: Queryable Conversation History & Artifact Indexing

## 1. Problem Statement

**Situation:** Inkeep agents have conversations with users that produce messages and tool-result artifacts. These accumulate across multiple conversations per user per agent.

**Complication:** Currently ALL conversation history (or lossy compression summaries) and ALL artifacts are dumped into every LLM call regardless of relevance. This wastes context budget, limits conversation length, blocks oversized artifacts, and agents cannot recall prior conversations.

**Resolution:** Give agents tools to search their own conversation history and artifacts on demand. Replace dump-everything with manifest + on-demand retrieval. Scope: tenant + project + agent + user, across conversations.

---

## 2. Decisions Log

| # | Decision | Status | Type |
|---|----------|--------|------|
| D1 | Use existing `contextId` on `ledgerArtifacts` (already FKs to conversations) — no new columns needed on `ledgerArtifacts`. `agentId` lives only on search index tables, populated from execution context at insert time. | LOCKED | Technical |
| D2 | Update conversation search index every user+AI turn | LOCKED | Technical |
| D3 | Search implemented as a platform tool module (`platform-tools/search/`), scoped per execution context, auto-loaded for all agents via `loadPlatformTools()` in tool-loading pipeline. Adapted to MCP protocol for external clients. | LOCKED | Product/Technical |
| D4 | Postgres full-text search (tsvector) — no embeddings in Phase 1 | LOCKED | Technical |
| D5 | Two search indexes: conversation-level + artifact-level | LOCKED | Technical |
| D6 | Scope: `tenantId + projectId` always required. `agentId` and `userId` are optional filters (consistent with existing `listConversations` pattern). Run API/platform tools always pass `userId` from JWT. Manage API allows cross-user/cross-agent search. NULL userId rows in search index are excluded from results. | LOCKED | Product |
| D7 | tsvector keyword search + recency weighting (RRF) | LOCKED | Technical |
| D8 | Fire-and-forget UPSERT with concatenated text. No LLM calls in the API server. Failures are logged and self-healing (next turn retries). Search index may be stale for up to one turn after a transient DB error; no user-visible impact. | LOCKED | Technical |
| D9 | Conversation summarization uses agent's configured summarization model (for long convos) | LOCKED | Technical |
| D10 | `get_conversation_messages` returns user-facing + user messages + tool results | LOCKED | Product |
| D11 | Tables designed with nullable `embedding` column for future pgvector upgrade | LOCKED | Technical |
| D12 | Application-managed tsvector (explicit in UPSERT), not GENERATED ALWAYS AS (Drizzle incompatible) | LOCKED | Technical |
| D13 | `get_reference_artifact` extended with direct DB fallback for cross-conversation artifacts | LOCKED | Technical |
| D14 | `search_conversation_history` excludes the current conversation from results | LOCKED | Technical |
| D15 | Compression summaries enrich search index (additive, not separately queryable) | LOCKED | Technical |
| D16 | Search text is additive: concatenated user messages + latest compression summary coexist. Compression does not overwrite concatenated text — they are complementary search signals (exact keywords vs semantic coverage). Latest compression summary replaces prior compression summary only (cumulative by design). | LOCKED | Technical |
| D17 | No "provided" summary source in Phase 1. Only two automatic sources: concatenated (every turn) and compression_summary (when compressor fires). Caller-supplied summaries can be added later if a concrete use case emerges. | LOCKED | Product |

---

## 3. Data Models

### 3.1 New Table: `conversation_search_index`

One row per conversation. Updated after every user+AI turn. tsvector is application-managed (set explicitly in UPSERT, not GENERATED).

```typescript
// packages/agents-core/src/db/runtime/runtime-schema.ts

export const conversationSearchIndex = pgTable(
  'conversation_search_index',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }).notNull(),  // NOT NULL: D6 says NULL userId not searchable — no row created without userId

    // Searchable text content (updated every turn)
    searchText: text('search_text').notNull(),
    summarySource: varchar('summary_source', { length: 50 }).notNull()
      .default('concatenated'),   // 'concatenated' | 'concatenated+compression'
    messageCount: integer('message_count').notNull().default(0),

    // Application-managed tsvector (set via to_tsvector('english', search_text) in UPSERT)
    // NOT a GENERATED column — Drizzle does not support GENERATED columns.
    // Uses shared tsvectorColumn custom type — see packages/agents-core/src/db/runtime/custom-types.ts
    searchVector: tsvectorColumn('search_vector'),

    // Conversation metadata for display + filtering
    title: text('title'),
    lastUserMessage: text('last_user_message'),
    lastAgentMessage: text('last_agent_message'),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.conversationId] }),

    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'conversation_search_index_conversation_fk',
    }).onDelete('cascade'),

    // GIN index for full-text search
    index('conversation_search_idx').using('gin', table.searchVector),

    // Composite index for scoped queries
    index('conversation_search_scope_idx').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.userId,
    ),
  ]
);
```

**Shared custom type** (`packages/agents-core/src/db/runtime/custom-types.ts`):

```typescript
import { customType } from 'drizzle-orm/pg-core';

// tsvector column — application-managed (Drizzle has no built-in tsvector type).
// Set explicitly via to_tsvector('english', text) in UPSERT queries.
export const tsvectorColumn = (name: string) =>
  customType<{ data: string; driverParam: string }>({
    dataType() { return 'tsvector'; },
    toDriver(value: string) { return value; },
    fromDriver(value: string) { return value; },
  })(name);

// Future Phase 2: vector column for pgvector embeddings
// export const vectorColumn = (name: string, dimensions: number) => ...
```

### 3.2 New Table: `artifact_search_index`

One row per artifact. Created when the artifact is saved.

```typescript
export const artifactSearchIndex = pgTable(
  'artifact_search_index',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    artifactId: varchar('artifact_id', { length: 256 }).notNull(),

    // Scope fields (denormalized for query performance)
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }).notNull(),  // NOT NULL: D6
    toolCallId: varchar('tool_call_id', { length: 256 }),   // needed for retrieval workflow

    // Searchable text content
    searchText: text('search_text').notNull(),
    toolName: varchar('tool_name', { length: 256 }),
    artifactType: varchar('artifact_type', { length: 256 }),
    artifactName: varchar('artifact_name', { length: 256 }),

    // Application-managed tsvector — same shared custom type
    searchVector: tsvectorColumn('search_vector'),

    // Size metadata
    estimatedTokens: integer('estimated_tokens'),
    isOversized: boolean('is_oversized').default(false),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.artifactId] }),

    // Note: No FK to ledger_artifacts because its PK is (tenantId, projectId, id, taskId)
    // which is a 4-part composite. The artifactId alone is not unique in ledger_artifacts.
    // Cleanup of orphaned search index rows handled by application code during artifact deletion.

    // GIN index for full-text search
    index('artifact_search_idx').using('gin', table.searchVector),

    // Composite index for scoped queries
    index('artifact_search_scope_idx').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.userId,
    ),

    // Index for conversation-scoped artifact lookup
    index('artifact_search_conversation_idx').on(
      table.tenantId,
      table.projectId,
      table.conversationId,
    ),

    // Index for tool-name filtering
    index('artifact_search_tool_idx').on(
      table.tenantId,
      table.projectId,
      table.toolName,
    ),
  ]
);
```

### 3.3 No schema changes to `ledgerArtifacts`

`contextId` already serves as `conversationId` (confirmed: FK to conversations exists at line 496-498 of runtime-schema.ts). `agentId` is NOT added to `ledgerArtifacts` — it lives only on `artifact_search_index`, populated from execution context at insert time. No join needed; the execution context already carries `agentId`.

### 3.4 No pgvector extension needed in Phase 1

Tables are designed so a future migration can add pgvector:

```sql
-- Future Phase 2 migration (not part of this spec):
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE conversation_search_index ADD COLUMN embedding vector(1536);
ALTER TABLE artifact_search_index ADD COLUMN embedding vector(1536);
CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Index Update Pipeline

### 4.1 When indexes are updated

| Event | What gets updated | Mechanism |
|-------|-------------------|-----------|
| User+AI turn completes | Conversation search index (UPSERT) | Fire-and-forget with concatenated text (no LLM) |
| ConversationCompressor fires | Conversation search index (UPSERT with richer summary) | Fire-and-forget — LLM already ran as part of compression |
| Artifact created | Artifact search index (INSERT) | Fire-and-forget during artifact save |
| Conversation title updated | Conversation search index (UPDATE) | Fire-and-forget on title change |

**Note:** MidGenerationCompressor does NOT update the search index. It is a tactical, sub-agent-scoped context eviction — not a holistic conversation summary. Its output would downgrade the search index if it overwrote a richer per-turn or ConversationCompressor summary.

### 4.2 Conversation index update flow

**No LLM calls in the API server (D8). Additive search text model (D16). Two sources only (D17).**

The `search_text` field is the concatenation of all available sections — concatenated user messages and compression summary are complementary search signals, not competing. Concatenated text provides exact keyword matches; compression summary provides structured semantic coverage.

**Search text structure:**

```
search_text = [
  title,                        // stable, short
  last N user messages,         // sliding window, bounded (~500 words)
  latest compression summary,   // cumulative, replaces prior compression summary only (~200-500 words)
].filter(Boolean).join('\n---\n')
```

Total `search_text` is bounded at ~1500 words regardless of conversation length.

**Source 1: Concatenated (automatic, every turn)**

```
User sends message → Agent responds → Response streamed to user
                                         ↓ (fire-and-forget, fast)
                                    1. Fetch conversation metadata (title, agentId, userId)
                                    2. Build searchText = [title, last N user messages].join('\n---\n')
                                    3. void upsertConversationSearchIndex({
                                         searchText, summarySource: 'concatenated', ...metadata
                                       }).catch(err => logger.error({ err, conversationId }, 
                                         'Failed to update conversation search index'));
                                    (Single SQL statement — fast, no LLM call, pure DB.
                                     Failure does not block user response. Self-healing on next turn.)
```

**Source 2: Compression summary (automatic, when ConversationCompressor fires)**

When `ConversationCompressor` fires (between turns), it already runs an LLM to produce a `ConversationSummarySchema`. The search index captures this output — no additional LLM call needed. The compression summary is **appended** to the concatenated text, not a replacement.

MidGenerationCompressor does NOT trigger a search index update — it is a tactical mid-generation context eviction scoped to a single sub-agent, not a holistic conversation summary.

```
Compression fires → Structured summary already produced (LLM ran as part of compression)
                         ↓ (fire-and-forget, within compression flow)
                    1. Build compressionText from summary fields:
                       compressionText = [
                         summary.conversation_overview,
                         summary.user_goals?.primary,
                         ...(summary.key_outcomes?.completed || []),
                         ...(summary.key_outcomes?.discoveries || []),
                         ...(summary.context_for_continuation?.important_context || []),
                       ].filter(Boolean).join('\n')
                    2. Build searchText = [title, last N user messages, compressionText].join('\n---\n')
                    3. UPSERT with summary_source = 'concatenated+compression'
                       (latest compression summary replaces prior compression summary;
                        concatenated user messages are always preserved)
```

**Failure handling (D8):**
- All search index UPSERTs are fire-and-forget: `void upsert(...).catch(log)`
- Failures do not block or affect the user response
- Failures are self-healing — next turn attempts another UPSERT with fresh data
- Search index may be stale for up to one turn after a transient DB error; no user-visible impact
- No retry queue in Phase 1. If error rates are observed in logs, add retry mechanism later

### 4.3 UPSERT with application-managed tsvector (D12)

Since Drizzle does not support GENERATED columns, the tsvector is set explicitly in every UPSERT:

```sql
INSERT INTO conversation_search_index
  (tenant_id, project_id, conversation_id, agent_id, user_id,
   search_text, search_vector, summary_source, message_count,
   title, last_user_message, last_agent_message, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, $5,
   $6, to_tsvector('english', $6), $7, $8,
   $9, $10, $11, NOW(), NOW())
ON CONFLICT (tenant_id, project_id, conversation_id)
DO UPDATE SET
  search_text = EXCLUDED.search_text,
  search_vector = to_tsvector('english', EXCLUDED.search_text),
  summary_source = EXCLUDED.summary_source,
  message_count = EXCLUDED.message_count,
  title = EXCLUDED.title,
  last_user_message = EXCLUDED.last_user_message,
  last_agent_message = EXCLUDED.last_agent_message,
  updated_at = NOW();
```

Same pattern for `artifact_search_index` INSERTs.

### 4.4 Artifact index update flow

```
Tool executes → Artifact saved to ledger_artifacts (with contextId = conversationId)
                     ↓ (fire-and-forget, immediately after)
                void insertArtifactSearchIndex({
                  searchText: [name, description, summary, 'tool: ' + toolName]
                    .filter(Boolean).join(' | '),
                  conversationId: artifact.contextId,  // contextId IS conversationId
                  agentId: executionContext.agentId,    // from execution context, NOT ledger_artifacts
                  userId: executionContext.userId,
                  toolCallId: artifact.toolCallId,
                }).catch(err => logger.error({ err, artifactId }, 'Failed to index artifact'));
```

---

## 5. Search Implementation

### 5.1 Search query: keyword + recency via RRF

```sql
-- Search conversations: full-text keyword match + recency ranking via RRF
-- D6: agentId and userId are optional filters (conditionally applied by caller)
WITH text_query AS (
  SELECT plainto_tsquery('english', $1) AS query
),
keyword_results AS (
  SELECT
    conversation_id,
    ts_rank_cd(search_vector, (SELECT query FROM text_query), 32) AS text_score,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(search_vector, (SELECT query FROM text_query), 32) DESC
    ) AS keyword_rank
  FROM conversation_search_index
  WHERE tenant_id = $2
    AND project_id = $3
    AND ($4::varchar IS NULL OR agent_id = $4)          -- optional agent filter
    AND ($5::varchar IS NULL OR user_id = $5)           -- optional user filter
    AND ($6::varchar IS NULL OR conversation_id != $6)  -- optional exclude current
    AND search_vector @@ (SELECT query FROM text_query)
  LIMIT 50
),
recency_results AS (
  SELECT
    conversation_id,
    ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS recency_rank
  FROM conversation_search_index
  WHERE tenant_id = $2
    AND project_id = $3
    AND ($4::varchar IS NULL OR agent_id = $4)
    AND ($5::varchar IS NULL OR user_id = $5)
    AND ($6::varchar IS NULL OR conversation_id != $6)
  LIMIT 50
)
SELECT
  COALESCE(k.conversation_id, r.conversation_id) AS conversation_id,
  (COALESCE(1.0 / (60 + k.keyword_rank), 0) +
   COALESCE(0.5 / (60 + r.recency_rank), 0)) AS rrf_score
FROM keyword_results k
FULL JOIN recency_results r USING (conversation_id)
ORDER BY rrf_score DESC
LIMIT $7;
```

**Note:** In practice, the DAL uses Drizzle's query builder with conditional `whereConditions.push()` (same as `listConversations`), not raw SQL with IS NULL. The SQL above illustrates the logical query.

### 5.2 Artifact search query

Same pattern as conversation search — keyword + recency via RRF, with optional `toolName` and `conversationId` filters:

```sql
WITH text_query AS (
  SELECT plainto_tsquery('english', $1) AS query
),
keyword_results AS (
  SELECT
    artifact_id,
    ts_rank_cd(search_vector, (SELECT query FROM text_query), 32) AS text_score,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(search_vector, (SELECT query FROM text_query), 32) DESC
    ) AS keyword_rank
  FROM artifact_search_index
  WHERE tenant_id = $2
    AND project_id = $3
    AND ($4::varchar IS NULL OR agent_id = $4)          -- optional agent filter (D6)
    AND ($5::varchar IS NULL OR user_id = $5)           -- optional user filter (D6)
    AND ($6::varchar IS NULL OR tool_name = $6)         -- optional tool filter
    AND ($7::varchar IS NULL OR conversation_id = $7)   -- optional conversation filter
    AND search_vector @@ (SELECT query FROM text_query)
  LIMIT 50
),
recency_results AS (
  SELECT
    artifact_id,
    ROW_NUMBER() OVER (ORDER BY created_at DESC) AS recency_rank
  FROM artifact_search_index
  WHERE tenant_id = $2
    AND project_id = $3
    AND ($4::varchar IS NULL OR agent_id = $4)
    AND ($5::varchar IS NULL OR user_id = $5)
    AND ($6::varchar IS NULL OR tool_name = $6)
    AND ($7::varchar IS NULL OR conversation_id = $7)
  LIMIT 50
)
SELECT
  COALESCE(k.artifact_id, r.artifact_id) AS artifact_id,
  (COALESCE(1.0 / (60 + k.keyword_rank), 0) +
   COALESCE(0.5 / (60 + r.recency_rank), 0)) AS rrf_score
FROM keyword_results k
FULL JOIN recency_results r USING (artifact_id)
ORDER BY rrf_score DESC
LIMIT $8;
```

**Note:** `search_artifacts` includes artifacts from ALL conversations (including the current one), unlike `search_conversation_history` which excludes the current conversation. This is intentional — the LLM may want to find artifacts from the current conversation that aren't in the prompt (e.g., oversized artifacts).

### 5.3 Data access layer

One DAL function per search type with optional `agentId`/`userId` — callers enforce scoping (consistent with `listConversations` pattern where `userId?` is optional and conditionally applied).

```typescript
// packages/agents-core/src/data-access/runtime/conversationSearch.ts

export const searchConversations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;         // tenantId + projectId always required
    agentId?: string;                   // optional — Run API/platform tools pass it, Manage API may omit
    userId?: string;                    // optional — Run API/platform tools pass from JWT, Manage API may omit
    excludeConversationId?: string;     // optional — exclude current conversation (D14)
    query: string;
    limit?: number;
  }): Promise<Array<{
    conversationId: string;
    title: string | null;
    summaryText: string;
    lastUserMessage: string | null;
    messageCount: number;
    score: number;
    updatedAt: string;
  }>> => {
    // Builds WHERE conditions using conditional pattern (same as listConversations):
    const whereConditions = [projectScopedWhere(conversationSearchIndex, params.scopes)];
    if (params.agentId) whereConditions.push(eq(conversationSearchIndex.agentId, params.agentId));
    if (params.userId) whereConditions.push(eq(conversationSearchIndex.userId, params.userId));
    if (params.excludeConversationId) whereConditions.push(ne(conversationSearchIndex.conversationId, params.excludeConversationId));
    // ... keyword + recency RRF query with these conditions
  };

// packages/agents-core/src/data-access/runtime/artifactSearch.ts

export const searchArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId?: string;                   // optional — same pattern
    userId?: string;                    // optional — same pattern
    conversationId?: string;            // optional: scope to specific conversation
    query: string;
    toolName?: string;
    artifactType?: string;
    limit?: number;
  }): Promise<Array<{
    artifactId: string;
    toolCallId: string | null;          // included for retrieval workflow
    conversationId: string;
    artifactName: string | null;
    toolName: string | null;
    searchText: string;
    estimatedTokens: number | null;
    isOversized: boolean;
    score: number;
    createdAt: string;
  }>> => { ... };
```

**Scoping enforcement is at the caller level, not the DAL:**
- **Run API routes:** Always pass `userId` from JWT `sub` claim. Pass `agentId` if available from execution context, otherwise omit (cross-agent search).
- **Manage API routes:** Pass whatever the admin provides (both optional for cross-user/cross-agent).
- **Platform tools (agent execution):** Always pass both `userId` and `agentId` from execution context.
- **External MCP:** Pass `userId` from JWT if available. If no JWT → no userId → tools return empty results (see Section 6.9).

### 5.4 Windowed message search within a conversation

When `get_conversation_messages` is called with a `query`, search within that conversation's messages and return contextual windows around matches:

```sql
-- Search within a conversation: find matches, expand to context windows, merge overlaps
WITH matched AS (
  SELECT id, created_at,
    ROW_NUMBER() OVER (ORDER BY created_at) AS pos
  FROM messages
  WHERE conversation_id = $1
    AND tenant_id = $2 AND project_id = $3
    AND (visibility = 'user-facing' OR message_type = 'tool-result')
    AND to_tsvector('english', COALESCE(
      content->>'text',                                    -- flat {text: "..."} shape
      (SELECT string_agg(p->>'text', ' ')                  -- parts array [{kind:'text', text:'...'}]
       FROM jsonb_array_elements(content->'parts') AS p
       WHERE p->>'kind' = 'text'),
      ''
    )) @@ plainto_tsquery('english', $4)
),
all_msgs AS (
  SELECT id, created_at, content, role, message_type, from_sub_agent_id, metadata,
    ROW_NUMBER() OVER (ORDER BY created_at) AS pos
  FROM messages
  WHERE conversation_id = $1
    AND tenant_id = $2 AND project_id = $3
    AND (visibility = 'user-facing' OR message_type = 'tool-result')
),
-- Expand each match into a window of +/- $5 (contextWindow) messages
-- Overlapping windows naturally merge via DISTINCT
windows AS (
  SELECT DISTINCT a.id, a.pos, a.content, a.role, a.created_at,
    a.message_type, a.from_sub_agent_id, a.metadata,
    m.id AS matched_id,
    m.pos AS matched_pos
  FROM all_msgs a
  JOIN matched m ON a.pos BETWEEN m.pos - $5 AND m.pos + $5
)
SELECT * FROM windows ORDER BY pos
LIMIT $6;
```

**Notes:**
- `to_tsvector` is applied at query time on message content — no stored tsvector column needed on the messages table. This is acceptable because we're searching within a single conversation (small result set, typically <500 messages).
- Overlapping windows merge naturally via `DISTINCT` — if two matches are close together, the result is one continuous segment.
- The application layer groups the flat result into `segments[]` by detecting gaps in `pos` (non-contiguous positions indicate separate segments).

**Keyword search limitation:** This uses `plainto_tsquery` which matches stemmed keywords only. Searching "pricing" won't find messages that discuss pricing conceptually without using the word (e.g., "how much should we charge?"). The pgvector Phase 2 upgrade addresses this — message-level embeddings would enable semantic search within conversations, matching on meaning rather than keywords. For Phase 1, this is an accepted trade-off.

### 5.5 Future pgvector upgrade path

When semantic search is needed, the DAL adds a third CTE with vector similarity to the RRF query. The DAL signature gains an optional `queryEmbedding?: number[]` parameter. Fully backward compatible.

---

## 6. Platform Tools

Search tools are implemented as **platform tool modules** — scoped factories that live in `agents-api` and get initialized with the execution context. These are NOT MCP protocol implementations. They return AI SDK `tool()` definitions consumed directly by the agent tool loading pipeline. For external MCP clients, a thin adapter registers these tools on the `McpServer` (see Section 6.9).

### 6.1 Architecture

```
agents-api/src/domains/run/platform-tools/
    index.ts                -- loadPlatformTools(context) → ToolSet
    types.ts                -- PlatformToolContext type
    search/
      index.ts              -- createSearchTools(context) → ToolSet
      conversation.ts       -- search_conversation_history tool definition
      artifacts.ts          -- search_artifacts tool definition
      messages.ts           -- get_conversation_messages tool definition
    // future platform tools:
    // analytics/
    // memory/
```

### 6.1.1 When to use each tool pattern

| Pattern | When to use | Examples |
|---|---|---|
| **Default tools** (`default-tools.ts`) | Tight coupling with session internals (session manager, compressor, artifact cache) | `get_reference_artifact`, `compress_context`, `load_skill` |
| **Platform tools** (`platform-tools/`) | Self-contained capabilities with clear context boundaries. Backed by DAL, no session state dependency. Reusable across agent execution, MCP, and API. | `search_conversation_history`, `search_artifacts`, `get_conversation_messages` |
| **External MCP tools** (user-configured) | User-configured, network-connected, discovered via `mcpManager` | Custom MCP servers, third-party integrations |
| **Function tools** (DB-configured) | User-defined functions with sandboxed execution | Custom code tools |
| **Relation tools** (auto-generated) | Agent-to-agent transfer/delegation | `transfer_to_*`, `delegate_to_*` |

```
Tool Loading Pipeline (tool-loading.ts)
  ├── getMcpTools()          -- external MCP servers (user-configured)
  ├── getFunctionTools()     -- DB-configured function tools
  ├── getRelationTools()     -- transfer_to / delegate_to
  ├── getDefaultTools()      -- session-coupled tools (artifact cache, compressor, skills)
  └── getPlatformTools()     -- NEW: platform tool modules (search, future...)
```

### 6.2 Context type

```typescript
// agents-api/src/domains/run/platform-tools/types.ts

export interface PlatformToolContext {
  tenantId: string;
  projectId: string;
  agentId: string;
  userId?: string;             // optional — undefined for non-JWT flows (agent-to-agent, triggers, playground)
  currentConversationId?: string;
  db: AgentsRunDatabaseClient;
}
```

**When userId is undefined:** `loadPlatformTools()` returns an empty ToolSet. Search tools require user identity for scoping (D6). Non-JWT flows (agent-to-agent internal calls, trigger-initiated executions, playground without JWT) silently get no search tools. This is intentional and documented.

### 6.3 Module loader

```typescript
// agents-api/src/domains/run/platform-tools/index.ts

import type { ToolSet } from 'ai';
import type { PlatformToolContext } from './types';
import { createSearchTools } from './search';

export function loadPlatformTools(context: PlatformToolContext): ToolSet {
  if (!context.userId) {
    // No userId = no searchable history (D6). Return empty tools.
    // This is intentional for non-JWT flows (agent-to-agent, triggers, playground).
    return {};
  }

  return {
    ...createSearchTools(context),
    // Future platform tools:
    // ...createAnalyticsTools(context),
    // ...createMemoryTools(context),
  };
}
```

### 6.4 Search platform tools module

```typescript
// agents-api/src/domains/run/platform-tools/search/index.ts

import type { ToolSet } from 'ai';
import type { PlatformToolContext } from '../types';
import { createSearchConversationHistoryTool } from './conversation';
import { createSearchArtifactsTool } from './artifacts';
import { createGetConversationMessagesTool } from './messages';

export function createSearchTools(context: PlatformToolContext): ToolSet {
  return {
    search_conversation_history: createSearchConversationHistoryTool(context),
    search_artifacts: createSearchArtifactsTool(context),
    get_conversation_messages: createGetConversationMessagesTool(context),
  };
}
```

```typescript
// agents-api/src/domains/run/platform-tools/search/conversation.ts

import { z } from 'zod';
import { tool } from 'ai';
import { searchConversations } from '@inkeep/agents-core';
import type { PlatformToolContext } from '../types';

export function createSearchConversationHistoryTool(ctx: PlatformToolContext) {
  return tool({
    description:
      'Search your other past conversations with this user to find relevant context. ' +
      'Returns conversation summaries ranked by relevance. Does NOT search the current conversation. ' +
      'Use when the user references something from a prior conversation, ' +
      'or when you need background context not in the current conversation.',
    inputSchema: z.object({
      query: z.string().describe('Search keywords. Be specific about what you are looking for.'),
      limit: z.number().min(1).max(20).default(5).optional()
        .describe('Maximum number of conversations to return. Default: 5.'),
    }),
    execute: async ({ query, limit = 5 }) => {
      // Scoping is baked in from context — no per-call auth needed
      const results = await searchConversations(ctx.db)({
        scopes: { tenantId: ctx.tenantId, projectId: ctx.projectId },
        agentId: ctx.agentId,
        userId: ctx.userId,
        currentConversationId: ctx.currentConversationId || '',
        query,
        limit,
      });
      return {
        results,
        hint: 'Use get_conversation_messages(conversationId) to load messages from a specific conversation.',
      };
    },
  });
}
```

```typescript
// agents-api/src/domains/run/platform-tools/search/artifacts.ts

export function createSearchArtifactsTool(ctx: PlatformToolContext) {
  return tool({
    description:
      'Search tool results and artifacts from all your conversations with this user ' +
      '(including the current conversation). Returns artifact metadata ranked by relevance. ' +
      'Use when you need to find specific data from past tool executions.',
    inputSchema: z.object({
      query: z.string().describe('Search keywords describing the data you need.'),
      toolName: z.string().optional().describe('Optional: filter to artifacts from a specific tool.'),
      conversationId: z.string().optional().describe('Optional: limit search to a specific conversation.'),
      limit: z.number().min(1).max(20).default(5).optional()
        .describe('Maximum number of artifacts to return. Default: 5.'),
    }),
    execute: async ({ query, toolName, conversationId, limit = 5 }) => {
      const results = await searchArtifacts(ctx.db)({
        scopes: { tenantId: ctx.tenantId, projectId: ctx.projectId },
        agentId: ctx.agentId,
        userId: ctx.userId,
        conversationId,
        query,
        toolName,
        limit,
      });
      return {
        results,
        hint: 'Use get_reference_artifact(artifactId, toolCallId) to load full artifact data.',
      };
    },
  });
}
```

```typescript
// agents-api/src/domains/run/platform-tools/search/messages.ts

export function createGetConversationMessagesTool(ctx: PlatformToolContext) {
  return tool({
    description:
      'Load messages from a specific past conversation. Two modes:\n' +
      '- Without query: returns the most recent messages.\n' +
      '- With query: searches within the conversation and returns message windows ' +
      'around each match (a few messages before and after for context).\n' +
      'Use after search_conversation_history to read relevant parts of a prior conversation.',
    inputSchema: z.object({
      conversationId: z.string().describe('The conversation ID to load messages from.'),
      query: z.string().optional().describe(
        'Optional: search keywords to find specific parts of the conversation. ' +
        'Returns message windows around matches instead of most recent messages.'
      ),
      limit: z.number().min(1).max(50).default(20).optional()
        .describe('Max messages to return (across all windows). Default: 20.'),
      contextWindow: z.number().min(1).max(10).default(3).optional()
        .describe('Number of messages before/after each match to include for context. Default: 3.'),
    }),
    execute: async ({ conversationId, query, limit = 20, contextWindow = 3 }) => {
      // Authorization: DB-level scoping (D6) — verify ownership
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          projectScopedWhere(conversations, { tenantId: ctx.tenantId, projectId: ctx.projectId }),
          eq(conversations.agentId, ctx.agentId),
          eq(conversations.userId, ctx.userId),  // strict userId check
          eq(conversations.id, conversationId),
        ),
      });
      if (!conversation) {
        throw createApiError({ code: 'not_found', message: 'Conversation not found' });
      }

      if (query) {
        // SEARCH MODE: windowed search (see Section 5.4)
        const segments = await searchMessagesWindowed(ctx.db)({
          scopes: { tenantId: ctx.tenantId, projectId: ctx.projectId },
          conversationId,
          query,
          contextWindow,
          limit,
        });
        return { conversationId, mode: 'search', segments };
      } else {
        // RECENT MODE
        const messages = await getVisibleMessages(ctx.db)({
          scopes: { tenantId: ctx.tenantId, projectId: ctx.projectId },
          conversationId,
          visibility: ['user-facing'],
          pagination: { page: 1, limit },
        });
        return { conversationId, mode: 'recent', messages, hasMore: messages.length === limit };
      }
    },
  });
}
```

**Keyword search limitation:** `plainto_tsquery` matches stemmed keywords only. Searching "pricing" won't find "how much should we charge?". This is the key motivation for pgvector Phase 2 — message-level embeddings enable semantic matching. Accepted trade-off for Phase 1.

### 6.5 Integration into tool loading pipeline

```typescript
// agents-api/src/domains/run/agents/generation/tool-loading.ts

import { loadPlatformTools } from '../../platform-tools';

export async function loadToolsAndPrompts(ctx, sessionId, streamRequestId, runtimeContext) {
  const [mcpToolsResult, functionTools, relationTools, defaultTools] = await Promise.all([
    getMcpTools(ctx, sessionId, streamRequestId),
    getFunctionTools(ctx, sessionId, streamRequestId),
    Promise.resolve(getRelationTools(ctx, runtimeContext, sessionId)),
    getDefaultTools(ctx, streamRequestId),
  ]);

  // NEW: load platform tool modules, scoped to this execution
  // userId may be undefined for non-JWT flows — loadPlatformTools returns {} in that case
  const platformTools = loadPlatformTools({
    tenantId: ctx.executionContext.tenantId,
    projectId: ctx.executionContext.projectId,
    agentId: ctx.executionContext.agentId,
    userId: ctx.executionContext.metadata?.endUserId,  // string | undefined
    currentConversationId: ctx.conversationId,
    db: runDbClient,
  });

  const allTools = {
    ...mcpTools,
    ...functionTools,
    ...relationTools,
    ...defaultTools,
    ...platformTools,  // NEW
  };

  // ... rest unchanged
}
```

### 6.6 Integration into external MCP route

The same tool factories are used in `mcp.ts`, but need an **adapter** because `McpServer.tool()` expects `(name, description, paramsSchema, handler) → CallToolResult` while platform tools return AI SDK `tool()` definitions with `{ description, inputSchema, execute } → ToolResult`.

```typescript
// In agents-api/src/domains/run/routes/mcp.ts, within getServer():

import { createSearchTools } from '../../platform-tools/search';
import { adaptToolForMcp } from '../../platform-tools/mcp-adapter';

const userId = executionContext.metadata?.endUserId;

if (userId) {
  // NOTE: userId is required for search tools (D6). External MCP clients
  // connecting without a user-scoped JWT will not have search tools available.
  // This is intentional — search requires user identity for scoping.
  const searchTools = createSearchTools({
    tenantId, projectId, agentId,
    userId,
    currentConversationId: conversationId,
    db: runDbClient,
  });

  // Adapt AI SDK tools to MCP protocol format
  for (const [name, toolDef] of Object.entries(searchTools)) {
    adaptToolForMcp(server, name, toolDef);
  }
}
```

```typescript
// agents-api/src/domains/run/platform-tools/mcp-adapter.ts
// Adapts an AI SDK tool() definition to McpServer.tool() registration

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from 'ai';

export function adaptToolForMcp(server: McpServer, name: string, toolDef: Tool<any, any>) {
  server.tool(
    name,
    toolDef.description,
    toolDef.parameters,  // AI SDK uses 'parameters', MCP uses paramsSchema — both are Zod
    async (params): Promise<CallToolResult> => {
      try {
        const result = await toolDef.execute(params, {} as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
```

### 6.7 External MCP client behavior when userId is unavailable

External MCP clients connecting without a user-scoped JWT will not have search tools registered on their server. This means:
- `tool/list` response will NOT include search tools
- The client cannot call search tools (they don't exist in that session)
- This is intentional per D6 — not an error, just an absence

If the client later authenticates with a JWT (e.g., via session upgrade), the tools become available on subsequent connections.

### 6.8 Extend `get_reference_artifact` for cross-conversation retrieval (D13)

The existing `get_reference_artifact` tool (in `default-tools.ts`) is session-scoped. For artifacts from prior conversations found via `search_artifacts`, it needs a DB fallback.

```typescript
// In default-tools.ts, modify get_reference_artifact execute():
execute: async ({ artifactId, toolCallId }) => {
  // 1. Try session cache first (existing behavior — fast for current conversation)
  const artifactService = agentSessionManager.getArtifactService(streamRequestId);
  if (artifactService) {
    const cached = await artifactService.getArtifactFull(artifactId, toolCallId);
    if (cached) return formatArtifactResult(cached);
  }

  // 2. Fallback: query ledgerArtifacts directly (cross-conversation)
  const artifacts = await getLedgerArtifacts(runDbClient)({
    scopes: { tenantId, projectId },
    artifactId,
    toolCallId: toolCallId || undefined,
  });

  if (!artifacts.length) {
    throw createApiError({ code: 'not_found', message: 'Artifact not found or not accessible' });
  }

  // 3. Authorization: verify artifact belongs to a conversation owned by this user+agent
  const artifact = artifacts[0];
  const ownerConversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, artifact.contextId),        // contextId IS conversationId
      eq(conversations.tenantId, tenantId),
      eq(conversations.projectId, projectId),
      eq(conversations.userId, currentUserId),          // strict userId (D6)
      eq(conversations.agentId, currentAgentId),
    ),
  });
  if (!ownerConversation) {
    throw createApiError({ code: 'not_found', message: 'Artifact not found or not accessible' });
  }

  return formatArtifactResult(artifact);
},
```

---

## 7. Prompt Changes

No prompt template changes in Phase 1.

- **Current-conversation artifacts:** Keep existing `<available_artifacts>` rendering unchanged.
- **Cross-conversation artifacts:** Discovered via `search_artifacts` tool.
- **Conversation history:** Keep existing history + compression for current conversation. `search_conversation_history` handles prior conversations.
- **Tool descriptions:** Automatically included by AI SDK from tool definitions.

---

## 8. Files to Modify

### File structure overview

```
packages/agents-core/
  src/
    db/runtime/
      runtime-schema.ts              # MODIFIED: add conversationSearchIndex, artifactSearchIndex tables
      custom-types.ts                # NEW: shared Drizzle custom types (tsvectorColumn, future vectorColumn)
    data-access/runtime/
      conversations.ts               # EXISTING: list, get, create conversations (unchanged)
      messages.ts                    # EXISTING: message CRUD (unchanged)
      ledgerArtifacts.ts             # MODIFIED: coordinated deletes for search index (no schema changes)
      conversationSearchIndex.ts     # NEW: UPSERT/delete for conversation_search_index table
      artifactSearchIndex.ts         # NEW: INSERT/delete for artifact_search_index table
      conversationSearch.ts          # NEW: searchConversations() — keyword + recency RRF query
      artifactSearch.ts              # NEW: searchArtifacts() — keyword + recency RRF query
      messageSearch.ts               # NEW: searchMessagesWindowed() — within-conversation windowed search
    validation/
      search-schemas.ts              # NEW: shared Zod schemas (ConversationSearchResult, ArtifactSearchResult, MessageWindow)

agents-api/
  src/
    domains/
      run/
        routes/
          conversations.ts           # MODIFIED (Phase 1): add GET /conversations/search endpoint
          artifacts.ts               # NEW (Phase 1): end-user runtime artifact endpoints
                                     #   GET /artifacts/search, GET /artifacts/{artifactId}
          mcp.ts                     # MODIFIED (Phase 2): register search tools on external MCP server
        platform-tools/              # NEW (Phase 2): platform tool modules
            types.ts                 #   PlatformToolContext type
            index.ts                 #   loadPlatformTools(context) → ToolSet
            mcp-adapter.ts           #   adaptToolForMcp() — AI SDK → McpServer format
            search/
              index.ts               #   createSearchTools(context) → ToolSet
              conversation.ts        #   search_conversation_history tool
              artifacts.ts           #   search_artifacts tool
              messages.ts            #   get_conversation_messages tool
        agents/
          generation/
            tool-loading.ts          # MODIFIED (Phase 2): add loadPlatformTools() as 5th tool category
          tools/
            default-tools.ts         # MODIFIED (Phase 2): extend get_reference_artifact with DB fallback (D13)
        handlers/
          executionHandler.ts        # MODIFIED (Phase 1): UPSERT conversation search index after turn
        compression/
          ConversationCompressor.ts  # MODIFIED (Phase 1): UPSERT search index with compression summary
      manage/
        routes/
          conversations.ts           # MODIFIED (Phase 1): add search + message search endpoints
          runtimeArtifacts.ts        # NEW (Phase 1): admin runtime artifact endpoints
                                     #   (separate from artifactComponents.ts which manages type definitions)

packages/agents-sdk/
  src/
    conversations.ts                 # MODIFIED (Phase 1): add search() and searchMessages() methods
    artifacts.ts                     # MODIFIED (Phase 1): add search() method
```

**Conventions followed:**
- Search endpoints added to EXISTING route files for conversations (not separate files)
- Runtime artifact routes get NEW files (`artifacts.ts` for run, `runtimeArtifacts.ts` for manage) to distinguish from `artifactComponents.ts` (which manages artifact type *definitions*, not runtime instances)
- DAL files sit alongside existing `conversations.ts`, `messages.ts`, `ledgerArtifacts.ts` in `data-access/runtime/`
- Platform tools (Phase 2) get their own directory under `run/platform-tools/` — clearly separate from routes, handlers, and default tools
- Each file is annotated with which phase it belongs to

### Files by phase:

#### Phase 1: Data model + DAL + API endpoints

**New files:**
| File | Purpose |
|------|---------|
| `packages/agents-core/src/db/runtime/custom-types.ts` | Shared Drizzle custom types (`tsvectorColumn`, future `vectorColumn`) |
| `packages/agents-core/src/data-access/runtime/conversationSearchIndex.ts` | CRUD for conversation_search_index (UPSERT with tsvector) |
| `packages/agents-core/src/data-access/runtime/artifactSearchIndex.ts` | CRUD for artifact_search_index (INSERT with tsvector) |
| `packages/agents-core/src/data-access/runtime/conversationSearch.ts` | `searchConversations()` — keyword + recency RRF |
| `packages/agents-core/src/data-access/runtime/artifactSearch.ts` | `searchArtifacts()` — keyword + recency RRF |
| `packages/agents-core/src/data-access/runtime/messageSearch.ts` | `searchMessagesWindowed()` — within-conversation windowed search |
| `packages/agents-core/src/validation/search-schemas.ts` | Shared Zod schemas (used by API, MCP, SDK, and agent tools) |
| `agents-api/src/domains/run/routes/artifacts.ts` | End-user runtime artifact endpoints (search, get by ID) |
| `agents-api/src/domains/manage/routes/runtimeArtifacts.ts` | Admin runtime artifact endpoints (search, get by ID) |

**Modified files:**
| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `conversationSearchIndex`, `artifactSearchIndex` tables (no changes to `ledgerArtifacts`) |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Coordinated deletes for search index (no schema changes) |
| `agents-api/src/domains/run/routes/conversations.ts` | Add `GET /conversations/search` endpoint |
| `agents-api/src/domains/manage/routes/conversations.ts` | Add `GET /projects/{projectId}/conversations/search` and `GET /projects/{projectId}/conversations/{id}/messages/search` |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | Fire-and-forget UPSERT conversation search index after turn (concatenated text, no LLM) |
| `agents-api/src/domains/run/compression/ConversationCompressor.ts` | Fire-and-forget UPSERT search index with additive compression summary |
| `packages/agents-sdk/src/conversations.ts` | Add `search()` and `searchMessages()` methods |
| `packages/agents-sdk/src/artifacts.ts` | Add `search()` method |

#### Phase 2: Platform tools + MCP exposure

**New files:**
| File | Purpose |
|------|---------|
| `agents-api/src/domains/run/platform-tools/types.ts` | `PlatformToolContext` type |
| `agents-api/src/domains/run/platform-tools/index.ts` | `loadPlatformTools(context)` — module loader |
| `agents-api/src/domains/run/platform-tools/search/index.ts` | `createSearchTools(context)` — search tool factory |
| `agents-api/src/domains/run/platform-tools/search/conversation.ts` | `search_conversation_history` tool |
| `agents-api/src/domains/run/platform-tools/search/artifacts.ts` | `search_artifacts` tool |
| `agents-api/src/domains/run/platform-tools/search/messages.ts` | `get_conversation_messages` tool |
| `agents-api/src/domains/run/platform-tools/mcp-adapter.ts` | `adaptToolForMcp()` — converts AI SDK tools to McpServer format |

**Modified files:**
| File | Change |
|------|--------|
| `agents-api/src/domains/run/agents/generation/tool-loading.ts` | Add `loadPlatformTools()` as 5th tool category |
| `agents-api/src/domains/run/routes/mcp.ts` | Register search tools on external MCP server via adapter |
| `agents-api/src/domains/run/agents/tools/default-tools.ts` | Extend `get_reference_artifact` with DB fallback (D13) |

### Migration files:
| Migration | Content |
|-----------|---------|
| `0028_conversation_search_index.sql` | Create `conversation_search_index` table with GIN + scope indexes |
| `0029_artifact_search_index.sql` | Create `artifact_search_index` table with GIN + scope + tool indexes |

---

## 9. Phasing

### Phase 1: Data model + DAL + API endpoints
The foundation. Testable independently, follows existing patterns, gives manage UI + SDK immediate access.

**Step 1.1: Schema + migrations**
- Add `tsvectorColumn` custom type to `custom-types.ts`
- Add `conversationSearchIndex` and `artifactSearchIndex` tables to `runtime-schema.ts`
- No changes to `ledgerArtifacts` schema — `agentId` lives only on search index tables
- Generate and apply migrations (0028, 0029)

**Step 1.2: Shared schemas**
- Add `ConversationSearchResultSchema`, `ArtifactSearchResultSchema`, `MessageWindowSchema` to `validation/search-schemas.ts`
- These are used by every access layer (API, MCP, SDK, agent tools)

**Step 1.3: Data access layer**
- `conversationSearchIndex.ts` — UPSERT/delete for conversation_search_index (with application-managed tsvector)
- `artifactSearchIndex.ts` — INSERT/delete for artifact_search_index
- `conversationSearch.ts` — `searchConversations()` with keyword + recency RRF
- `artifactSearch.ts` — `searchArtifacts()` with keyword + recency RRF
- `messageSearch.ts` — `searchMessagesWindowed()` for within-conversation windowed search
- Modify `ledgerArtifacts.ts` — coordinated deletes for search index (no schema changes)

**Step 1.4: Write pipeline (indexing)**
- Modify `executionHandler.ts` — fire-and-forget UPSERT conversation search index after every turn (concatenated text, no LLM)
- Modify `ConversationCompressor.ts` — fire-and-forget UPSERT search index with additive compression summary when compression fires
- Insert into artifact search index on artifact creation (fire-and-forget, `agentId` from execution context)

**Step 1.5: API endpoints (conversations)**
- Add `GET /conversations/search` to `run/routes/conversations.ts` (same auth as existing list/get)
- Add `GET /projects/{projectId}/conversations/search` to `manage/routes/conversations.ts`
- Add `GET /projects/{projectId}/conversations/{id}/messages/search` to `manage/routes/conversations.ts`

**Step 1.6: API endpoints (runtime artifacts — new, mirrors conversations)**
- Create `run/routes/artifacts.ts` — end-user artifact list, get by ID, search
- Create `manage/routes/runtimeArtifacts.ts` — admin artifact list, get by ID, search
- Same auth patterns as conversation endpoints

**Step 1.7: SDK methods**
- Add `client.conversations.search()` and `client.conversations.searchMessages()`
- Add `client.artifacts.search()`

### Phase 2: Platform tools + MCP exposure
Platform tool modules for agent execution AND MCP adapter for external clients. Ships together — the tool definitions, the agent loading, and the MCP registration are all one unit.

**Step 2.1: Platform tool module structure**
- Create `platform-tools/types.ts` — `PlatformToolContext` type
- Create `platform-tools/index.ts` — `loadPlatformTools(context)` aggregates all modules
- Create `platform-tools/search/index.ts` — `createSearchTools(context)` → ToolSet
- Create `platform-tools/search/conversation.ts`, `artifacts.ts`, `messages.ts` — AI SDK `tool()` definitions

**Step 2.2: MCP adapter**
- Create `platform-tools/mcp-adapter.ts` — `adaptToolForMcp()` converts AI SDK tools to McpServer format

**Step 2.3: Integration into agent tool loading**
- Modify `tool-loading.ts` — add `loadPlatformTools()` as 5th tool category
- Platform tools loaded in parallel alongside MCP, function, relation, and default tools

**Step 2.4: Register on external MCP server**
- Modify `mcp.ts` — call `createSearchTools()` + `adaptToolForMcp()` to register
- Same `runAuth` middleware, same scoping
- Clients without userId JWT get no search tools (D6 — documented, not an error)

**Step 2.5: Cross-conversation artifact retrieval**
- Modify `default-tools.ts` — extend `get_reference_artifact` with DB fallback (D13)

#### Auth model: follows existing conversation API patterns exactly

Search endpoints use the **same auth middleware, same scoping, and same access patterns** as the existing conversation list/get endpoints. No new auth mechanism needed.

| Domain | Existing pattern | Search follows same pattern |
|---|---|---|
| **Run API** | `GET /conversations` — API key (project) + JWT (`sub` = endUserId) | `GET /conversations/search` — same API key + JWT |
| **Manage API** | `GET /projects/{projectId}/conversations` — session/bearer + `requireProjectPermission('view')` | `GET /projects/{projectId}/conversations/search` — same permissions |
| **External MCP (Phase 2)** | `mcp.ts` route — goes through `runAuth` middleware (API key + JWT). AgentId from MCP endpoint path. UserId from JWT sub claim. | Search tools registered via adapter, same auth |
| **Platform tools (Phase 2)** | Tool loading pipeline — execution context carries `tenantId`, `projectId`, `agentId`, `userId` | `loadPlatformTools(context)` — same execution context. No tools if userId is undefined. |

**For external tools (Cursor, Claude Code, etc.):** They connect to the MCP endpoint the same way a chat widget connects — API key + JWT. The MCP server goes through `runAuth` middleware. Search results are automatically scoped by the JWT's `sub` claim. No special auth flow needed.

#### Manage API endpoints (admin/builder access)

These go in `agents-api/src/domains/manage/routes/` and require project-level permissions. Thin wrappers over the same search DAL. Same auth as existing `GET /projects/{projectId}/conversations`.

```
GET /projects/{projectId}/conversations/search
  Query params: query (required), agentId?, userId?, limit?
  Auth: requireProjectPermission('view')
  Returns: { data: ConversationSearchResult[], pagination }
  Notes: Admin can search across all users within a project. Optional userId filter.

GET /projects/{projectId}/artifacts/search
  Query params: query (required), agentId?, userId?, toolName?, conversationId?, limit?
  Auth: requireProjectPermission('view')
  Returns: { data: ArtifactSearchResult[], pagination }

GET /projects/{projectId}/conversations/{id}/messages/search
  Query params: query (required), contextWindow?, limit?
  Auth: requireProjectPermission('view')
  Returns: { data: { segments: MessageWindow[] }, totalMatches }
```

#### Run API endpoints (end-user access)

These go in `agents-api/src/domains/run/routes/` — same auth as existing `GET /conversations` and `GET /conversations/{conversationId}`. API key + JWT, auto-scoped by the JWT `sub` claim.

```
GET /conversations/search
  Query params: query (required), agentId?, limit?
  Auth: inheritedRunApiKeyAuth() + JWT sub claim for userId
  Scoping: tenantId + projectId from API key, userId from JWT (always applied).
           agentId is optional — if omitted, searches across all agents (matches existing
           GET /conversations list behavior which is cross-agent).
  Returns: { data: ConversationSearchResult[], pagination }

GET /artifacts/search
  Query params: query (required), agentId?, toolName?, conversationId?, limit?
  Auth: inheritedRunApiKeyAuth() + JWT
  Scoping: Same as above — userId always from JWT, agentId optional.
  Returns: { data: ArtifactSearchResult[], pagination }

GET /conversations/{conversationId}/messages/search
  Query params: query (required), contextWindow?, limit?
  Auth: inheritedRunApiKeyAuth() + JWT
  Scoping: Verifies conversation.userId matches JWT sub claim.
  Returns: { data: { segments: MessageWindow[] }, totalMatches }
```

#### SDK methods

```typescript
const client = new InkeepAgentsClient({ apiKey, baseUrl });

const results = await client.conversations.search({ query: 'pricing discussion', limit: 5 });
const artifacts = await client.artifacts.search({ query: 'user engagement metrics', toolName: 'analytics_query' });
const messages = await client.conversations.searchMessages({ conversationId: 'conv-123', query: 'pricing tiers', contextWindow: 3 });
```

#### Shared response schemas (used by ALL access layers — MCP, API, SDK)

```typescript
// packages/agents-core/src/validation/search-schemas.ts

const ConversationSearchResultSchema = z.object({
  conversationId: z.string(),
  title: z.string().nullable(),
  summary: z.string(),
  lastUserMessage: z.string().nullable(),
  messageCount: z.number(),
  updatedAt: z.string(),
  relevanceScore: z.number(),
});

const ArtifactSearchResultSchema = z.object({
  artifactId: z.string(),
  toolCallId: z.string().nullable(),
  conversationId: z.string(),
  name: z.string().nullable(),
  toolName: z.string().nullable(),
  description: z.string().nullable(),
  estimatedTokens: z.number().nullable(),
  isOversized: z.boolean(),
  createdAt: z.string(),
  relevanceScore: z.number(),
});

const MessageWindowSchema = z.object({
  matchedMessageId: z.string(),
  messages: z.array(z.object({
    id: z.string(),
    role: z.string(),
    content: z.string(),
    messageType: z.string(),
    fromSubAgentId: z.string().nullable(),
    toolName: z.string().nullable(),
    createdAt: z.string(),
    isMatch: z.boolean(),
  })),
});
```

#### Authorization matrix

| Access layer | Scope | Who can access |
|---|---|---|
| **Platform tools (Phase 2)** | Own agent + own user, across conversations | The agent itself during execution |
| **External MCP (Phase 2)** | Scoped by API key (project) + JWT sub claim (userId). AgentId from MCP endpoint path. | External agents/clients with MCP access |
| **Run API (Phase 1)** | Own user (JWT), across conversations for that agent | End-users via authenticated chat sessions |
| **Manage API (Phase 1)** | Any user in project (admin) | Builders/admins via manage UI or API key |
| **SDK (Phase 1)** | Depends on auth method (API key = manage scope, JWT = end-user scope) | Developers building on the platform |

#### Files for Phase 1

| File | Change |
|------|--------|
| `agents-api/src/domains/run/routes/conversations.ts` | MODIFIED: add `GET /conversations/search` endpoint (same auth pattern as existing list/get) |
| `agents-api/src/domains/run/routes/artifacts.ts` | NEW: end-user runtime artifact endpoints mirroring conversations pattern (`GET /artifacts/search`, `GET /artifacts/{artifactId}`) |
| `agents-api/src/domains/manage/routes/conversations.ts` | MODIFIED: add `GET /projects/{projectId}/conversations/search` and `GET /projects/{projectId}/conversations/{id}/messages/search` |
| `agents-api/src/domains/manage/routes/runtimeArtifacts.ts` | NEW: admin runtime artifact endpoints mirroring conversations pattern (separate from `artifactComponents.ts` which manages type definitions) |
| `packages/agents-sdk/src/conversations.ts` | MODIFIED: add `search()` and `searchMessages()` methods |
| `packages/agents-sdk/src/artifacts.ts` | MODIFIED: add `search()` method |

### Phase 3 (future): Consolidate internal artifact access
Shift internal agent code to use the search/retrieval API as the canonical path for artifact access, replacing the current mix of session cache + direct DAL calls.

- `ArtifactService` session cache becomes a performance layer in front of the API, not a separate access pattern
- `get_reference_artifact` routes through the artifact API instead of direct `getLedgerArtifacts()` calls
- Authorization enforced in one place (the API route) instead of duplicated across access points
- Internal calls use `getInProcessFetch()` for same-instance routing
- Simplifies the execution handler and session manager artifact code

### Phase 4 (future): pgvector semantic search upgrade
- Enable pgvector extension
- Add `embedding vector(1536)` column to both search index tables
- Add HNSW indexes, async embedding pipeline, embedding service
- Upgrade search DAL to include vector similarity in RRF scoring
- **Message-level embeddings** for semantic search within conversations — addresses the keyword-only limitation in `get_conversation_messages` windowed search. Most impactful upgrade: enables matching on meaning ("how much should we charge?" matches "pricing").

### Phase 5 (future): Prompt optimization + granular fact search
- Replace artifact dump with compact manifest for current-conversation artifacts
- Reduce injected conversation history to recent N messages only
- Auto-inject top-K relevant context from prior conversations
- Consider `conversation_summary_facts` table for granular fact search (OQ6)

### Phase 6 (future): Advanced retrieval
- Cross-agent search (opt-in)
- Graph-based memory (entity relationships)

### Phase 7 (future): Artifact storage optimization
- Move large artifact data from `ledger_artifacts.parts` JSONB column to blob storage (S3/Vercel)
- Store blob URI reference in `parts` instead of inline data
- Reuse existing blob storage infrastructure (`agents-api/src/domains/run/services/blob-storage/`)
- Benefits: reduced DB bloat, faster table scans, no JSONB size limits
- Orthogonal to search — search indexes metadata only, not full artifact data

---

## 10. Acceptance Criteria

1. **Search index tables exist and are populated:**
   - `conversation_search_index` created with GIN + scope indexes
   - `artifact_search_index` created with GIN + scope + tool indexes
   - tsvector columns populated via application-managed `to_tsvector('english', search_text)` in UPSERT

2. **Conversation search index stays current:**
   - After every user+AI turn, a fire-and-forget UPSERT writes concatenated title + user messages
   - Compression events append richer structured summary to search text (additive, not overwrite — D16)
   - Two sources only: concatenated and compression_summary (no caller-provided in Phase 1 — D17)
   - Index scoped by tenantId + projectId (always required); agentId + userId conditionally applied by caller
   - Failures logged and self-healing on next turn; no user-visible impact

3. **Artifact search index is populated:**
   - Every new artifact gets a row in `artifact_search_index` at creation time
   - `searchText` includes name, description, summary, tool name
   - `toolCallId` stored for retrieval workflow
   - `agentId` populated from execution context (NOT from `ledgerArtifacts` — no schema changes to that table)
   - Scoped with conversationId (from contextId) + agentId + userId

4. **Search tools work end-to-end:**
   - `search_conversation_history(query)` returns relevant PRIOR conversations (excludes current)
   - `search_artifacts(query)` returns relevant artifacts with `toolCallId`
   - `get_conversation_messages(conversationId)` returns paginated messages with DB-level auth
   - `get_reference_artifact` works for both current-session and cross-conversation artifacts
   - All tools enforce tenant + project scoping. Run API/platform tools always pass userId from JWT. Manage API allows optional agentId/userId for admin queries.

5. **No regression:**
   - Existing `get_reference_artifact` session-cache path unchanged (DB fallback is additive)
   - Existing conversation history + compression unchanged
   - Existing artifact creation/retrieval unchanged
   - `ledgerArtifacts` schema unchanged — no new columns
   - Fire-and-forget index UPSERT does not block user responses
   - Zero LLM calls in the API server — no hot-path latency for any conversation length

---

## 11. Open Questions

| # | Question | Priority | Status |
|---|----------|----------|--------|
| OQ1 | ~~What model for conversation summarization?~~ | P0 | RESOLVED → D9 |
| OQ2 | ~~What visibility for get_conversation_messages?~~ | P0 | RESOLVED → D10 |
| OQ3 | Backfill strategy for existing conversations and artifacts? | P2 | Deferred to after Phase 1 ships |
| OQ4 | Rate limiting on search tools to prevent LLM over-searching? | P2 | Monitor first |
| OQ5 | When to trigger pgvector Phase 2? | P2 | When keyword search quality proves insufficient |
| OQ6 | Should compression summary facts be separately queryable as individual rows? | P2 | DIRECTED: additive for now. Revisit if flattened summaries prove too coarse. |

---

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Keyword search misses semantically relevant results | Acceptable for Phase 1; pgvector Phase 2 designed in |
| LLM doesn't use search tools effectively | Good tool descriptions; monitor tool usage patterns |
| Fire-and-forget UPSERT silently fails | Logged with context (conversationId, tenantId). Self-healing on next turn. Monitor error rates; add retry queue if needed |
| Cross-tenant data leakage via search | Strict userId equality (D6); DB-level WHERE clause in all queries |
| Long conversations have lower search quality with concatenated text only | Additive model (D16): compression summary appends to concatenated text, preserving both exact keywords and semantic coverage |
| Orphaned artifact_search_index rows | Coordinated deletes in `deleteLedgerArtifactsByTask` and `deleteLedgerArtifactsByContext`; conversation cascade deletes handle `conversation_search_index` via FK |
| pglite test compatibility with tsvector/GIN | pglite supports `to_tsvector` and `plainto_tsquery` but GIN index behavior may differ. Add integration test against real Postgres for search functionality; unit tests can mock the search DAL. |
