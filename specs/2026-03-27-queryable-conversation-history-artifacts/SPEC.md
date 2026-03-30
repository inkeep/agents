# SPEC: Queryable Conversation History & Artifact Indexing

## 1. Problem Statement

**Situation:** Inkeep agents have conversations with users that produce messages and tool-result artifacts. These accumulate across multiple conversations per user per agent.

**Complication:** Currently ALL conversation history (or lossy compression summaries) and ALL artifacts are dumped into every LLM call regardless of relevance. This wastes context budget, limits conversation length, blocks oversized artifacts, and agents cannot recall prior conversations.

**Resolution:** Give agents tools to search their own conversation history and artifacts on demand. Replace dump-everything with manifest + on-demand retrieval. Scope: tenant + project + agent + user, across conversations.

---

## 2. Decisions Log

| # | Decision | Status | Type |
|---|----------|--------|------|
| D1 | Use existing `contextId` on `ledgerArtifacts` (already FKs to conversations) — no new columns needed. Add `agentId` column only. | LOCKED | Technical |
| D2 | Update conversation search index every user+AI turn | LOCKED | Technical |
| D3 | Search tools default for all agents | LOCKED | Product |
| D4 | Postgres full-text search (tsvector) — no embeddings in Phase 1 | LOCKED | Technical |
| D5 | Two search indexes: conversation-level + artifact-level | LOCKED | Technical |
| D6 | Scope: strict `tenantId + projectId + agentId + userId` equality. NULL userId conversations are NOT searchable (they must have a userId to appear in results). | LOCKED | Product |
| D7 | tsvector keyword search + recency weighting (RRF) | LOCKED | Technical |
| D8 | Two-tier indexing: synchronous UPSERT with concatenated text (fast path), async LLM summary upgrade for long conversations | LOCKED | Technical |
| D9 | Conversation summarization uses agent's configured summarization model (for long convos) | LOCKED | Technical |
| D10 | `get_conversation_messages` returns user-facing + user messages + tool results | LOCKED | Product |
| D11 | Tables designed with nullable `embedding` column for future pgvector upgrade | LOCKED | Technical |
| D12 | Application-managed tsvector (explicit in UPSERT), not GENERATED ALWAYS AS (Drizzle incompatible) | LOCKED | Technical |
| D13 | `get_reference_artifact` extended with direct DB fallback for cross-conversation artifacts | LOCKED | Technical |
| D14 | `search_conversation_history` excludes the current conversation from results | LOCKED | Technical |
| D15 | Compression summaries enrich search index (additive, not separately queryable) | LOCKED | Technical |

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
      .default('concatenated'),   // 'concatenated' | 'llm_summary' | 'compression_summary'
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

### 3.3 Schema Migration: Add `agentId` to `ledgerArtifacts`

`contextId` already serves as `conversationId` (confirmed: FK to conversations exists at line 496-498 of runtime-schema.ts). No need to add a redundant `conversation_id` column. Only `agent_id` is new.

```sql
ALTER TABLE ledger_artifacts
  ADD COLUMN agent_id varchar(256);

CREATE INDEX ledger_artifacts_agent_idx
  ON ledger_artifacts (tenant_id, project_id, agent_id);
```

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
| User+AI turn completes | Conversation search index (UPSERT) | Synchronous with concatenated text (fast) |
| Long conversation detected (>~2000 tokens) | Conversation search index (UPSERT with LLM summary) | Async after response sent |
| ConversationCompressor fires | Conversation search index (UPSERT with richer summary) | Synchronous after compression completes |
| Artifact created | Artifact search index (INSERT) | Synchronous during artifact save |
| Conversation title updated | Conversation search index (UPDATE) | Synchronous on title change |

**Note:** MidGenerationCompressor does NOT update the search index. It is a tactical, sub-agent-scoped context eviction — not a holistic conversation summary. Its output would downgrade the search index if it overwrote a richer per-turn or ConversationCompressor summary.

### 4.2 Conversation index update flow

**Two-tier approach (D8): fast sync write + async LLM upgrade**

```
User sends message → Agent responds → Response streamed to user
                                         ↓ (synchronous, fast)
                                    1. Fetch conversation metadata (title, agentId, userId)
                                    2. Build searchText = (title || '') + '\n' + last N user messages
                                    3. UPSERT into conversation_search_index:
                                       SET search_text = $searchText,
                                           search_vector = to_tsvector('english', $searchText),
                                           summary_source = 'concatenated',
                                           ...metadata fields
                                    (Single SQL statement — fast, no LLM call)

                                    4. IF total user message text > ~2000 tokens:
                                       Fire-and-forget via getWaitUntil() from @inkeep/agents-core
                                       (uses Vercel waitUntil in production, Promise.resolve() locally)
                                         ↓ (async, non-blocking, after response)
                                       LLM summary generated via agent's summarization model
                                       UPSERT with summary_source = 'llm_summary'
                                       On failure: log error, fast-path concatenated text remains valid
```

**On ConversationCompressor event (richer, structured summary):**

When `ConversationCompressor` fires (between turns, for full conversation history), it produces a `ConversationSummarySchema` with structured fields. This is richer than concatenated user messages. MidGenerationCompressor does NOT trigger a search index update — it is a tactical mid-generation context eviction scoped to a single sub-agent, not a holistic conversation summary.

```
Compression fires → Structured summary produced
                         ↓ (synchronous, within compression flow)
                    1. Build searchText from summary fields:
                       searchText = [
                         title,
                         summary.conversation_overview,
                         summary.user_goals?.primary,
                         ...(summary.key_outcomes?.completed || []),
                         ...(summary.key_outcomes?.discoveries || []),
                         ...(summary.context_for_continuation?.important_context || []),
                       ].filter(Boolean).join('\n')
                    2. UPSERT with summary_source = 'compression_summary'
                       (overwrites previous concatenated/llm_summary version)
```

**Priority order for searchText source:**
1. `compression_summary` — richest, structured, produced by compression pipeline
2. `llm_summary` — generated async when user messages exceed ~2000 tokens
3. `concatenated` — title + raw user messages (default, always written first synchronously)

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
Tool executes → Artifact saved to ledger_artifacts (with contextId = conversationId, agentId)
                     ↓ (same transaction or immediately after)
                INSERT into artifact_search_index:
                  searchText = [name, description, summary, 'tool: ' + toolName]
                    .filter(Boolean).join(' | ')
                  searchVector = to_tsvector('english', searchText)
                  conversationId = artifact.contextId  // contextId IS conversationId
                  toolCallId = artifact.toolCallId
```

---

## 5. Search Implementation

### 5.1 Search query: keyword + recency via RRF

```sql
-- Search conversations: full-text keyword match + recency ranking via RRF
-- D6: strict userId equality — NULL userId conversations are NOT searchable
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
    AND user_id = $5              -- strict equality, no OR NULL (D6)
    AND conversation_id != $6     -- exclude current conversation (D14)
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
    AND user_id = $5              -- strict equality
    AND conversation_id != $6     -- exclude current conversation
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
    AND agent_id = $4
    AND user_id = $5                                    -- strict equality (D6)
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
    AND agent_id = $4
    AND user_id = $5
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

```typescript
// packages/agents-core/src/data-access/runtime/conversationSearch.ts

export const searchConversations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    userId: string;                // required, not optional (D6)
    currentConversationId: string; // excluded from results (D14)
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
    userId: string;                // required (D6)
    conversationId?: string;       // optional: scope to specific conversation
    query: string;
    toolName?: string;
    artifactType?: string;
    limit?: number;
  }): Promise<Array<{
    artifactId: string;
    toolCallId: string | null;     // included for retrieval workflow
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

### 5.3 Windowed message search within a conversation

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

### 5.4 Future pgvector upgrade path

When semantic search is needed, the DAL adds a third CTE with vector similarity to the RRF query. The DAL signature gains an optional `queryEmbedding?: number[]` parameter. Fully backward compatible.

---

## 6. LLM Tools

All three tools are registered in `getDefaultTools()` in `default-tools.ts`, available to all agents by default.

### 6.1 `search_conversation_history`

```typescript
search_conversation_history: tool({
  description:
    'Search your other past conversations with this user to find relevant context. ' +
    'Returns conversation summaries ranked by relevance. Does NOT search the current conversation. ' +
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
    // 1. Call searchConversations DAL with strict userId + agentId scoping
    //    Passes currentConversationId to exclude from results
    // 2. Return ranked results
    return {
      results: [
        {
          conversationId: string,
          title: string | null,
          summary: string,
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
    'Search tool results and artifacts from all your conversations with this user ' +
    '(including the current conversation). Returns artifact metadata ranked by relevance. ' +
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
    limit: z.number().min(1).max(20).default(5).optional().describe(
      'Maximum number of artifacts to return. Default: 5.'
    ),
  }),
  execute: async ({ query, toolName, conversationId, limit = 5 }) => {
    return {
      results: [
        {
          artifactId: string,
          toolCallId: string | null,  // from artifact_search_index
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

Supports two modes: **recent messages** (no query) and **search within conversation** (with query). When a query is provided, returns contextual message windows around matches — coherent conversation snippets, not isolated messages.

```typescript
get_conversation_messages: tool({
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
    limit: z.number().min(1).max(50).default(20).optional().describe(
      'Max messages to return (across all windows). Default: 20.'
    ),
    contextWindow: z.number().min(1).max(10).default(3).optional().describe(
      'Number of messages before/after each match to include for context. Default: 3.'
    ),
  }),
  execute: async ({ conversationId, query, limit = 20, contextWindow = 3 }) => {
    // Authorization: DB-level WHERE clause enforces scoping (D6)
    const conversation = await db.query.conversations.findFirst({
      where: and(
        projectScopedWhere(conversations, scopes),
        eq(conversations.agentId, currentAgentId),
        eq(conversations.userId, currentUserId),  // CRITICAL: strict userId check
        eq(conversations.id, conversationId),
      ),
    });
    if (!conversation) throw createApiError({ code: 'not_found', message: 'Conversation not found' });

    if (query) {
      // SEARCH MODE: find matching messages, return with context windows
      // See Section 5.5 for the windowed search query
      return {
        conversationId,
        mode: 'search',
        segments: [
          {
            matchedMessageId: string,
            messages: [
              {
                id: string,
                role: 'user' | 'assistant',
                content: string,
                messageType: 'chat' | 'tool-result',
                fromSubAgentId: string | null,
                toolName: string | null,
                createdAt: string,
                isMatch: boolean,  // true for the message(s) that matched the query
              }
            ],
          }
        ],
        totalMatches: number,
      };
    } else {
      // RECENT MODE: return most recent messages
      const messageList = await db
        .select()
        .from(messages)
        .where(and(
          projectScopedWhere(messages, scopes),
          eq(messages.conversationId, conversationId),
          or(
            eq(messages.visibility, 'user-facing'),
            eq(messages.messageType, 'tool-result'),
          ),
        ))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      return {
        conversationId,
        mode: 'recent',
        messages: messageList.reverse().map(msg => ({
          id: msg.id,
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: extractText(msg.content),
          messageType: msg.messageType,
          fromSubAgentId: msg.fromSubAgentId,
          toolName: msg.metadata?.a2a_metadata?.toolName || null,
          createdAt: msg.createdAt,
        })),
        hasMore: messageList.length === limit,
      };
    }
  },
}),
```

**Caveat: keyword search within conversations has the same limitation as conversation-level search — it only matches exact keywords, not semantics.** If the user discussed pricing without using the word "pricing" (e.g., "how much should we charge?"), keyword search won't find it. This is an important motivation for the pgvector Phase 2 upgrade — semantic search over message embeddings would match on meaning, not just keywords. For Phase 1, this is an accepted trade-off: keyword matching covers the majority of retrieval cases, and the compression summary (which uses semantically richer language) helps bridge some gaps at the conversation level.

### 6.4 Extend `get_reference_artifact` for cross-conversation retrieval (D13)

The existing `get_reference_artifact` tool is session-scoped (uses `agentSessionManager.getArtifactService`). For artifacts from prior conversations, it won't find them in the session cache.

**Fix:** Add a direct DB fallback when the session cache misses:

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

### New files:
| File | Purpose |
|------|---------|
| `packages/agents-core/src/db/runtime/custom-types.ts` | Shared Drizzle custom types (`tsvectorColumn`, and future `vectorColumn` for pgvector Phase 2) |
| `packages/agents-core/src/data-access/runtime/conversationSearchIndex.ts` | CRUD for conversation_search_index (UPSERT with tsvector) |
| `packages/agents-core/src/data-access/runtime/artifactSearchIndex.ts` | CRUD for artifact_search_index (INSERT with tsvector) |
| `packages/agents-core/src/data-access/runtime/conversationSearch.ts` | Search DAL (keyword + recency RRF) |
| `packages/agents-core/src/data-access/runtime/artifactSearch.ts` | Artifact search DAL |

### Modified files:
| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `conversationSearchIndex`, `artifactSearchIndex` tables; add `agentId` column to `ledgerArtifacts` |
| `agents-api/src/domains/run/agents/tools/default-tools.ts` | Add `search_conversation_history`, `search_artifacts`, `get_conversation_messages`; extend `get_reference_artifact` with DB fallback (D13) |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Pass `agentId` on insert; insert into `artifactSearchIndex` on creation; add coordinated deletes to `deleteLedgerArtifactsByTask` and `deleteLedgerArtifactsByContext` to also delete from `artifact_search_index` |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | UPSERT conversation search index after turn completes (sync fast path + async LLM summary) |
| `agents-api/src/domains/run/compression/ConversationCompressor.ts` | UPSERT conversation search index with compression summary (MidGenerationCompressor is NOT modified — it doesn't touch the search index) |

### Migration files:
| Migration | Content |
|-----------|---------|
| `0028_conversation_search_index.sql` | Create `conversation_search_index` table with GIN + scope indexes |
| `0029_artifact_search_index.sql` | Create `artifact_search_index` table with GIN + scope + tool indexes |
| `0030_ledger_artifacts_agent_id.sql` | Add `agent_id` column to `ledger_artifacts` |

---

## 9. Phasing

### Phase 1 (this spec): Full-text search tools
- Create search index tables with application-managed tsvector + GIN indexes
- Two-tier indexing: sync concatenated text + async LLM summary for long conversations
- Compression summaries enrich search index (additive)
- Add 3 new LLM tools + extend `get_reference_artifact` for cross-conversation
- Add `agentId` to `ledgerArtifacts` (use existing `contextId` as conversationId)
- Keyword + recency search via RRF
- Zero new infrastructure dependencies

### Phase 2 (future): pgvector semantic search upgrade
- Enable pgvector extension
- Add `embedding vector(1536)` column to both search index tables
- Add HNSW indexes, async embedding pipeline, embedding service
- Upgrade search DAL to include vector similarity in RRF scoring
- **Message-level embeddings** for semantic search within conversations — addresses the keyword-only limitation in `get_conversation_messages` windowed search. This is the most impactful upgrade: enables matching on meaning ("how much should we charge?" matches a search for "pricing").

### Phase 3 (future): Prompt optimization + granular fact search
- Replace artifact dump with compact manifest for current-conversation artifacts
- Reduce injected conversation history to recent N messages only
- Auto-inject top-K relevant context from prior conversations
- Consider `conversation_summary_facts` table for granular fact search (OQ6)

### Phase 4 (future): Advanced retrieval
- Cross-agent search (opt-in)
- Graph-based memory (entity relationships)

---

## 10. Acceptance Criteria

1. **Search index tables exist and are populated:**
   - `conversation_search_index` created with GIN + scope indexes
   - `artifact_search_index` created with GIN + scope + tool indexes
   - tsvector columns populated via application-managed `to_tsvector('english', search_text)` in UPSERT

2. **Conversation search index stays current:**
   - After every user+AI turn, a fast synchronous UPSERT writes concatenated title + user messages
   - Long conversations (>~2000 tokens) trigger async LLM summary upgrade
   - Compression events overwrite with richer structured summary
   - Index scoped by tenantId + projectId + agentId + userId (strict equality)

3. **Artifact search index is populated:**
   - Every new artifact gets a row in `artifact_search_index` at creation time
   - `searchText` includes name, description, summary, tool name
   - `toolCallId` stored for retrieval workflow
   - Scoped with conversationId (from contextId) + agentId + userId

4. **Search tools work end-to-end:**
   - `search_conversation_history(query)` returns relevant PRIOR conversations (excludes current)
   - `search_artifacts(query)` returns relevant artifacts with `toolCallId`
   - `get_conversation_messages(conversationId)` returns paginated messages with DB-level auth
   - `get_reference_artifact` works for both current-session and cross-conversation artifacts
   - All tools enforce strict tenant + project + agent + user scoping (no NULL userId leakage)

5. **No regression:**
   - Existing `get_reference_artifact` session-cache path unchanged (DB fallback is additive)
   - Existing conversation history + compression unchanged
   - Existing artifact creation/retrieval unchanged
   - Synchronous index UPSERT adds minimal latency (<10ms for single SQL statement)
   - LLM summarization is async only — no hot-path latency for long conversations

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
| Synchronous index UPSERT adds latency | Single SQL statement; measure; move fully async if >50ms |
| Cross-tenant data leakage via search | Strict userId equality (D6); DB-level WHERE clause in all queries |
| Long conversations: async LLM summary fails | Fast-path concatenated text always available; LLM summary is upgrade |
| Orphaned artifact_search_index rows | Coordinated deletes in `deleteLedgerArtifactsByTask` and `deleteLedgerArtifactsByContext`; conversation cascade deletes handle `conversation_search_index` via FK |
| Nullable `agentId` on existing ledgerArtifacts rows | New rows get agentId; pre-migration artifacts excluded from search (agentId is NULL). Backfill derivable: `contextId` → `conversations.agentId`. Deferred to OQ3. |
| pglite test compatibility with tsvector/GIN | pglite supports `to_tsvector` and `plainto_tsquery` but GIN index behavior may differ. Add integration test against real Postgres for search functionality; unit tests can mock the search DAL. |
