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
| D2 | Re-index conversation embedding every user+AI turn | LOCKED | Technical |
| D3 | Search tools default for all agents | LOCKED | Product |
| D4 | Configurable embedding model, default `text-embedding-3-small` | LOCKED | Technical |
| D5 | Two indexes: conversation-level + artifact-level | LOCKED | Technical |
| D6 | Scope: tenant + project + agent + user, across conversations | LOCKED | Product |
| D7 | pgvector + tsvector hybrid search with RRF scoring | LOCKED | Technical |
| D8 | Async embedding pipeline via existing workflow queue | LOCKED | Technical |
| D9 | Conversation summarization uses agent's configured summarization model | LOCKED | Technical |
| D10 | `get_conversation_messages` returns user-facing + user messages + tool results | LOCKED | Product |

---

## 3. Data Models

### 3.1 New Table: `conversation_embeddings`

One row per conversation. Re-embedded after every user+AI turn to stay current.

```typescript
// packages/agents-core/src/db/runtime/runtime-schema.ts

export const conversationEmbeddings = pgTable(
  'conversation_embeddings',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }),

    // Searchable content
    summaryText: text('summary_text').notNull(),        // Title + user messages (short) or LLM summary (long)
    summarySource: varchar('summary_source', { length: 50 }).notNull(), // 'concatenated' | 'llm_summary'
    messageCount: integer('message_count').notNull().default(0),

    // Vector embedding (1536 dims for text-embedding-3-small)
    embedding: customVector('embedding', 1536),          // pgvector column

    // Full-text search
    searchVector: tsvector('search_vector'),              // Generated from summaryText

    // Conversation metadata for filtering
    title: text('title'),
    lastUserMessage: text('last_user_message'),           // Most recent user message text
    lastAgentMessage: text('last_agent_message'),         // Most recent agent response text (truncated)

    ...timestamps,
  },
  (table) => [
    // Primary key: one embedding per conversation
    primaryKey({ columns: [table.tenantId, table.projectId, table.conversationId] }),

    // FK to conversations
    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'conversation_embeddings_conversation_fk',
    }).onDelete('cascade'),

    // HNSW index for vector similarity search
    index('conversation_embeddings_vector_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),

    // GIN index for full-text search
    index('conversation_embeddings_search_idx').using('gin', table.searchVector),

    // Composite index for scoped queries (tenant + project + agent + user)
    index('conversation_embeddings_scope_idx').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.userId
    ),
  ]
);
```

**Drizzle custom type for pgvector:**

```typescript
// packages/agents-core/src/db/runtime/pgvector.ts

import { customType } from 'drizzle-orm/pg-core';

export const customVector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverParam: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      // pgvector returns '[0.1,0.2,...]' format
      return JSON.parse(value);
    },
  })(name);
```

### 3.2 New Table: `artifact_embeddings`

One row per artifact. Embedded at creation time.

```typescript
export const artifactEmbeddings = pgTable(
  'artifact_embeddings',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    artifactId: varchar('artifact_id', { length: 256 }).notNull(),

    // Scope fields (denormalized from conversations via tasks)
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }),

    // Searchable content
    searchText: text('search_text').notNull(),           // name + description + summary + tool name
    toolName: varchar('tool_name', { length: 256 }),     // Which tool produced this
    artifactType: varchar('artifact_type', { length: 256 }), // e.g. 'source', 'document'
    artifactName: varchar('artifact_name', { length: 256 }),

    // Vector embedding
    embedding: customVector('embedding', 1536),

    // Full-text search
    searchVector: tsvector('search_vector'),

    // Size metadata (for manifest display)
    estimatedTokens: integer('estimated_tokens'),
    isOversized: boolean('is_oversized').default(false),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.artifactId] }),

    // HNSW index for vector similarity
    index('artifact_embeddings_vector_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),

    // GIN index for full-text search
    index('artifact_embeddings_search_idx').using('gin', table.searchVector),

    // Composite index for scoped queries
    index('artifact_embeddings_scope_idx').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.userId
    ),

    // Index for conversation-scoped artifact lookup
    index('artifact_embeddings_conversation_idx').on(
      table.tenantId,
      table.projectId,
      table.conversationId
    ),
  ]
);
```

### 3.3 Schema Migration: Add columns to `ledgerArtifacts`

```sql
-- Migration: Add conversationId and agentId to ledger_artifacts
ALTER TABLE ledger_artifacts
  ADD COLUMN conversation_id varchar(256),
  ADD COLUMN agent_id varchar(256);

-- Backfill index (for scoped queries)
CREATE INDEX ledger_artifacts_conversation_idx
  ON ledger_artifacts (tenant_id, project_id, conversation_id);

CREATE INDEX ledger_artifacts_agent_idx
  ON ledger_artifacts (tenant_id, project_id, agent_id);
```

### 3.4 Migration: Enable pgvector extension

```sql
-- Migration 0028: Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 4. Embedding Pipeline

### 4.1 When embeddings are generated

| Event | What gets embedded | Async? |
|-------|-------------------|--------|
| User+AI turn completes | Conversation summary (re-embed) | Yes, after response sent |
| Artifact created | Artifact search text | Yes, after artifact saved |
| Conversation title updated | Conversation summary (re-embed) | Yes |

### 4.2 Conversation embedding flow

```
User sends message → Agent responds → Response streamed to user
                                         ↓ (async, non-blocking)
                                    [Embedding Job Queued]
                                         ↓
                                    1. Fetch conversation metadata
                                       (title, agentId, userId)
                                    2. Fetch recent user messages
                                    3. Build summaryText:
                                       - If total user message text < 2000 tokens:
                                         summaryText = title + "\n" + concatenated user messages
                                         summarySource = 'concatenated'
                                       - If > 2000 tokens:
                                         summaryText = LLM summary (agent's summarization model)
                                         summarySource = 'llm_summary'
                                    4. Generate embedding via configured model
                                    5. UPSERT into conversation_embeddings
                                       (replace previous embedding for this conversation)
```

### 4.3 Artifact embedding flow

```
Tool executes → Artifact saved to ledger_artifacts
                     ↓ (async, non-blocking)
                [Embedding Job Queued]
                     ↓
                1. Build searchText:
                   name + " | " + description + " | " + summary + " | tool: " + toolName
                2. Generate embedding
                3. INSERT into artifact_embeddings
```

### 4.4 Embedding service

```typescript
// packages/agents-core/src/services/embedding-service.ts

export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
}

// Default: OpenAI text-embedding-3-small
// Configured via EMBEDDING_MODEL and EMBEDDING_API_KEY env vars
// Falls back to OPENAI_API_KEY if EMBEDDING_API_KEY not set
```

**New env vars:**

```
EMBEDDING_MODEL=text-embedding-3-small          # default
EMBEDDING_API_KEY=                               # optional, falls back to OPENAI_API_KEY
EMBEDDING_DIMENSIONS=1536                        # default for text-embedding-3-small
```

---

## 5. Search Implementation

### 5.1 Hybrid search query (conversation history)

```sql
-- Search conversation history: vector + keyword + recency via RRF
WITH params AS (
  SELECT
    $1::vector AS query_embedding,
    to_tsquery('english', $2) AS text_query
),
vector_results AS (
  SELECT conversation_id,
    ROW_NUMBER() OVER (ORDER BY embedding <=> (SELECT query_embedding FROM params)) AS rank
  FROM conversation_embeddings
  WHERE tenant_id = $3
    AND project_id = $4
    AND agent_id = $5
    AND (user_id = $6 OR user_id IS NULL)
  ORDER BY embedding <=> (SELECT query_embedding FROM params)
  LIMIT 50
),
keyword_results AS (
  SELECT conversation_id,
    ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, (SELECT text_query FROM params)) DESC) AS rank
  FROM conversation_embeddings
  WHERE tenant_id = $3
    AND project_id = $4
    AND agent_id = $5
    AND (user_id = $6 OR user_id IS NULL)
    AND search_vector @@ (SELECT text_query FROM params)
  LIMIT 50
),
recency_results AS (
  SELECT conversation_id,
    ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS rank
  FROM conversation_embeddings
  WHERE tenant_id = $3
    AND project_id = $4
    AND agent_id = $5
    AND (user_id = $6 OR user_id IS NULL)
  LIMIT 50
)
SELECT
  COALESCE(v.conversation_id, k.conversation_id, r.conversation_id) AS conversation_id,
  (COALESCE(1.0/(60 + v.rank), 0) +
   COALESCE(1.0/(60 + k.rank), 0) +
   COALESCE(0.5/(60 + r.rank), 0)) AS rrf_score
FROM vector_results v
FULL JOIN keyword_results k USING (conversation_id)
FULL JOIN recency_results r USING (conversation_id)
ORDER BY rrf_score DESC
LIMIT $7;  -- top K results
```

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
    queryEmbedding: number[];
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

export const searchArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    userId?: string;
    conversationId?: string;  // optional: scope to current conversation
    query: string;
    queryEmbedding: number[];
    toolName?: string;        // optional filter
    artifactType?: string;    // optional filter
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

---

## 6. LLM Tools

### 6.1 `search_conversation_history`

```typescript
// agents-api/src/domains/run/agents/tools/default-tools.ts

search_conversation_history: tool({
  description:
    'Search your past conversations with this user to find relevant context. ' +
    'Returns conversation summaries ranked by relevance. ' +
    'Use when the user references something from a prior conversation, ' +
    'or when you need background context not in the current conversation.',
  inputSchema: z.object({
    query: z.string().describe(
      'Natural language search query. Be specific about what you are looking for.'
    ),
    limit: z.number().min(1).max(20).default(5).optional().describe(
      'Maximum number of conversations to return. Default: 5.'
    ),
  }),
  execute: async ({ query, limit = 5 }) => {
    // 1. Generate embedding for query
    // 2. Call searchConversations DAL
    // 3. Return results with conversation summaries
    // Return format:
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
    'Search tool results and artifacts from your conversations with this user. ' +
    'Returns artifact metadata ranked by relevance. ' +
    'Use when you need to find specific data from past tool executions.',
  inputSchema: z.object({
    query: z.string().describe(
      'Natural language search query describing the data you need.'
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
    // 1. Generate embedding for query
    // 2. Call searchArtifacts DAL
    // 3. Return results
    return {
      results: [
        {
          artifactId: string,
          toolCallId: string,     // needed for get_reference_artifact
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
          toolName: string | null,     // for tool-result messages
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

### 7.1 Artifact manifest (replaces full artifact dump)

**Current behavior:** `<available_artifacts>` renders EVERY artifact with full XML including `summary_data`, `type_schema`, etc.

**New behavior for current-conversation artifacts:** Keep the existing `<available_artifacts>` rendering for artifacts from the CURRENT conversation — these are already in the prompt and the LLM needs to reference them with `artifact:ref` and `artifact:create` patterns.

**New behavior for cross-conversation artifacts:** Do NOT dump artifacts from other conversations into the prompt. The `search_artifacts` tool handles discovery.

**Net change:** The existing artifact rendering stays for current-conversation artifacts. The search tools add the ability to find artifacts from prior conversations. No prompt template changes needed in Phase 1.

### 7.2 Conversation history (no change in Phase 1)

Keep the existing conversation history + compression system for the current conversation. The `search_conversation_history` tool adds the ability to search PRIOR conversations.

### 7.3 Tool descriptions in system prompt

The new tools are registered via `getDefaultTools()` in `default-tools.ts`. The AI SDK automatically includes their descriptions in the tool definitions. No XML template changes needed.

---

## 8. Files to Modify

### New files:
| File | Purpose |
|------|---------|
| `packages/agents-core/src/db/runtime/pgvector.ts` | Custom Drizzle type for pgvector columns |
| `packages/agents-core/src/data-access/runtime/conversationSearch.ts` | Search DAL (hybrid vector + keyword + recency) |
| `packages/agents-core/src/data-access/runtime/artifactSearch.ts` | Artifact search DAL |
| `packages/agents-core/src/data-access/runtime/conversationEmbeddings.ts` | CRUD for conversation_embeddings table |
| `packages/agents-core/src/data-access/runtime/artifactEmbeddings.ts` | CRUD for artifact_embeddings table |
| `packages/agents-core/src/services/embedding-service.ts` | Embedding service abstraction |
| `agents-api/src/domains/run/services/embedding/index.ts` | Embedding service factory |
| `agents-api/src/domains/run/services/embedding/openai-provider.ts` | OpenAI embedding provider |

### Modified files:
| File | Change |
|------|--------|
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `conversationEmbeddings`, `artifactEmbeddings` tables; add `conversationId`/`agentId` columns to `ledgerArtifacts` |
| `packages/agents-core/src/env.ts` | Add `EMBEDDING_MODEL`, `EMBEDDING_API_KEY`, `EMBEDDING_DIMENSIONS` |
| `agents-api/src/env.ts` | Add embedding env vars |
| `agents-api/src/domains/run/agents/tools/default-tools.ts` | Add `search_conversation_history`, `search_artifacts`, `get_conversation_messages` tools |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Pass `conversationId`/`agentId` on insert |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | Queue conversation embedding job after turn completes |
| `agents-api/src/domains/run/artifacts/artifact-utils.ts` | Queue artifact embedding job after artifact saved |

### Migration files:
| Migration | Content |
|-----------|---------|
| `0028_enable_pgvector.sql` | `CREATE EXTENSION IF NOT EXISTS vector;` |
| `0029_conversation_embeddings.sql` | Create `conversation_embeddings` table with indexes |
| `0030_artifact_embeddings.sql` | Create `artifact_embeddings` table with indexes |
| `0031_ledger_artifacts_scope.sql` | Add `conversation_id`, `agent_id` to `ledger_artifacts` |

---

## 9. Phasing

### Phase 1 (this spec): Search tools + embedding infrastructure
- Enable pgvector
- Create embedding tables
- Build embedding service + async pipeline
- Add 3 new LLM tools: `search_conversation_history`, `search_artifacts`, `get_conversation_messages`
- Denormalize scope fields on `ledgerArtifacts`
- Conversation embeddings updated every turn
- Artifact embeddings created on artifact save

### Phase 2 (future): Prompt optimization
- Replace artifact dump with compact manifest for current-conversation artifacts
- Reduce injected conversation history to recent N messages only
- Auto-inject top-K relevant context from prior conversations (hybrid auto+tool pattern)

### Phase 3 (future): Advanced retrieval
- Fact-level extraction from compression summaries
- Cross-agent search (opt-in)
- Graph-based memory (entity relationships)

---

## 10. Acceptance Criteria

1. **Embedding infrastructure works:**
   - pgvector extension enabled in runtime DB
   - Conversation embeddings table created and indexed
   - Artifact embeddings table created and indexed
   - Embedding service correctly generates vectors via configured model

2. **Conversation embeddings stay current:**
   - After every user+AI turn, the conversation's embedding is updated async
   - Short conversations use concatenated title + user messages
   - Long conversations (>2000 tokens of user messages) use LLM summary
   - Embeddings are scoped by tenantId + projectId + agentId + userId

3. **Artifact embeddings are created:**
   - Every new artifact gets an embedding at creation time (async)
   - Embedding includes name, description, summary, tool name
   - Scoped with conversationId + agentId + userId (denormalized)

4. **Search tools work end-to-end:**
   - `search_conversation_history(query)` returns relevant prior conversations ranked by hybrid score
   - `search_artifacts(query)` returns relevant artifacts ranked by hybrid score
   - `get_conversation_messages(conversationId)` returns paginated messages from a specific conversation
   - All tools enforce tenant + project + agent + user scoping
   - Tools are available to all agents by default

5. **No regression:**
   - Existing `get_reference_artifact` continues to work unchanged
   - Existing conversation history + compression unchanged
   - Existing artifact creation/retrieval unchanged
   - No latency added to the hot path (all embedding is async)

---

## 11. Open Questions

| # | Question | Priority | Status |
|---|----------|----------|--------|
| OQ1 | ~~What model for conversation summarization?~~ | P0 | RESOLVED → D9: agent's summarization model |
| OQ2 | ~~What visibility for get_conversation_messages?~~ | P0 | RESOLVED → D10: user-facing + tool results |
| OQ3 | Backfill strategy for existing conversations and artifacts? | P2 | Deferred to after Phase 1 ships |
| OQ4 | Rate limiting on search tools to prevent LLM over-searching? | P2 | Monitor first |

---

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| pgvector extension not available in all Postgres deployments | Check managed DB support; document requirement |
| Embedding costs at scale | Monitor; text-embedding-3-small is cheap ($0.02/1M tokens); re-evaluate if >$10/day |
| LLM doesn't use search tools effectively | Good tool descriptions + system prompt guidance; monitor tool usage |
| Stale embeddings if async job fails | Retry with backoff; monitor job queue failures |
| Cross-tenant data leakage via search | Mandatory tenantId + projectId filtering in all queries; test with multi-tenant scenarios |
