# SPEC: Queryable Conversation History & Artifact Indexing

## 1. Problem Statement

**Situation:** Inkeep agents have conversations with users that produce messages and tool-result artifacts. These accumulate across multiple conversations per user per agent.

**Complication:** Currently ALL conversation history (or lossy compression summaries) and ALL artifacts are dumped into every LLM call regardless of relevance. This wastes context budget, limits conversation length, blocks oversized artifacts, and agents cannot recall prior conversations.

**Resolution:** Give agents tools to search their own conversation history and artifacts on demand. Replace dump-everything with manifest + on-demand retrieval. Scope: tenant + project + agent + user, across conversations.

---

## 2. Decisions Log

| # | Decision | Status | Type |
|---|----------|--------|------|
| D1 | Denormalize `conversationId` + `agentId` onto `ledgerArtifacts` | LOCKED | Technical |
| D2 | Update conversation search index every user+AI turn | LOCKED | Technical |
| D3 | Search tools default for all agents | LOCKED | Product |
| D4 | Postgres full-text search (tsvector) — no embeddings in Phase 1 | LOCKED | Technical |
| D5 | Two search indexes: conversation-level + artifact-level | LOCKED | Technical |
| D6 | Scope: tenant + project + agent + user, across conversations | LOCKED | Product |
| D7 | tsvector keyword search + recency weighting (RRF) | LOCKED | Technical |
| D8 | Synchronous index update on write (no async pipeline needed) | LOCKED | Technical |
| D9 | Conversation summarization uses agent's configured summarization model (for long convos) | LOCKED | Technical |
| D10 | `get_conversation_messages` returns user-facing + user messages + tool results | LOCKED | Product |
| D11 | Tables designed with nullable `embedding` column for future pgvector upgrade | LOCKED | Technical |

---

## 3. Data Models

### 3.1 New Table: `conversation_search_index`

One row per conversation. Updated after every user+AI turn to stay current. Designed for tsvector now, with a nullable `embedding` column reserved for future pgvector upgrade.

```typescript
// packages/agents-core/src/db/runtime/runtime-schema.ts

export const conversationSearchIndex = pgTable(
  'conversation_search_index',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }),

    // Searchable text content (updated every turn)
    searchText: text('search_text').notNull(),            // title + concatenated user messages
    summarySource: varchar('summary_source', { length: 50 }).notNull()
      .default('concatenated'),                           // 'concatenated' | 'llm_summary' | 'compression_summary'
    messageCount: integer('message_count').notNull().default(0),

    // Full-text search (auto-generated stored column)
    // SQL: GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED
    searchVector: tsvector('search_vector'),

    // Reserved for future pgvector upgrade — nullable, not used in Phase 1
    // When pgvector is added: ALTER TABLE ... ALTER COLUMN embedding TYPE vector(1536)
    // For now, leave null. Search logic ignores this column.
    // embedding: customVector('embedding', 1536),

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

    // Composite index for scoped queries (tenant + project + agent + user)
    index('conversation_search_scope_idx').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.userId,
    ),
  ]
);
```

### 3.2 New Table: `artifact_search_index`

One row per artifact. Created when the artifact is saved. Same pattern — tsvector now, pgvector-ready.

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
    userId: varchar('user_id', { length: 256 }),

    // Searchable text content
    searchText: text('search_text').notNull(),             // name + description + summary + tool name
    toolName: varchar('tool_name', { length: 256 }),
    artifactType: varchar('artifact_type', { length: 256 }),
    artifactName: varchar('artifact_name', { length: 256 }),

    // Full-text search (auto-generated stored column)
    searchVector: tsvector('search_vector'),

    // Reserved for future pgvector upgrade — nullable, not used in Phase 1
    // embedding: customVector('embedding', 1536),

    // Size metadata
    estimatedTokens: integer('estimated_tokens'),
    isOversized: boolean('is_oversized').default(false),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.artifactId] }),

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

### 3.3 Schema Migration: Add columns to `ledgerArtifacts`

```sql
ALTER TABLE ledger_artifacts
  ADD COLUMN conversation_id varchar(256),
  ADD COLUMN agent_id varchar(256);

CREATE INDEX ledger_artifacts_conversation_idx
  ON ledger_artifacts (tenant_id, project_id, conversation_id);

CREATE INDEX ledger_artifacts_agent_idx
  ON ledger_artifacts (tenant_id, project_id, agent_id);
```

### 3.4 No pgvector extension needed in Phase 1

Unlike the previous spec revision, no `CREATE EXTENSION vector` is required. The tables are designed so that a future migration can add pgvector:

```sql
-- Future Phase 2 migration (not part of this spec):
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE conversation_search_index ADD COLUMN embedding vector(1536);
ALTER TABLE artifact_search_index ADD COLUMN embedding vector(1536);
CREATE INDEX conversation_search_vector_idx ON conversation_search_index
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX artifact_search_vector_idx ON artifact_search_index
  USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Index Update Pipeline

### 4.1 When indexes are updated

| Event | What gets updated | Mechanism |
|-------|-------------------|-----------|
| User+AI turn completes | Conversation search index (UPSERT) | Synchronous after response, before returning |
| Compression fires | Conversation search index (UPSERT with richer summary) | Synchronous after compression completes |
| Artifact created | Artifact search index (INSERT) | Synchronous during artifact save |
| Conversation title updated | Conversation search index (UPDATE) | Synchronous on title change |

**No async pipeline needed.** The tsvector column is auto-generated by Postgres (`GENERATED ALWAYS AS ... STORED`), so updating `search_text` automatically rebuilds the tsvector. The write is a single UPSERT — fast and transactional.

### 4.2 Conversation index update flow

**On every user+AI turn:**

```
User sends message → Agent responds → Response streamed to user
                                         ↓ (after stream completes)
                                    1. Fetch conversation metadata (title, agentId, userId)
                                    2. Fetch all user-facing messages for this conversation
                                    3. Build searchText:
                                       - Extract text from user messages
                                       - If total text < ~2000 tokens:
                                         searchText = (title || '') + '\n' + concatenated user messages
                                         summarySource = 'concatenated'
                                       - If > ~2000 tokens:
                                         searchText = LLM summary (agent's summarization model)
                                         summarySource = 'llm_summary'
                                    4. UPSERT into conversation_search_index
                                       (Postgres auto-generates searchVector from searchText)
```

**On compression event (richer, structured summary):**

When `ConversationCompressor` or `MidGenerationCompressor` fires, it produces a `ConversationSummarySchema` with structured fields (`conversation_overview`, `user_goals`, `key_outcomes.completed`, `key_outcomes.discoveries`, `context_for_continuation`, etc.). This is much richer than concatenated user messages.

```
Compression fires → Structured summary produced
                         ↓
                    1. Build searchText from summary fields:
                       searchText = [
                         title,
                         summary.conversation_overview,
                         summary.user_goals?.primary,
                         ...(summary.key_outcomes?.completed || []),
                         ...(summary.key_outcomes?.discoveries || []),
                         ...(summary.context_for_continuation?.important_context || []),
                       ].filter(Boolean).join('\n')
                    2. summarySource = 'compression_summary'
                    3. UPSERT into conversation_search_index
                       (overwrites previous concatenated/llm_summary version)
```

**Priority order for searchText source:**
1. `compression_summary` — richest, structured, produced by compression pipeline
2. `llm_summary` — generated when user messages exceed ~2000 tokens (pre-compression)
3. `concatenated` — title + raw user messages (default for short conversations)

A compression summary always overwrites prior searchText because it contains the most complete, structured representation of the conversation.

### 4.3 Artifact index update flow

```
Tool executes → Artifact saved to ledger_artifacts (with new conversationId, agentId)
                     ↓ (same transaction or immediately after)
                INSERT into artifact_search_index:
                  searchText = [name, description, summary, 'tool: ' + toolName]
                    .filter(Boolean).join(' | ')
                  (Postgres auto-generates searchVector)
```

---

## 5. Search Implementation

### 5.1 Search query: keyword + recency via RRF

```sql
-- Search conversations: full-text keyword match + recency ranking via RRF
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
    AND agent_id = $4
    AND (user_id = $5 OR user_id IS NULL)
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
    AND agent_id = $4
    AND (user_id = $5 OR user_id IS NULL)
  LIMIT 50
)
SELECT
  COALESCE(k.conversation_id, r.conversation_id) AS conversation_id,
  (COALESCE(1.0 / (60 + k.keyword_rank), 0) +
   COALESCE(0.5 / (60 + r.recency_rank), 0)) AS rrf_score
FROM keyword_results k
FULL JOIN recency_results r USING (conversation_id)
ORDER BY rrf_score DESC
LIMIT $6;
```

**Note:** Uses `plainto_tsquery` (not `to_tsquery`) so raw user queries work without Boolean syntax. Uses `ts_rank_cd` (cover density) for better phrase relevance. Recency is weighted at 0.5x vs keyword at 1.0x.

### 5.2 Data access layer

```typescript
// packages/agents-core/src/data-access/runtime/conversationSearch.ts

export const searchConversations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    userId?: string;
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
  }>> => { ... };

// packages/agents-core/src/data-access/runtime/artifactSearch.ts

export const searchArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    userId?: string;
    conversationId?: string;
    query: string;
    toolName?: string;
    artifactType?: string;
    limit?: number;
  }): Promise<Array<{
    artifactId: string;
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

### 5.3 Future pgvector upgrade path

When semantic search is needed, the search DAL adds a third CTE to the RRF query:

```sql
-- Future: add vector_results CTE alongside keyword_results and recency_results
vector_results AS (
  SELECT conversation_id,
    ROW_NUMBER() OVER (ORDER BY embedding <=> $7::vector) AS vector_rank
  FROM conversation_search_index
  WHERE tenant_id = $2 AND project_id = $3 AND agent_id = $4
    AND embedding IS NOT NULL  -- only rows with embeddings
  ORDER BY embedding <=> $7::vector
  LIMIT 50
)
-- Then add to RRF: COALESCE(1.0 / (60 + v.vector_rank), 0)
```

The DAL signature gains an optional `queryEmbedding?: number[]` parameter. When provided and the column exists, vector search is included in RRF scoring. When absent, behavior is identical to Phase 1.

---

## 6. LLM Tools

All three tools are registered in `getDefaultTools()` in `default-tools.ts`, available to all agents by default.

### 6.1 `search_conversation_history`

```typescript
search_conversation_history: tool({
  description:
    'Search your past conversations with this user to find relevant context. ' +
    'Returns conversation summaries ranked by relevance. ' +
    'Use when the user references something from a prior conversation, ' +
    'or when you need background context not in the current conversation.',
  inputSchema: z.object({
    query: z.string().describe(
      'Search keywords. Be specific about what you are looking for.'
    ),
    limit: z.number().min(1).max(20).default(5).optional().describe(
      'Maximum number of conversations to return. Default: 5.'
    ),
  }),
  execute: async ({ query, limit = 5 }) => {
    // 1. Call searchConversations DAL with query text
    // 2. Join with conversation_search_index for metadata
    // 3. Return ranked results
    return {
      results: [
        {
          conversationId: string,
          title: string | null,
          summary: string,           // searchText (truncated)
          lastUserMessage: string | null,
          messageCount: number,
          updatedAt: string,
          relevanceScore: number,
        }
      ],
      hint: 'Use get_conversation_messages(conversationId) to load messages from a specific conversation.',
    };
  },
}),
```

### 6.2 `search_artifacts`

```typescript
search_artifacts: tool({
  description:
    'Search tool results and artifacts from your conversations with this user. ' +
    'Returns artifact metadata ranked by relevance. ' +
    'Use when you need to find specific data from past tool executions.',
  inputSchema: z.object({
    query: z.string().describe(
      'Search keywords describing the data you need.'
    ),
    toolName: z.string().optional().describe(
      'Optional: filter to artifacts from a specific tool.'
    ),
    conversationId: z.string().optional().describe(
      'Optional: limit search to a specific conversation.'
    ),
    limit: z.number().min(1).max(20).default(5).optional(),
  }),
  execute: async ({ query, toolName, conversationId, limit = 5 }) => {
    return {
      results: [
        {
          artifactId: string,
          toolCallId: string,
          conversationId: string,
          name: string | null,
          toolName: string | null,
          description: string | null,
          estimatedTokens: number | null,
          isOversized: boolean,
          createdAt: string,
          relevanceScore: number,
        }
      ],
      hint: 'Use get_reference_artifact(artifactId, toolCallId) to load full artifact data.',
    };
  },
}),
```

### 6.3 `get_conversation_messages`

```typescript
get_conversation_messages: tool({
  description:
    'Load messages from a specific conversation. Use after search_conversation_history ' +
    'to read the actual messages from a relevant past conversation.',
  inputSchema: z.object({
    conversationId: z.string().describe('The conversation ID to load messages from.'),
    limit: z.number().min(1).max(50).default(20).optional().describe(
      'Number of most recent messages to load. Default: 20.'
    ),
    beforeTimestamp: z.string().optional().describe(
      'Load messages before this ISO timestamp (for pagination).'
    ),
  }),
  execute: async ({ conversationId, limit = 20, beforeTimestamp }) => {
    // 1. Verify conversation belongs to same tenant/project/agent/user
    // 2. Fetch messages with visibility in ['user-facing'] + messageType in ['chat', 'tool-result']
    // 3. Return formatted messages
    return {
      conversationId,
      messages: [
        {
          id: string,
          role: 'user' | 'assistant',
          content: string,
          messageType: 'chat' | 'tool-result',
          fromSubAgentId: string | null,
          toolName: string | null,
          createdAt: string,
        }
      ],
      hasMore: boolean,
    };
  },
}),
```

---

## 7. Prompt Changes

### 7.1 No prompt template changes in Phase 1

- **Current-conversation artifacts:** Keep existing `<available_artifacts>` rendering unchanged.
- **Cross-conversation artifacts:** Discovered via `search_artifacts` tool — not in prompt.
- **Conversation history:** Keep existing history + compression for current conversation. `search_conversation_history` tool handles prior conversations.
- **Tool descriptions:** Automatically included by AI SDK from tool definitions. No XML changes needed.

---

## 8. Files to Modify

### New files:
| File | Purpose |
|------|---------|
| `packages/agents-core/src/data-access/runtime/conversationSearchIndex.ts` | CRUD for conversation_search_index table |
| `packages/agents-core/src/data-access/runtime/artifactSearchIndex.ts` | CRUD for artifact_search_index table |
| `packages/agents-core/src/data-access/runtime/conversationSearch.ts` | Search DAL (keyword + recency RRF) |
| `packages/agents-core/src/data-access/runtime/artifactSearch.ts` | Artifact search DAL |

### Modified files:
| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `conversationSearchIndex`, `artifactSearchIndex` tables; add `conversationId`/`agentId` columns to `ledgerArtifacts` |
| `agents-api/src/domains/run/agents/tools/default-tools.ts` | Add `search_conversation_history`, `search_artifacts`, `get_conversation_messages` tools |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Pass `conversationId`/`agentId` on insert; insert into `artifactSearchIndex` on artifact creation |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | UPSERT conversation search index after turn completes |
| `agents-api/src/domains/run/compression/ConversationCompressor.ts` | UPSERT conversation search index with compression summary after compression |
| `agents-api/src/domains/run/compression/MidGenerationCompressor.ts` | UPSERT conversation search index with compression summary after compression |

### Migration files:
| Migration | Content |
|-----------|---------|
| `0028_conversation_search_index.sql` | Create `conversation_search_index` table with GIN + scope indexes |
| `0029_artifact_search_index.sql` | Create `artifact_search_index` table with GIN + scope + tool indexes |
| `0030_ledger_artifacts_scope.sql` | Add `conversation_id`, `agent_id` columns to `ledger_artifacts` |

### Removed from previous spec (no longer needed):
- ~~`packages/agents-core/src/db/runtime/pgvector.ts`~~ — no vector types
- ~~`packages/agents-core/src/services/embedding-service.ts`~~ — no embedding service
- ~~`agents-api/src/domains/run/services/embedding/`~~ — no embedding provider
- ~~`0028_enable_pgvector.sql`~~ — no pgvector extension
- ~~Env vars: `EMBEDDING_MODEL`, `EMBEDDING_API_KEY`, `EMBEDDING_DIMENSIONS`~~ — not needed

---

## 9. Phasing

### Phase 1 (this spec): Full-text search tools
- Create search index tables with tsvector + GIN indexes
- Synchronous index updates on write (no async pipeline)
- Add 3 new LLM tools: `search_conversation_history`, `search_artifacts`, `get_conversation_messages`
- Denormalize scope fields on `ledgerArtifacts`
- Keyword + recency search via RRF
- Zero new infrastructure dependencies

### Phase 2 (future): pgvector semantic search upgrade
- Enable pgvector extension
- Add `embedding vector(1536)` column to both search index tables
- Add HNSW indexes on embedding columns
- Build async embedding pipeline (queue job after write)
- Upgrade search DAL to include vector similarity in RRF scoring
- Add embedding service with configurable model (default text-embedding-3-small)
- **Fully backward compatible:** keyword search continues to work; vector search augments it

### Phase 3 (future): Prompt optimization
- Replace artifact dump with compact manifest for current-conversation artifacts
- Reduce injected conversation history to recent N messages only
- Auto-inject top-K relevant context from prior conversations

### Phase 4 (future): Advanced retrieval
- Fact-level extraction from compression summaries
- Cross-agent search (opt-in)
- Graph-based memory (entity relationships)

---

## 10. Acceptance Criteria

1. **Search index tables exist and are populated:**
   - `conversation_search_index` created with GIN + scope indexes
   - `artifact_search_index` created with GIN + scope + tool indexes
   - tsvector columns auto-generated from `search_text`

2. **Conversation search index stays current:**
   - After every user+AI turn, the conversation's search index is UPSERTed
   - Short conversations: `searchText` = title + concatenated user messages
   - Long conversations (>~2000 tokens): `searchText` = LLM summary via agent's summarizer
   - Index scoped by tenantId + projectId + agentId + userId

3. **Artifact search index is populated:**
   - Every new artifact gets a row in `artifact_search_index` at creation time
   - `searchText` includes name, description, summary, tool name
   - Scoped with conversationId + agentId + userId (denormalized)

4. **Search tools work end-to-end:**
   - `search_conversation_history(query)` returns relevant prior conversations ranked by keyword+recency
   - `search_artifacts(query)` returns relevant artifacts ranked by keyword+recency
   - `get_conversation_messages(conversationId)` returns paginated messages (user-facing + tool results)
   - All tools enforce tenant + project + agent + user scoping
   - Tools are available to all agents by default

5. **No regression:**
   - Existing `get_reference_artifact` unchanged
   - Existing conversation history + compression unchanged
   - Existing artifact creation/retrieval unchanged
   - Minimal latency impact (search index UPSERT is a single fast SQL statement)

---

## 11. Open Questions

| # | Question | Priority | Status |
|---|----------|----------|--------|
| OQ1 | ~~What model for conversation summarization?~~ | P0 | RESOLVED → D9: agent's summarization model |
| OQ2 | ~~What visibility for get_conversation_messages?~~ | P0 | RESOLVED → D10: user-facing + tool results |
| OQ3 | Backfill strategy for existing conversations and artifacts? | P2 | Deferred to after Phase 1 ships |
| OQ4 | Rate limiting on search tools to prevent LLM over-searching? | P2 | Monitor first |
| OQ5 | When to trigger pgvector Phase 2? | P2 | When keyword search quality proves insufficient |
| OQ6 | Should compression summary facts (`decisions`, `key_findings`, `discoveries`) be separately queryable as individual rows, or is enriching the conversation's `searchText` sufficient? Currently additive (compression enriches the single search index row). A future `conversation_summary_facts` table could enable granular queries like "find all decisions about auth" across conversations. | P2 | DIRECTED: additive for now (compression enriches searchText). Keep as future consideration — revisit if keyword search over flattened summaries proves too coarse. |

---

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Keyword search misses semantically relevant results ("cost" vs "pricing") | Acceptable for Phase 1; pgvector Phase 2 upgrade path is designed in |
| LLM doesn't use search tools effectively | Good tool descriptions; monitor tool usage patterns |
| Search index UPSERT adds latency to turn completion | Single SQL statement; measure; move to async if >50ms |
| Cross-tenant data leakage via search | Mandatory tenantId + projectId filtering in all queries; test with multi-tenant scenarios |
| Long conversations produce large searchText | LLM summarization kicks in at >~2000 tokens; summary is compact |
