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
| D3 | Search implemented as a built-in MCP module (`mcp/builtin/search/`), scoped per execution context, auto-loaded for all agents via `loadBuiltInMcps()` in tool-loading pipeline | LOCKED | Product/Technical |
| D4 | Postgres full-text search (tsvector) — no embeddings in Phase 1 | LOCKED | Technical |
| D5 | Two search indexes: conversation-level + artifact-level | LOCKED | Technical |
| D6 | Scope: strict `tenantId + projectId + agentId + userId` equality. NULL userId conversations are NOT searchable (they must have a userId to appear in results). | LOCKED | Product |
| D7 | tsvector keyword search + recency weighting (RRF) | LOCKED | Technical |
| D8 | Synchronous UPSERT with concatenated text. No LLM calls in the API server — summaries are passed in by callers (agent execution, compression pipeline, or API clients). | LOCKED | Technical |
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
| User+AI turn completes | Conversation search index (UPSERT) | Synchronous with concatenated text (no LLM) |
| ConversationCompressor fires | Conversation search index (UPSERT with richer summary) | Synchronous — LLM already ran as part of compression |
| Caller provides summary via API | Conversation search index (UPSERT) | Synchronous — caller did the LLM work |
| Artifact created | Artifact search index (INSERT) | Synchronous during artifact save |
| Conversation title updated | Conversation search index (UPDATE) | Synchronous on title change |

**Note:** MidGenerationCompressor does NOT update the search index. It is a tactical, sub-agent-scoped context eviction — not a holistic conversation summary. Its output would downgrade the search index if it overwrote a richer per-turn or ConversationCompressor summary.

### 4.2 Conversation index update flow

**No LLM calls in the API server (D8).** The search index stores whatever text it's given. Three sources provide searchText:

**Source 1: Concatenated (automatic, every turn)**

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
                                    (Single SQL statement — fast, no LLM call, pure DB)
```

**Source 2: Compression summary (automatic, when ConversationCompressor fires)**

When `ConversationCompressor` fires (between turns), it already runs an LLM to produce a `ConversationSummarySchema`. The search index captures this output — no additional LLM call needed.

MidGenerationCompressor does NOT trigger a search index update — it is a tactical mid-generation context eviction scoped to a single sub-agent, not a holistic conversation summary.

```
Compression fires → Structured summary already produced (LLM ran as part of compression)
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
                       (overwrites previous concatenated version)
```

**Source 3: Caller-provided (via API)**

API clients, SDK users, or the agent execution pipeline can pass a custom summary when updating the search index. This enables callers with LLM access to provide richer summaries without the API server running inference.

```
PUT /conversations/{conversationId}/search-index  (or inline in existing endpoints)
  Body: { searchText: "custom summary", summarySource: "provided" }
```

**Priority order for searchText source (higher overwrites lower):**
1. `compression_summary` — richest, structured, produced by compression pipeline (LLM already ran)
2. `provided` — caller-supplied summary (e.g., agent execution passes a summary)
3. `concatenated` — title + raw user messages (default, automatic, no LLM)

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

## 6. Built-in MCP Modules

Search tools are implemented as a **built-in MCP module** — a scoped factory that lives in `agents-api` and gets initialized with the execution context. This is a new pattern that extends to future built-in capabilities.

### 6.1 Architecture: Built-in MCP pattern

```
agents-api/src/domains/run/mcp/
  builtin/
    index.ts                -- loadBuiltInMcps(context) → ToolSet
    types.ts                -- BuiltInMcpContext type
    search/
      index.ts              -- createSearchMcp(context) → ToolSet
      conversation.ts       -- search_conversation_history tool definition
      artifacts.ts          -- search_artifacts tool definition
      messages.ts           -- get_conversation_messages tool definition
    // future built-in MCPs:
    // analytics/
    // memory/
```

**What a built-in MCP is:** A scoped module that:
1. Accepts an execution context on init (`tenantId`, `projectId`, `agentId`, `userId`, `conversationId`, `db`)
2. Returns pre-scoped AI SDK `tool()` definitions — all authorization baked in at init time
3. Is consumed identically by the tool loading pipeline (LLM agents) and the external MCP route (external clients)

**How it differs from external MCP tools:** External MCPs are user-configured, connect over network via `mcpManager`, and go through discovery. Built-in MCPs are platform-provided, locally instantiated, and always available.

**How it differs from default tools:** Default tools (in `default-tools.ts`) are tightly coupled to agent internals (session manager, compressor). Built-in MCPs are self-contained modules with clear context boundaries — easier to test, reuse across access layers, and extend.

```
Tool Loading Pipeline (tool-loading.ts)
  ├── getMcpTools()          -- external MCP servers (user-configured)
  ├── getFunctionTools()     -- DB-configured function tools
  ├── getRelationTools()     -- transfer_to / delegate_to
  ├── getDefaultTools()      -- get_reference_artifact, load_skill, compress_context
  └── getBuiltInMcpTools()   -- NEW: built-in MCP modules (search, future...)
```

### 6.2 Context type

```typescript
// agents-api/src/domains/run/mcp/builtin/types.ts

export interface BuiltInMcpContext {
  tenantId: string;
  projectId: string;
  agentId: string;
  userId: string;              // required — built-in MCPs only work for identified users (D6)
  currentConversationId?: string;
  db: AgentsRunDatabaseClient;
}
```

### 6.3 Module loader

```typescript
// agents-api/src/domains/run/mcp/builtin/index.ts

import type { ToolSet } from 'ai';
import type { BuiltInMcpContext } from './types';
import { createSearchMcp } from './search';

export function loadBuiltInMcps(context: BuiltInMcpContext): ToolSet {
  if (!context.userId) {
    // No userId = no searchable history (D6). Return empty tools.
    return {};
  }

  return {
    ...createSearchMcp(context),
    // Future built-in MCPs:
    // ...createAnalyticsMcp(context),
    // ...createMemoryMcp(context),
  };
}
```

### 6.4 Search MCP module

```typescript
// agents-api/src/domains/run/mcp/builtin/search/index.ts

import type { ToolSet } from 'ai';
import type { BuiltInMcpContext } from '../types';
import { createSearchConversationHistoryTool } from './conversation';
import { createSearchArtifactsTool } from './artifacts';
import { createGetConversationMessagesTool } from './messages';

export function createSearchMcp(context: BuiltInMcpContext): ToolSet {
  return {
    search_conversation_history: createSearchConversationHistoryTool(context),
    search_artifacts: createSearchArtifactsTool(context),
    get_conversation_messages: createGetConversationMessagesTool(context),
  };
}
```

```typescript
// agents-api/src/domains/run/mcp/builtin/search/conversation.ts

import { z } from 'zod';
import { tool } from 'ai';
import { searchConversations } from '@inkeep/agents-core';
import type { BuiltInMcpContext } from '../types';

export function createSearchConversationHistoryTool(ctx: BuiltInMcpContext) {
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
// agents-api/src/domains/run/mcp/builtin/search/artifacts.ts

export function createSearchArtifactsTool(ctx: BuiltInMcpContext) {
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
// agents-api/src/domains/run/mcp/builtin/search/messages.ts

export function createGetConversationMessagesTool(ctx: BuiltInMcpContext) {
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
        // SEARCH MODE: windowed search (see Section 5.3)
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

import { loadBuiltInMcps } from '../../mcp/builtin';

export async function loadToolsAndPrompts(ctx, sessionId, streamRequestId, runtimeContext) {
  const [mcpToolsResult, functionTools, relationTools, defaultTools] = await Promise.all([
    getMcpTools(ctx, sessionId, streamRequestId),
    getFunctionTools(ctx, sessionId, streamRequestId),
    Promise.resolve(getRelationTools(ctx, runtimeContext, sessionId)),
    getDefaultTools(ctx, streamRequestId),
  ]);

  // NEW: load built-in MCP modules, scoped to this execution
  const builtInMcpTools = loadBuiltInMcps({
    tenantId: ctx.executionContext.tenantId,
    projectId: ctx.executionContext.projectId,
    agentId: ctx.executionContext.agentId,
    userId: ctx.executionContext.metadata?.endUserId,
    currentConversationId: ctx.conversationId,
    db: runDbClient,
  });

  const allTools = {
    ...mcpTools,
    ...functionTools,
    ...relationTools,
    ...defaultTools,
    ...builtInMcpTools,  // NEW
  };

  // ... rest unchanged
}
```

### 6.6 Integration into external MCP route

The same tool factories are used in `mcp.ts` so external MCP clients get search tools:

```typescript
// In agents-api/src/domains/run/routes/mcp.ts, within getServer():

import { createSearchMcp } from '../../mcp/builtin/search';

const searchTools = createSearchMcp({
  tenantId, projectId, agentId,
  userId: executionContext.metadata?.endUserId,
  currentConversationId: conversationId,
  db: runDbClient,
});

// Register each tool on the McpServer
for (const [name, toolDef] of Object.entries(searchTools)) {
  server.tool(name, toolDef.description, toolDef.inputSchema, toolDef.execute);
}
```

### 6.4 Extend `get_reference_artifact` for cross-conversation retrieval (D13)

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
      runtime-schema.ts              # MODIFIED: add conversationSearchIndex, artifactSearchIndex tables; add agentId to ledgerArtifacts
      custom-types.ts                # NEW: shared Drizzle custom types (tsvectorColumn, future vectorColumn)
    data-access/runtime/
      conversations.ts               # EXISTING: list, get, create conversations (unchanged)
      messages.ts                    # EXISTING: message CRUD (unchanged)
      ledgerArtifacts.ts             # MODIFIED: pass agentId on insert; coordinated deletes for search index
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
        mcp/
          builtin/                   # NEW (Phase 3): built-in MCP module pattern
            types.ts                 #   BuiltInMcpContext type
            index.ts                 #   loadBuiltInMcps(context) → ToolSet
            search/
              index.ts               #   createSearchMcp(context) → ToolSet
              conversation.ts        #   search_conversation_history tool
              artifacts.ts           #   search_artifacts tool
              messages.ts            #   get_conversation_messages tool
        agents/
          generation/
            tool-loading.ts          # MODIFIED (Phase 3): add loadBuiltInMcps() as 5th tool category
          tools/
            default-tools.ts         # MODIFIED (Phase 3): extend get_reference_artifact with DB fallback (D13)
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
- Built-in MCP modules (Phase 3) get their own directory under `run/mcp/builtin/` — clearly separate from routes and handlers
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
| `packages/agents-core/src/db/runtime/runtime-schema.ts` | Add `conversationSearchIndex`, `artifactSearchIndex` tables; add `agentId` to `ledgerArtifacts` |
| `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts` | Pass `agentId` on insert; insert into `artifactSearchIndex` on creation; coordinated deletes |
| `agents-api/src/domains/run/routes/conversations.ts` | Add `GET /conversations/search` endpoint |
| `agents-api/src/domains/manage/routes/conversations.ts` | Add `GET /projects/{projectId}/conversations/search` and `GET /projects/{projectId}/conversations/{id}/messages/search` |
| `agents-api/src/domains/run/handlers/executionHandler.ts` | UPSERT conversation search index after turn (sync, concatenated text, no LLM) |
| `agents-api/src/domains/run/compression/ConversationCompressor.ts` | UPSERT conversation search index with compression summary |
| `packages/agents-sdk/src/conversations.ts` | Add `search()` and `searchMessages()` methods |
| `packages/agents-sdk/src/artifacts.ts` | Add `search()` method |

#### Phase 2: MCP exposure

**Modified files:**
| File | Change |
|------|--------|
| `agents-api/src/domains/run/routes/mcp.ts` | Register search tools on external MCP server via `createSearchMcp()` |

**New files (shared with Phase 3):**
| File | Purpose |
|------|---------|
| `agents-api/src/domains/run/mcp/builtin/search/index.ts` | `createSearchMcp(context)` — search module factory (used by both MCP route and agent tool loading) |

#### Phase 3: Built-in MCP tools for agents

**New files:**
| File | Purpose |
|------|---------|
| `agents-api/src/domains/run/mcp/builtin/types.ts` | `BuiltInMcpContext` type |
| `agents-api/src/domains/run/mcp/builtin/index.ts` | `loadBuiltInMcps(context)` — module loader |
| `agents-api/src/domains/run/mcp/builtin/search/conversation.ts` | `search_conversation_history` tool |
| `agents-api/src/domains/run/mcp/builtin/search/artifacts.ts` | `search_artifacts` tool |
| `agents-api/src/domains/run/mcp/builtin/search/messages.ts` | `get_conversation_messages` tool |

**Modified files:**
| File | Change |
|------|--------|
| `agents-api/src/domains/run/agents/generation/tool-loading.ts` | Add `loadBuiltInMcps()` as 5th tool category |
| `agents-api/src/domains/run/agents/tools/default-tools.ts` | Extend `get_reference_artifact` with DB fallback (D13) |

### Migration files:
| Migration | Content |
|-----------|---------|
| `0028_conversation_search_index.sql` | Create `conversation_search_index` table with GIN + scope indexes |
| `0029_artifact_search_index.sql` | Create `artifact_search_index` table with GIN + scope + tool indexes |
| `0030_ledger_artifacts_agent_id.sql` | Add `agent_id` column to `ledger_artifacts` |

---

## 9. Phasing

### Phase 1: Data model + DAL + API endpoints
The foundation. Testable independently, follows existing patterns, gives manage UI + SDK immediate access.

**Step 1.1: Schema + migrations**
- Add `tsvectorColumn` custom type to `custom-types.ts`
- Add `conversationSearchIndex` and `artifactSearchIndex` tables to `runtime-schema.ts`
- Add `agentId` column to `ledgerArtifacts`
- Generate and apply migrations (0028, 0029, 0030)

**Step 1.2: Shared schemas**
- Add `ConversationSearchResultSchema`, `ArtifactSearchResultSchema`, `MessageWindowSchema` to `validation/search-schemas.ts`
- These are used by every access layer (API, MCP, SDK, agent tools)

**Step 1.3: Data access layer**
- `conversationSearchIndex.ts` — UPSERT/delete for conversation_search_index (with application-managed tsvector)
- `artifactSearchIndex.ts` — INSERT/delete for artifact_search_index
- `conversationSearch.ts` — `searchConversations()` with keyword + recency RRF
- `artifactSearch.ts` — `searchArtifacts()` with keyword + recency RRF
- `messageSearch.ts` — `searchMessagesWindowed()` for within-conversation windowed search
- Modify `ledgerArtifacts.ts` — pass `agentId` on insert, insert into `artifactSearchIndex`, coordinated deletes

**Step 1.4: Write pipeline (indexing)**
- Modify `executionHandler.ts` — UPSERT conversation search index after every turn (sync, concatenated text, no LLM)
- Modify `ConversationCompressor.ts` — UPSERT search index with compression summary when compression fires
- Modify `ledgerArtifacts.ts` — insert into artifact search index on artifact creation

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

### Phase 2: MCP exposure
Thin layer on top of Phase 1 DAL. One new file, one modified file.

**Step 2.1: Search MCP tool factory**
- Create `mcp/builtin/search/index.ts` — `createSearchMcp(context)` returns tool definitions backed by the Phase 1 DAL

**Step 2.2: Register on external MCP server**
- Modify `mcp.ts` — call `createSearchMcp()` and register tools alongside `send-query-to-agent`
- Same `runAuth` middleware, same scoping. External MCP clients (Cursor, Claude Code, etc.) get search automatically.

### Phase 3: Built-in MCP tools for agents
Wire search into the agent tool loading pipeline so LLM agents can search their own history during execution.

**Step 3.1: Built-in MCP module pattern**
- Create `mcp/builtin/types.ts` — `BuiltInMcpContext` type
- Create `mcp/builtin/index.ts` — `loadBuiltInMcps(context)` aggregates all built-in modules
- Create `mcp/builtin/search/conversation.ts`, `artifacts.ts`, `messages.ts` — individual tool definitions

**Step 3.2: Integration into tool loading**
- Modify `tool-loading.ts` — add `loadBuiltInMcps()` as 5th tool category
- Built-in MCP tools loaded in parallel alongside MCP, function, relation, and default tools

**Step 3.3: Cross-conversation artifact retrieval**
- Modify `default-tools.ts` — extend `get_reference_artifact` with DB fallback (D13)
- Authorization via conversation ownership check (D6)

#### Auth model: follows existing conversation API patterns exactly

Search endpoints use the **same auth middleware, same scoping, and same access patterns** as the existing conversation list/get endpoints. No new auth mechanism needed.

| Domain | Existing pattern | Search follows same pattern |
|---|---|---|
| **Run API** | `GET /conversations` — API key (project) + JWT (`sub` = endUserId) | `GET /conversations/search` — same API key + JWT |
| **Manage API** | `GET /projects/{projectId}/conversations` — session/bearer + `requireProjectPermission('view')` | `GET /projects/{projectId}/conversations/search` — same permissions |
| **MCP** | `mcp.ts` route — goes through `runAuth` middleware (API key + JWT) | Search tools registered on same server, same auth |
| **Built-in MCP tools** | Tool loading pipeline — execution context carries `tenantId`, `projectId`, `agentId`, `userId` | `loadBuiltInMcps(context)` — same execution context |

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
  Query params: query (required), limit?
  Auth: inheritedRunApiKeyAuth() + JWT sub claim for userId
  Scoping: Automatic — tenantId + projectId from API key, userId from JWT, agentId from context
  Returns: { data: ConversationSearchResult[], pagination }

GET /artifacts/search
  Query params: query (required), toolName?, conversationId?, limit?
  Auth: inheritedRunApiKeyAuth() + JWT
  Returns: { data: ArtifactSearchResult[], pagination }

GET /conversations/{conversationId}/messages/search
  Query params: query (required), contextWindow?, limit?
  Auth: inheritedRunApiKeyAuth() + JWT
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
| **Internal MCP (Phase 1)** | Own agent + own user, across conversations | The agent itself during execution |
| **External MCP (Phase 1)** | Scoped by MCP session context | External agents/clients with MCP access |
| **Run API (Phase 1.5)** | Own user (JWT), across conversations for that agent | End-users via authenticated chat sessions |
| **Manage API (Phase 1.5)** | Any user in project (admin) | Builders/admins via manage UI or API key |
| **SDK (Phase 1.5)** | Depends on auth method (API key = manage scope, JWT = end-user scope) | Developers building on the platform |

#### Files for Phase 1.5

| File | Change |
|------|--------|
| `agents-api/src/domains/run/routes/conversations.ts` | MODIFIED: add `GET /conversations/search` endpoint (same auth pattern as existing list/get) |
| `agents-api/src/domains/run/routes/artifacts.ts` | NEW: end-user runtime artifact endpoints mirroring conversations pattern (`GET /artifacts/search`, `GET /artifacts/{artifactId}`) |
| `agents-api/src/domains/manage/routes/conversations.ts` | MODIFIED: add `GET /projects/{projectId}/conversations/search` and `GET /projects/{projectId}/conversations/{id}/messages/search` |
| `agents-api/src/domains/manage/routes/runtimeArtifacts.ts` | NEW: admin runtime artifact endpoints mirroring conversations pattern (separate from `artifactComponents.ts` which manages type definitions) |
| `packages/agents-sdk/src/conversations.ts` | MODIFIED: add `search()` and `searchMessages()` methods |
| `packages/agents-sdk/src/artifacts.ts` | MODIFIED: add `search()` method |

### Phase 4 (future): Consolidate internal artifact access
Shift internal agent code to use the search/retrieval API as the canonical path for artifact access, replacing the current mix of session cache + direct DAL calls.

- `ArtifactService` session cache becomes a performance layer in front of the API, not a separate access pattern
- `get_reference_artifact` routes through the artifact API instead of direct `getLedgerArtifacts()` calls
- Authorization enforced in one place (the API route) instead of duplicated across access points
- Internal calls use `getInProcessFetch()` for same-instance routing
- Simplifies the execution handler and session manager artifact code

### Phase 5 (future): pgvector semantic search upgrade
- Enable pgvector extension
- Add `embedding vector(1536)` column to both search index tables
- Add HNSW indexes, async embedding pipeline, embedding service
- Upgrade search DAL to include vector similarity in RRF scoring
- **Message-level embeddings** for semantic search within conversations — addresses the keyword-only limitation in `get_conversation_messages` windowed search. Most impactful upgrade: enables matching on meaning ("how much should we charge?" matches "pricing").

### Phase 6 (future): Prompt optimization + granular fact search
- Replace artifact dump with compact manifest for current-conversation artifacts
- Reduce injected conversation history to recent N messages only
- Auto-inject top-K relevant context from prior conversations
- Consider `conversation_summary_facts` table for granular fact search (OQ6)

### Phase 7 (future): Advanced retrieval
- Cross-agent search (opt-in)
- Graph-based memory (entity relationships)

### Phase 8 (future): Artifact storage optimization
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
   - After every user+AI turn, a fast synchronous UPSERT writes concatenated title + user messages
   - Compression events overwrite with richer structured summary (LLM already ran as part of compression)
   - Callers can provide custom summaries via API (no LLM in the API server)
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
| Synchronous index UPSERT adds latency | Single SQL statement; measure; move fully async if >50ms |
| Cross-tenant data leakage via search | Strict userId equality (D6); DB-level WHERE clause in all queries |
| Long conversations have lower search quality with concatenated text only | Compression summary overwrites with richer text when it fires; callers can provide summaries via API |
| Orphaned artifact_search_index rows | Coordinated deletes in `deleteLedgerArtifactsByTask` and `deleteLedgerArtifactsByContext`; conversation cascade deletes handle `conversation_search_index` via FK |
| Nullable `agentId` on existing ledgerArtifacts rows | New rows get agentId; pre-migration artifacts excluded from search (agentId is NULL). Backfill derivable: `contextId` → `conversations.agentId`. Deferred to OQ3. |
| pglite test compatibility with tsvector/GIN | pglite supports `to_tsvector` and `plainto_tsquery` but GIN index behavior may differ. Add integration test against real Postgres for search functionality; unit tests can mock the search DAL. |
