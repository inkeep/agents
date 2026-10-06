# Durable Agent Runtime — PROPOSAL

**Status:** Draft (v17 — all open questions resolved, Q10 closed as non-regression)
**Owner(s):** TBD
**Last updated:** 2026-02-13
**Links:**
- Research report: [~/.claude/reports/durable-agent-runtime-wdk/REPORT.md](../../.claude/reports/durable-agent-runtime-wdk/REPORT.md)
- 15+ evidence files in research report `evidence/` directory
- Key evidence: [step-overhead-verified.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/step-overhead-verified.md), [widget-transport-compatibility.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/widget-transport-compatibility.md), [widget-repo-deep-dive.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/widget-repo-deep-dive.md), [side-effects-comprehensive-audit.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/side-effects-comprehensive-audit.md)

---

## 1) Problem statement

- **Who is affected:** Platform teams building agents that orchestrate complex, long-running tasks — Claude Code instances (10-15 min), parallelized team agents, multi-agent chains with external tool calls.
- **What pain / job-to-be-done:** The agent runtime executes all operations synchronously within a single HTTP request lifecycle. Any long-running operation — tool calls exceeding 60s, sub-agent delegations, human-in-the-loop approvals — blocks the entire 5-layer call chain and risks connection timeouts (SSE max 10 min), lost state on server restarts, and resource exhaustion. Complex long-running scenarios are **not feasible today**.
- **Why now:** The system is constrained by timeout limits specifically because it protects against long-running synchronous processes. Removing these limits without durability would exhaust server resources. WDK infrastructure is already deployed (evals, triggers) — extending to agent runtime is an architectural evolution, not greenfield adoption.
- **Current workaround(s):** Tight timeout limits (MCP: 60s, function: 30s, SSE: 10 min) that prevent long-running use cases entirely. No workaround exists for tool approvals lost during deploys or for reconnecting to in-progress executions.

## 2) Goals

- **G1:** Agent execution survives server restarts — no lost work mid-tool-call or mid-delegation
- **G2:** Long-running operations (10+ min tool calls, external agents, parallelized team agents) execute without blocking HTTP connections or exhausting server resources
- **G3:** Tool approvals (human-in-the-loop) survive process restarts
- **G4:** Clients can reconnect to in-progress executions after network drops
- **G5:** Timeout limits can be relaxed or removed for durable executions (they become durability guarantees instead of resource protection)

## 3) Non-goals

- **NG1:** Rewriting the core Agent class or AI SDK integration — DurableAgent replaces `streamText()` but preserves the same callback contracts (`prepareStep`, `stopWhen`, tool wrapping)
- **NG2:** Multi-instance horizontal scaling (process-local state externalization beyond what's needed for durability)
- **NG3:** Frontend/UI redesign for streaming UX
- **NG4:** Changing the eval or trigger workflow patterns (they already work)

## 4) Personas / consumers

- **P1: Agent builder (internal/customer)** — configures agents with long-running tools, delegation chains, or approval flows. Needs executions to complete reliably regardless of duration.
- **P2: SDK/API consumer** — calls `/completions` endpoint from applications. Needs streaming responses and the ability to recover from network interruptions.
- **P3: Platform operator** — deploys and monitors the agents-api service. Needs to deploy without killing in-progress agent executions.

## 5) User journeys

### P1: Agent builder — long-running tool execution
**Happy path:**
1. Agent builder configures an agent with a Claude Code tool (expected runtime: 10-15 min)
2. User sends a message that triggers the tool
3. Agent calls Claude Code → execution runs durably in background
4. If server restarts mid-execution, the workflow resumes from last completed step
5. User receives streamed results when tool completes
6. Agent continues its reasoning with the tool result

**Failure / recovery:**
- Server crashes during tool execution → workflow re-enqueues via orphan recovery → resumes
- Network drops during streaming → client reconnects with `startIndex` → picks up where it left off
- Tool fails after 10 minutes → error is recorded durably → agent can retry or surface error

**Debug experience:**
- Workflow run ID correlates all steps (LLM calls, tool executions, transfers)
- Each step has status, duration, input/output in the workflow event log

### P2: SDK consumer — reconnectable streaming
**Happy path:**
1. Client POSTs to `/executions` (durable) or `/completions` (sync)
2. Receives `x-workflow-run-id` header + begins streaming response
3. WiFi drops → reconnects with `GET /executions/{runId}/stream?startIndex=N`
4. Streaming resumes from exact position — no duplicate or lost data

### P3: Operator — zero-downtime deploys
**Happy path:**
1. Operator triggers deployment
2. In-progress durable workflows are not affected (steps complete or re-enqueue)
3. New instance starts → orphan recovery picks up any interrupted workflows
4. No user-visible impact

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Durable execution of agent turns (survive restarts) | A server restart during an agent turn does not lose the execution; it resumes from last step | Core value prop |
| Must | Durable tool execution (long-running) | A tool call lasting 10+ minutes completes successfully | Unblocks Claude Code, external agents |
| Must | Durable agent-to-agent delegation | A→B→C delegation chain completes even if any hop takes minutes | Recursive blocking eliminated |
| Must | Streaming to client during durable execution | Client receives real-time text deltas and tool events | UX parity with current sync path |
| Should | Client reconnection after network drop | Client reconnects with `runId` + `startIndex`, resumes stream | G4 |
| Should | Durable tool approval (HITL) | Approval request survives server restart; user can approve hours later | G3 |
| Should | Relaxed/configurable timeout limits for durable path | MCP tool timeout configurable up to hours for durable executions | G5 |
| Could | Parallel tool execution within durable steps | Multiple tool calls execute concurrently as separate steps | Future: parallelized team agents |
| Could | Execution status API | GET `/executions/{runId}/status` returns current state | Observability |

### Non-functional requirements

- **Performance:** Durable path adds ~2s overhead per step (CONFIRMED via official benchmarks on BOTH Postgres and Vercel worlds — this is architectural, not queue-specific). Fast chats (no tools, <5s) should not be penalized — sync path remains for these.
- **Reliability:** Workflow orphan recovery on startup (already implemented for existing workflows). Step-level retry on transient failures.
- **Security/privacy:** No change to auth model. Credentials are resolved per-step (not serialized). WDK event log stores step inputs/outputs — must not contain raw credentials. Reconnection/status endpoints MUST verify tenant ownership via `workflow_executions` table (WDK `getRun()` has no multi-tenant awareness).
- **Data retention (WDK event log):** WDK fundamentally persists step inputs and outputs for deterministic replay. Step inputs are stored via `dehydrateStepArguments({ args, closureVars })` in `suspension-handler.js`; outputs in `workflow_steps.output` AND `workflow_events.eventData.result`. This means conversation content (messages passed to DurableAgent) is stored in the WDK event log as step data — this is inherent to the architecture and cannot be prevented without breaking replay. **Mitigations:** (1) Credentials are resolved inside steps, not passed as step params (no credential leakage). (2) Conversation content in steps is an acceptable trade-off given the data already exists in the runtime DB. (3) A retention cron (Phase 2/3) will purge completed workflow data after a configurable TTL. WDK has no built-in TTL, purge API, or deletion mechanism — retention must be implemented via SQL DELETEs against `workflow.workflow_runs`, `workflow.workflow_steps`, and `workflow.workflow_events` tables, filtered by `completed_at` timestamp.
- **Replay determinism:** WDK provides a deterministic VM context — seeded `Math.random()`, fixed `Date.now()`, deterministic `crypto.randomUUID()`. Code inside workflows (but outside steps) is automatically deterministic. No user action needed. `setTimeout`/`setInterval`/`fetch` throw errors inside workflows — all I/O must go through steps.
- **Step replay safety:** Completed steps are NOT re-executed on replay (results loaded from event log). However, if a step starts but the process crashes before the result is persisted, the step WILL re-execute. Side-effecting tools (email, billing) should be aware of this at-least-once delivery guarantee.
- **Cancellation:** `run.cancel()` is async and does not interrupt the currently executing step. It prevents new step invocations from being queued. Status transitions to `'cancelled'` asynchronously. The stream may contain partial results up to the cancellation point.
- **Operability:** Workflow runs visible in WDK's event log. Correlation via `runId` → `conversationId` → `requestId`. Existing OpenTelemetry tracing extended to cover workflow steps.
- **Cost:** Postgres World uses pg-boss queue — minor additional DB load. No new infrastructure required.

## 7) Success metrics & instrumentation

- **Metric 1: Long-running execution success rate**
  - Baseline: 0% (not possible today)
  - Target: >95% of 10+ minute executions complete successfully
  - Instrumentation: Track workflow run completion status by duration bucket
- **Metric 2: Restart survival rate**
  - Baseline: 0% (all in-progress executions lost on restart)
  - Target: >99% of durable executions survive restarts
  - Instrumentation: Track orphan recovery events and their outcomes
- **Metric 3: Durable path latency overhead**
  - Baseline: N/A
  - Target: <3s overhead vs sync path for equivalent operations
  - Instrumentation: Compare e2e latency for same operation on sync vs durable path
- What we will log/trace: Workflow runId, step start/end times, step types (LLM/tool/transfer), retry counts, stream chunk counts
- How we'll know adoption/value: Number of executions using durable path, distribution of execution durations

## 8) Current state (how it works today)

**Summary:**
```
POST /completions → chat.ts (SSE)
  └─ ExecutionHandler.execute()
       └─ while (iterations < maxTransfers):
            └─ A2AClient.sendMessage() ──blocks──►
                 └─ Agent.generate()
                      └─ streamText(config) ──blocks──►
                           └─ tool.execute() ──blocks per tool──►
```

5-layer synchronous stack. Every layer `await`s the next. Process-local state (StreamHelper registry, ToolApprovalUiBus, AgentSession) creates single-instance coupling. SSE stream has 10-minute hard limit.

**Existing WDK usage:**
- 3 mature workflows (scheduledTriggerRunner, evaluateConversation, runDatasetItem)
- Postgres World with pg-boss queue (configurable concurrency, default: 10 workers)
- Orphan recovery at startup
- Vite plugin and build pipeline configured
- The trigger workflow already calls `ExecutionHandler.execute()` directly with a no-op StreamHelper — proving the pattern works

**Key constraints:**
- `TaskHandlerConfig` is fully serializable; `AgentConfig` and `FullExecutionContext` are serializable
- MCP connections must be re-established per step (~100-500ms per server)
- Sandbox pools are session-scoped and can be shared across steps within same process
- **`@workflow/ai` IS available** (v4.0.1-beta.52) with `DurableAgent` class — supports `prepareStep`, `stopWhen`, streaming, and client reconnection
- AI SDK v6.0.14 with deep customizations: `prepareStep` (compression), `stopWhen` (transfer detection), `wrapToolWithStreaming` (tool lifecycle)

## 9) Proposed solution (vertical slice)

### Architecture overview

```
                         POST /completions      POST /executions
                              │                       │
                    ┌─────────▼──────────┐  ┌─────────▼─────────────────┐
                    │  Sync Path         │  │  Durable Path              │
                    │  (unchanged)       │  │                            │
                    │  ExecutionHandler   │  │  start(agentExecutionWF)  │
                    │  → Agent.generate  │  │  → Returns run.readable    │
                    │  → SSE stream      │  │  → UIMessageChunk stream   │
                    └────────────────────┘  └─────────┬─────────────────┘
                                                      │
                                           ┌──────────▼──────────────────┐
                                           │  agentExecutionWorkflow     │
                                           │  'use workflow'             │
                                           │                             │
                                           │  Transfer loop:             │
                                           │  ┌────────────────────────┐ │
                                           │  │ runAgentTurn()         │ │
                                           │  │                        │ │
                                           │  │ DurableAgent.stream()  │ │
                                           │  │  → doStreamStep()      │ │
                                           │  │    'use step' per LLM  │ │
                                           │  │  → tool.execute()      │ │
                                           │  │    'use step' per tool │ │
                                           │  │  → UIMessageChunks →   │ │
                                           │  │    getWritable()       │ │
                                           │  └────────────────────────┘ │
                                           │  if transfer → next agent   │
                                           │  else → done                │
                                           └─────────────────────────────┘

                                           Reconnection:
                                           GET /executions/{runId}/stream?startIndex=N
                                             → run.getReadable({startIndex})
                                             → UIMessageChunk continuation
```

### Key design decisions

**D1: Explicit opt-in via agent config** (DECIDED) — Agent builder sets `executionMode: 'durable'` in agent config. No auto-routing heuristics or request-level override. Sync path for agents without the flag; durable path for agents with it. Widget/manage-ui reads the flag to select transport.

**D2: Per-LLM-call durability via DurableAgent** (RESOLVED) — Each `model.doStream()` call is a durable step. Tool executions wrapped in `'use step'` for long-running tools. This granularity is provided by `@workflow/ai`'s `DurableAgent` out of the box.

**D3: New `/run/v1/executions` endpoint** (DECIDED) — Purpose-built for durable execution. Speaks UIMessageChunk natively. Existing `/completions` and `/chat` stay unchanged — zero risk to existing clients.

**D4: Streaming POST + reconnectable GET** (DECIDED) — `POST /run/v1/executions` starts the workflow and returns streaming response with `x-workflow-run-id` header. `GET /run/v1/executions/{id}/stream?startIndex=N` for reconnection. `GET /run/v1/executions/{id}/status` for polling. Matches WorkflowChatTransport's expected contract exactly.

### Core implementation pattern

```typescript
// Payload type — all fields MUST be serializable (dehydrated to WDK event log)
// No functions, no class instances, no DB clients, no service references.
interface ExecutionWorkflowPayload {
  executionId: string;          // Our workflow_executions.id (for status updates)
  initialAgentId: string;
  projectId: string;
  tenantId: string;
  conversationId: string;
  userMessage: string;          // Latest user message text (for continuation prompt on transfers)
  ref: Record<string, string>;  // Branch/version reference (serializable plain object)
  requestContext?: Record<string, unknown>; // Optional context from client (serializable)
  // NOTE: We do NOT pass the full messages array from the client here.
  // Conversation history is loaded from DB inside the workflow via
  // loadConversationHistoryStep (ensures consistency with sync path and
  // avoids trusting client-provided message history).
}

// Outer: Transfer orchestration workflow
// Imports: getWritable from 'workflow', start/getRun from 'workflow/api'
async function agentExecutionWorkflow(params: ExecutionWorkflowPayload) {
  'use workflow';
  const writable = getWritable<UIMessageChunk>(); // from 'workflow'
  let currentAgentId = params.initialAgentId;
  let currentUserMessage = params.userMessage;
  let iterations = 0;

  try {
    while (iterations < MAX_TRANSFERS) {
      const result = await runAgentTurn(currentAgentId, currentUserMessage, params, writable);

      // Persist agent response message AFTER agent turn completes
      // (mirrors sync path: executionHandler.ts:500-519 persists after generate() returns)
      if (result.messages?.length) {
        await persistAgentMessage(
          params.conversationId,
          result.messages,
          params.tenantId,
          params.projectId,
        );
      }

      if (result.type === 'transfer') {
        currentAgentId = result.transfer.targetSubAgentId;
        // MESSAGE ACCUMULATION PATTERN (mirrors executionHandler.ts:425-427):
        // Do NOT pass result.messages to next agent. Instead:
        // 1. Agent A's messages are persisted to DB (above)
        // 2. Agent B loads conversation history FROM DB (in buildConversationHistory)
        // 3. Continuation prompt tells B to treat A's response as its own
        currentUserMessage = currentUserMessage +
          '\n\nPlease continue this conversation seamlessly. The previous response ' +
          'in conversation history was from another internal agent, but you must ' +
          'continue as if YOU made that response. All responses must appear as one ' +
          'unified agent - do not repeat what was already communicated.';
        iterations++;
        continue;
      }
      break;
    }

    // Mark execution as completed (final step — mirrors scheduledTriggerRunner's markCompletedStep)
    await persistExecutionStatusStep(params.executionId, 'completed');
  } catch (error) {
    // Mark execution as failed (final step — mirrors scheduledTriggerRunner's markFailedStep)
    try {
      await persistExecutionStatusStep(params.executionId, 'failed');
    } catch { /* best-effort — concurrency guard has double-read safety net */ }
    throw error; // Re-throw so WDK marks run as failed
  } finally {
    // Close the writable stream after the loop (preventClose: true in runAgentTurn)
    const writer = writable.getWriter();
    try { await writer.close(); } catch { /* stream may already be closed on error path */ }
  }
}

// Execution status persistence — durable step
// Direct precedent: scheduledTriggerRunner's markCompletedStep/markFailedStep
// (scheduledTriggerSteps.ts:373-414)
import { updateWorkflowExecution } from './workflowExecutions'; // Module-scope import
async function persistExecutionStatusStep(executionId: string, status: 'completed' | 'failed') {
  'use step';
  await updateWorkflowExecution({ id: executionId, status });
}

// Inner: Each agent turn uses DurableAgent
async function runAgentTurn(
  agentId: string,
  userMessage: string,
  params: ExecutionWorkflowPayload,
  writable: WritableStream<UIMessageChunk>
) {
  // Load agent config (durable step)
  const config = await loadAgentConfig(agentId, params);

  // Load conversation history from DB (durable step)
  //
  // CRITICAL: This is a 'use step' because ALL I/O must be inside steps
  // for WDK deterministic replay. The workflow VM does not technically block
  // Postgres calls, but any I/O outside steps breaks determinism — on replay,
  // the code would re-execute and may get different results (new messages since
  // last run). Every existing workflow in the codebase strictly keeps I/O inside steps.
  //
  // This mirrors the sync path's buildConversationHistory() →
  // getConversationHistoryWithCompression() flow (executionHandler.ts).
  // We load from DB rather than trusting params.messages because:
  // 1. Multi-turn conversations: prior agent messages are persisted to DB
  // 2. Transfer chains: Agent B's context comes from DB (Agent A persisted above)
  // 3. Consistency: sync and durable paths use identical conversation state
  const conversationHistory = await loadConversationHistoryStep(
    params.conversationId, params.tenantId, params.projectId, agentId,
    config.compressionConfig,
  );

  // Create DurableAgent with our config
  // DurableAgent constructor: model, tools, system are set here.
  // system can be overridden per stream() call if needed.
  const durableAgent = new DurableAgent({
    model: () => createModelProvider(config),
    tools: buildDurableToolSet(config.tools, extractSerializableContext(config)),
    system: config.systemPrompt,
  });

  // Run agent — each LLM call is a 'use step' inside DurableAgent
  //
  // IMPORTANT stream lifecycle notes:
  // - writable: the WritableStream from getWritable() — DurableAgent writes UIMessageChunks to it
  // - preventClose: true for all phases. The workflow manages stream close (not DurableAgent).
  //   For Phase 2 transfer loop this is essential (otherwise DurableAgent closes the stream
  //   after the first agent turn, and subsequent agents can't write to it).
  // - sendStart/sendFinish: default true. For Phase 2, manage manually in the outer loop
  //   so only one start/finish pair wraps the entire multi-agent execution.
  //
  // stream() returns Promise<DurableAgentStreamResult>:
  //   { messages: ModelMessage[], steps: StepResult[], uiMessages?: UIMessage[] }
  // Defensive error handling: write error chunk to stream BEFORE re-throwing.
  // It is unknown whether DurableAgent/WDK write error chunks to the writable
  // stream before closure on error (U1-U3 unknowns — requires empirical validation).
  // By defensively writing the error chunk ourselves, we guarantee the client
  // receives an error indication in the stream regardless of WDK behavior.
  try {
    const result = await durableAgent.stream({
      messages: conversationHistory, // Loaded from DB — NOT params.messages
      writable,
      preventClose: true, // Always true — workflow manages stream close
      // prepareStep: PURE in-memory compression ONLY. No DB access.
      // The conversation history was already loaded and compressed above.
      // prepareStep runs OUTSIDE of 'use step' but INSIDE the workflow VM.
      // Any I/O here breaks deterministic replay.
      prepareStep: handlePrepareStepCompression(config, conversationHistory),
      stopWhen: detectTransferOrStepLimit(config),
      onStepFinish: trackStepMetrics,
      maxSteps: config.maxGenerationSteps,
    });

    // parseAgentResult inspects result.messages to detect transfer_to_agent tool calls
    // (stopWhen has no explicit "why I stopped" flag — must check last message's tool calls)
    return parseAgentResult(result);
  } catch (error) {
    // Write error chunk to stream so client gets error indication
    const writer = writable.getWriter();
    try {
      await writer.write({ type: 'error', errorText: error.message ?? 'Agent execution failed' });
      writer.releaseLock();
    } catch { /* stream may already be closed */ }

    // Hybrid tool error strategy:
    // - Transient errors (network, timeout): let WDK retry via step retry mechanism
    // - Permanent errors (auth, validation): catch and return as tool error result
    // - Side-effecting errors (after external mutation): throw FatalError to prevent retry
    if (error instanceof FatalError) throw error; // No retry for side-effecting failures
    return { type: 'error' as const, error };
  }
}

// Tool with durable execution — static step dispatcher pattern
//
// CONSTRAINT 1: 'use step' is a compile-time AST transform. It CANNOT be used
// inside dynamically created functions (e.g., inside .map()).
//
// CONSTRAINT 2: Step arguments MUST be serializable (dehydrated to WDK event log
// for replay). Function references, DB clients, service instances CANNOT be passed
// as arguments. Module-scope imports are used to reconstruct capabilities inside
// the step — this is the pattern all existing steps in the codebase follow.
//
// CONSTRAINT 3: DurableAgent does NOT wrap tool execution in 'use step' internally.
// It calls tool.execute() directly. The tool's execute function must be callable
// from a step context.

import { resolveToolById } from './toolResolver'; // Module-scope import

async function executeToolStep(
  toolId: string,
  input: unknown,
  tenantId: string,       // ← serializable primitive
  projectId: string,      // ← serializable primitive
  agentId: string,        // ← serializable primitive
  ref: Record<string, string>, // ← serializable plain object
) {
  'use step'; // Statically discoverable by WDK build
  // Reconstruct tool access INSIDE the step from module-scope imports
  // (not from arguments — functions are not serializable)
  const tool = await resolveToolById(toolId, { tenantId, projectId, agentId, ref });
  return await tool.execute(input);
}

// Tools are configured to call the static dispatcher
function buildDurableToolSet(tools: ToolConfig[], context: SerializableContext) {
  return tools.map(tool => ({
    ...tool,
    execute: async (input: unknown) => {
      // Calls the static 'use step' function with serializable args only
      return await executeToolStep(
        tool.id, input,
        context.tenantId, context.projectId, context.agentId, context.ref,
      );
    }
  }));
}

// Conversation history loading — durable step
//
// CRITICAL: This MUST be a 'use step' function, not inline workflow code.
// The WDK deterministic VM does not block Postgres calls at the JS level,
// but ALL I/O outside steps breaks determinism: on replay, the DB query
// would re-execute and may return different results (new messages added
// since original execution). Every existing workflow in the codebase
// strictly keeps I/O inside steps — no exceptions.
//
// This replaces the sync path's buildConversationHistory() →
// getConversationHistoryWithCompression() (executionHandler.ts:244-260).
import { getConversationHistoryWithCompression } from './conversationHistory'; // Module-scope import

async function loadConversationHistoryStep(
  conversationId: string,
  tenantId: string,
  projectId: string,
  agentId: string,
  compressionConfig: Record<string, unknown>, // Serializable compression settings
) {
  'use step';
  // DB access happens INSIDE the step — safe for replay (result cached in event log)
  const history = await getConversationHistoryWithCompression({
    conversationId, tenantId, projectId, agentId,
    compressionConfig,
  });
  return history; // Must be serializable (array of message objects)
}
```

### API routes

```typescript
// POST /executions — start durable execution
// Imports: start from 'workflow/api', agentExecutionWorkflow from '../workflow/functions/agentExecution'
export async function POST(request: Request) {
  const { messages, agentId, projectId, conversationId } = await request.json();

  // 1. Conversation persistence BEFORE workflow start (same as sync path)
  const convId = conversationId ?? generateId();
  await createOrGetConversation(runDbClient)({
    tenantId, projectId, id: convId,
    agentId, activeSubAgentId: defaultSubAgentId, ref,
  });

  // 2. Concurrency guard — reject if a durable workflow is already active
  // on this conversation. Prevents interleaved messages, dual SSE streams,
  // and corrupted conversation state. The Vercel AI SDK has ZERO concurrency
  // enforcement (AbstractChat.sendMessage() overwrites activeResponse without
  // checking), so server-side protection is required. The widget disables
  // input during streaming (status === "submitted"), but API consumers may not.
  // OpenAI Assistants API precedent: returns HTTP 400 for active Runs on a Thread.
  const activeExecution = await getActiveWorkflowExecution(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId: convId,
  });
  if (activeExecution) {
    // Double-read safety net: if our table says 'running' but WDK says completed,
    // lazily update our table and allow the new request. Self-healing for edge cases
    // where the final persistExecutionStatusStep failed (process crash, DB failure).
    // getRun() is synchronous (just creates Run object), run.status is async (DB query).
    if (activeExecution.runId) {
      try {
        const wdkStatus = await getRun(activeExecution.runId).status;
        if (['completed', 'failed', 'cancelled'].includes(wdkStatus)) {
          // WDK says done — lazily reconcile our table and allow new request
          await updateWorkflowExecution(runDbClient)({
            id: activeExecution.id,
            status: wdkStatus,
          });
          // Fall through — no 409
        } else {
          return c.json({
            error: 'An execution is already active on this conversation',
            activeExecutionId: activeExecution.runId,
          }, 409);
        }
      } catch {
        // WDK query failed — trust our table's status, return 409
        return c.json({
          error: 'An execution is already active on this conversation',
          activeExecutionId: activeExecution.runId,
        }, 409);
      }
    } else if (activeExecution.status === 'starting') {
      // Insert-Before-Start record with no runId yet.
      // If older than 60s, treat as stale (start() likely crashed).
      const age = Date.now() - new Date(activeExecution.createdAt).getTime();
      if (age > 60_000) {
        await updateWorkflowExecution(runDbClient)({
          id: activeExecution.id,
          status: 'failed', // Orphan cleanup
        });
        // Fall through — no 409
      } else {
        return c.json({
          error: 'An execution is starting on this conversation',
        }, 409);
      }
    }
  }

  // 3. Persist user message BEFORE workflow start
  await createMessage(runDbClient)({
    id: generateId(), tenantId, projectId, conversationId: convId,
    role: 'user', content: { text: messages[messages.length - 1].content },
    visibility: 'user-facing', messageType: 'chat',
  });

  // 4. Insert-Before-Start: Record execution ownership BEFORE starting the workflow.
  // This closes the race condition where a crash between start() and
  // createWorkflowExecution() leaves an orphan workflow with no ownership record
  // (no tenant isolation on reconnection, no cleanup path).
  // runId is initially null — updated after start() returns.
  const executionId = generateId();
  await createWorkflowExecution(runDbClient)({
    id: executionId,
    tenantId, projectId, runId: null, // Populated after start()
    agentId, conversationId: convId,
    status: 'starting',
  });

  // 5. Start durable workflow
  // NOTE: We pass userMessage (latest user text), NOT the full messages array.
  // The workflow loads conversation history from DB via loadConversationHistoryStep.
  // This ensures: (a) durable path uses same history as sync path,
  // (b) multi-turn conversations load prior messages from DB,
  // (c) transfer chains get correct accumulated context.
  const userMessage = messages[messages.length - 1].content;
  const run = await start(agentExecutionWorkflow, [{
    executionId,  // Our workflow_executions.id — workflow uses this for status updates
    initialAgentId: agentId,
    projectId, tenantId, conversationId: convId,
    userMessage,
    ref,
    requestContext,
  }]);

  // 6. Update execution record with actual runId from WDK
  // NOTE: WDK start() does NOT accept pre-generated runIds. Run IDs are
  // monotonic ULIDs (wrun_ + 80-bit CSPRNG), generated internally.
  await updateWorkflowExecution(runDbClient)({
    id: executionId,
    runId: run.runId,
    status: 'running',
  });

  // 7. Return stream with run ID for reconnection
  // NOTE: createUIMessageStreamResponse is a local utility (not from @workflow/ai)
  return new Response(run.readable, {
    headers: {
      'content-type': 'text/event-stream',
      'x-workflow-run-id': run.runId,
    },
  });
}

// GET /executions/{runId}/stream — reconnect to existing execution
// Imports: getRun from 'workflow/api'
// NOTE: Same auth required (runApiKeyAuth applies to /run/v1/*)
//
// CRITICAL: TENANT ISOLATION
// getRun(runId) is a WDK function with NO multi-tenant awareness. It returns
// ANY run by ID regardless of who's asking. We MUST verify ownership via the
// workflow_executions mapping table before returning the stream.
export async function GET(request: Request) {
  const { runId } = request.params;
  const { tenantId, projectId } = c.get('executionContext');
  const startIndex = Number(new URL(request.url).searchParams.get('startIndex') ?? 0);

  // Verify tenant owns this execution (prevents cross-tenant data leak)
  const execution = await getWorkflowExecution(runDbClient)({
    scopes: { tenantId, projectId },
    runId,
  });
  if (!execution) {
    return c.json({ error: 'Execution not found' }, 404);
  }

  const run = getRun(runId); // synchronous — returns Run object
  const stream = run.getReadable({ startIndex });

  // 204 if execution completed and no more chunks
  if (!stream) return new Response(null, { status: 204 });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

// GET /executions/{runId}/status — check execution state
export async function GET(request: Request) {
  const { runId } = request.params;
  const { tenantId, projectId } = c.get('executionContext');

  // Verify tenant owns this execution
  const execution = await getWorkflowExecution(runDbClient)({
    scopes: { tenantId, projectId },
    runId,
  });
  if (!execution) {
    return c.json({ error: 'Execution not found' }, 404);
  }

  const run = getRun(runId);
  const status = await run.status; // async getter (run.status returns Promise)
  return Response.json({
    runId,
    status, // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    //        NOTE: No 'suspended' state — HITL workflows stay 'running'
    //        while waiting for approval. Use stream events to detect
    //        approval-pending state, not the run status.
    // ... metadata
  });
}
```

### Streaming format bridge (optional, Phase 2)

For clients that need OpenAI `chat.completion.chunk` format from the durable path:

```typescript
// UIMessageChunk → OpenAI SSE adapter
function createOpenAICompatibleStream(
  uiStream: ReadableStream<UIMessageChunk>
): ReadableStream<string> {
  return uiStream.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      switch (chunk.type) {
        case 'text-delta':
          controller.enqueue(formatAsOpenAIChunk({
            choices: [{ delta: { content: chunk.delta }, index: 0 }]
          }));
          break;
        case 'tool-input-start':
          controller.enqueue(formatAsOpenAIChunk({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { name: chunk.toolName } }] } }]
          }));
          break;
        // ... other chunk type mappings
      }
    }
  }));
}
```

### Key integration gaps and resolutions

| Gap | Resolution | Phase |
|---|---|---|
| MCP tool connections not durable | Static `executeToolStep` dispatcher with `'use step'`; re-establish MCP connection per step invocation | Phase 1 |
| Function tools (sandboxed) not durable | Static `executeToolStep` dispatcher with `'use step'`; sandbox pool shared within same process | Phase 1 |
| `'use step'` is compile-time only | Cannot use in dynamic functions. Static dispatcher pattern (`executeToolStep`) solves this. DurableAgent does NOT wrap tools internally — tool execute must be callable from a step. | Phase 1 |
| Conversation persistence on durable path | Route handler creates conversation + user message BEFORE `start()`. Workflow steps persist agent messages via `'use step'` (has DB access). | Phase 1 |
| `createUIMessageStreamResponse()` does not exist | Build locally — simple Response wrapper with `text/event-stream` content-type + `x-workflow-run-id` header | Phase 1 |
| Tenant isolation on reconnection | WDK `getRun(runId)` has NO multi-tenant awareness — returns any run by ID. **SECURITY CRITICAL:** Need `workflow_executions` mapping table (`runId → tenantId, projectId`) to verify ownership before returning stream/status. | Phase 1 |
| Tool streaming UX regression | **Not a regression (D11).** Neither sync nor durable path provides mid-execution tool progress. Sync `wrapToolWithStreaming` emits lifecycle events (start/complete) — not mid-execution progress. DurableAgent's `doStreamStep` emits identical `tool-input-start/delta/available` chunks live. WDK writes from steps are NOT buffered. Only gap: `data-operation` metadata parity (Task 1.13). | Phase 1 (metadata parity) |
| Partial step failure: tool re-execution | If process crashes AFTER tool executes but BEFORE step result is persisted, tool re-executes on replay. Side-effecting tools (email, billing) need idempotency awareness. | Phase 4 consideration |
| Stream format (UIMessageChunk vs OpenAI SSE) | New `/executions` endpoint uses UIMessageChunk natively; adapter for backward compat | Phase 1 (native), Phase 3 (adapter — Task 3.1) |
| `wrapToolWithStreaming` lifecycle events | UIMessageChunk already has `tool-input-start/delta/available`, `tool-output-available` — semantic equivalent | Phase 1 |
| WritableStream lifecycle in transfer loop | DurableAgent closes writable by default (`preventClose: false`). For multi-agent transfers, MUST pass `preventClose: true` and manually close after loop exits. | Phase 2 |
| `prepareStep` I/O purity (WDK determinism) | `prepareStep` runs OUTSIDE of `'use step'` but INSIDE the workflow VM. **Any I/O here breaks deterministic replay** (the WDK VM does NOT block Postgres at the JS level, but replayed I/O may return different results). Solution: load conversation history via `loadConversationHistoryStep` (`'use step'`) BEFORE calling `durableAgent.stream()`, then pass pre-loaded data to `prepareStep` for in-memory-only compression. Every existing workflow in the codebase strictly keeps I/O inside steps. | Phase 1 |
| Conversation history loading from DB | Each POST /executions starts a NEW workflow. Multi-turn conversations need full history from DB (same as sync path's `buildConversationHistory()` → `getConversationHistoryWithCompression()`). **Do NOT trust `params.messages` from the client** — load from DB via `loadConversationHistoryStep` (`'use step'`). This also ensures transfer chains work: Agent A persists messages to DB, Agent B loads them via this step. | Phase 1 |
| Tool approval (HITL) | Replace ToolApprovalUiBus with WDK `defineHook()` + auto-webhook. Note: workflow stays `'running'` during approval wait (no `'suspended'` status in WDK). Detect approval-pending state from stream events, not run status. | Phase 2 |
| A2A callers → durable agents | **Decided (D5/D6).** A2A invokes `taskHandler()` directly — does NOT go through ExecutionHandler. Phase 1: A2A stays synchronous. Phase 2: delegation gets step-poll pattern (D5), agent card extension advertises `executionMode` (D6 Task 2.3). Phase 4+: real async A2A with task persistence (Task 4.7). **A2A server has 6 critical stubs** (`tasks/get` hardcoded "completed", `tasks/cancel` noop, `tasks/resubscribe` mock, no push notifications, `message/send` synchronous, no `extensions` on AgentCard) — all must be replaced before async A2A works. | Phase 1: no change. Phase 2: agent card extension + step-poll delegation. Phase 4+: real async A2A. |
| Triggers/evals → durable agents | Triggers call ExecutionHandler inside their own workflow. Evals call Chat API via `getInProcessFetch()`. Both paths already have workflow-level durability. Per-LLM-call DurableAgent durability is NOT used for these paths in Phase 1. Acceptable because eval/trigger workflows already survive restarts. | Phase 1: no change. Phase 4: reconsider if triggers need per-step durability |
| Concurrent messages to same conversation | Server-side concurrency guard on POST /executions rejects with 409 if a durable workflow is already active on the conversation. Vercel AI SDK has zero concurrency enforcement (AbstractChat.sendMessage() overwrites activeResponse). Widget disables input during streaming but API consumers may not. OpenAI Assistants API precedent: returns 400 for active Runs. Guard applies to durable path only — sync path is out of scope. | Phase 1 |
| `start()` race condition (orphan workflows) | Insert-Before-Start pattern: create `workflow_executions` record with `runId: null, status: 'starting'` BEFORE calling `start()`, then UPDATE with actual `runId` after. WDK `start()` does not accept pre-generated run IDs (monotonic ULIDs, `wrun_` prefix). Orphan records (`status: 'starting'`, `runId: null`) cleaned up by periodic job. | Phase 1 |
| Message write idempotency on step retry | `createMessage()` uses `generateId()` — on step retry, re-executes with new ID → duplicate messages. Phase 1 adds nullable `idempotencyKey` column with unique constraint to messages table. Durable write path passes deterministic key (`{workflowRunId}_{stepName}_{role}`) to prevent duplicates. Sync path unaffected (key is null). | Phase 1 |
| DurableAgent error surface (6 unknowns) | Unknown whether DurableAgent/WDK write error chunks to stream before closure (U1-U6). Defensive error handling in `runAgentTurn()`: write `{ type: 'error', errorText }` to writable stream before re-throwing. Hybrid tool error strategy: transient → WDK retry, permanent → catch and return as tool error result, side-effecting → `FatalError` (no retry). U1-U6 require empirical validation in Phase 1. | Phase 1 |
| Workflow code discipline (step ID stability) | WDK step IDs are positionally derived from source code order. Reordering/removing steps with in-flight workflows breaks replay. Convention: treat workflow functions as append-only, drain in-progress workflows before deploy, use explicit hook tokens for HITL. Agent workflows are minutes-long (not days), so deployment risk is low. | Phase 1 convention |
| `workflow_executions.status` lifecycle | WDK `Run` class has no callback/event mechanism — purely pull-based. Belt-and-suspenders: (1) Primary: `persistExecutionStatusStep('completed'/'failed')` as final workflow step (precedent: `scheduledTriggerRunner.markCompletedStep`). (2) Safety net: concurrency guard double-reads WDK `run.status` when our table says 'running' — lazily reconciles if WDK says done. (3) Orphan `'starting'` records older than 60s treated as stale. Covers 99%+ via primary mechanism; self-heals edge cases via double-read. | Phase 1 |
| CLI pull generator | `agent-generator.ts` explicitly maps agent fields to code. `executionMode` needs explicit handling for `inkeep pull` to include it in generated agent definitions. | Phase 0 |
| Shared types exports | `FullAgentDefinitionSchema` in `agents-core/client-exports.ts` and `agents-core/index.ts` need `ExecutionMode` type exported for SDK consumer type safety. | Phase 0 |
| OpenAPI for new routes | Management routes auto-generate from Zod schemas. But `/run/v1/executions` routes must use `createRoute()` with Zod schemas for inclusion in `/openapi.json`. | Phase 1 |

### Widget changes (cross-cutting surface area)

The @inkeep/agents-ui@0.15.10 widget (used by manage-ui) already uses Vercel AI SDK's `useChat` + `DefaultChatTransport`. This means the durable path is a **small change** — conditional transport switching, ~20 lines.

```typescript
// In use-inkeep-chat.ts (v0.15.x)
const transport = useMemo(() => {
  if (executionMode === 'durable') {
    return new WorkflowChatTransport({
      api: executionsUrl,   // → /run/v1/executions
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      // IMPORTANT: WorkflowChatTransport's default POST body is just { messages }.
      // We need prepareSendMessagesRequest to inject agentId, projectId, conversationId.
      prepareSendMessagesRequest: ({ messages }) => ({
        body: JSON.stringify({
          messages,
          agentId,
          projectId,
          conversationId,
          requestContext: context,
        }),
      }),
    });
  }
  return new DefaultChatTransport({
    api: agentUrl,          // → /run/api/chat
    headers: { Authorization: `Bearer ${apiKey}`, ...headers },
    body: { requestContext: context },
  });
}, [executionMode, agentUrl, executionsUrl, ...]);
```

**WorkflowChatTransport POST body:** By default, `WorkflowChatTransport` sends `{ messages }` as the POST body. Our `/executions` endpoint requires `agentId`, `projectId`, and optional `conversationId`. The `prepareSendMessagesRequest` callback injects these fields. Without it, the server would receive no agent identifier and return 400.

**Why dual transport is required:** `WorkflowChatTransport` throws `Error('Workflow run ID not found in "x-workflow-run-id" response header')` if the endpoint doesn't return `x-workflow-run-id`. It cannot gracefully fall back. The `executionMode` must be determined before the request (from agent config or widget prop), not from the response.

**Widget changes needed:**
| File | Change | Scope |
|---|---|---|
| `use-inkeep-chat.ts` | Conditional transport selection | ~20 lines |
| `types/config/ai.ts` | Add `executionMode?: 'classic' \| 'durable'` | Additive type |
| `package.json` | Add `@workflow/ai` as optional peer dep | Small |

**manage-ui changes needed:**
| File | Change | Scope |
|---|---|---|
| `chat-widget.tsx` | Pass `executionMode: 'durable'` + `executionsUrl` when agent has long-running tools | Small |
| `copilot-chat.tsx` | Same | Small |

**No UI component changes needed.** `useChat`'s return interface (`messages`, `sendMessage`, `status`, `error`) is identical regardless of transport.

Evidence: [widget-repo-deep-dive.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/widget-repo-deep-dive.md), [widget-transport-compatibility.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/widget-transport-compatibility.md)

### Cross-surface impact analysis

Reviewed against the full product surface area inventory (63 surfaces). Surfaces marked ✅ are addressed in this spec. Surfaces marked ⚠️ need attention. Surfaces marked — are unaffected.

**APIs & Data Contracts:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Management API | ✅ `executionMode` field added to agent CRUD | Phase 0 | Auto-propagates via Zod schemas |
| Run API (OpenAI Chat Completions) | — Unchanged | — | Sync path preserved |
| Chat API (Vercel AI SDK Data Stream) | — Unchanged | — | Sync path preserved |
| **NEW: Executions API** | ✅ New `/run/v1/executions` routes | Phase 1 | 1-way door: endpoint naming, response shape |
| A2A Protocol | ✅ Decided (D5/D6) | Phase 2 / Phase 4+ | Phase 1: unchanged. Phase 2: delegation gets step-poll pattern (D5), agent card extension advertises executionMode (D6). Phase 4+: real async A2A with task persistence. |
| Agent Discovery | ✅ Decided (D6) | Phase 2 | Task 2.3: add `extensions` field to AgentCard, include `executionMode` via spec-standard extension URI. |
| OpenAPI Docs | ✅ New routes use `createRoute()` | Phase 1 | Management routes auto-generate. New execution routes need explicit schemas. |
| OpenTelemetry Schema | ✅ New span attributes for workflow steps | Phase 1 | Task 1.8: runId, step type, step timing |
| Shared Types | ✅ `ExecutionMode` type exported | Phase 0 | `client-exports.ts`, `index.ts` |
| Environment Variables | — Existing `WORKFLOW_*` vars apply | — | May add feature flag later |

**SDKs & Libraries:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| TypeScript SDK | ✅ `ExecutionsClient` + `executionMode` in builder | Phase 0 (types) + Phase 3 (client) | |
| Vercel AI SDK Provider | — No changes needed | — | Wraps Chat API, which is unchanged |

**CLI Tools:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Inkeep CLI | ✅ Pull generator + push handles `executionMode` | Phase 0 | `agent-generator.ts` needs explicit field mapping |
| Create-Agents CLI | — No changes for Phase 1 | Phase 3 | Template could show durable example in docs |

**Management UI:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Visual Agent Builder | ✅ Execution mode toggle in agent settings | Phase 0 | Task 0.4 |
| All other manage-ui surfaces | — Unaffected | — | |

**Chat Experiences:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Chat Widget | ✅ Conditional transport switching | Phase 1 | Task 1.6: `WorkflowChatTransport` vs `DefaultChatTransport` |
| Playground ("Try it") | ✅ Passes `executionMode` to widget | Phase 1 | Task 1.7: `chat-widget.tsx` reads agent config |
| Chat-to-Edit (Copilot) | ✅ Same as playground | Phase 1 | Task 1.7: `copilot-chat.tsx` |

**Observability UI:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Traces Dashboard | ⚠️ Workflow step spans need to appear | Phase 1 | Task 1.8: verify OTel spans are visible in existing views |
| Conversation Inspector | — Works via conversation record | — | Conversation created in route handler before workflow |
| AI Calls / Tool Calls View | ⚠️ DurableAgent LLM/tool spans need correct attributes | Phase 1 | Must match existing OTel schema |

**Evaluations:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| All eval surfaces | — Unaffected in Phase 1 | Phase 4 | Evals call Chat API (unchanged). Eval workflow already durable. Consider DurableAgent for eval accuracy in Phase 4. |

**Templates & Docs:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Documentation Site | ✅ New docs page | Phase 3 | Task 3.3 |
| API Reference | ✅ Auto-generated from OpenAPI | Phase 1 | Via `createRoute()` definitions |
| Release Notes | ✅ Changeset needed | Phase 1 | Minor for Phase 0, minor for Phase 1 |
| Cookbook Templates | — Optional durable execution recipe | Phase 3+ | |

**Deployment:**
| Surface | Impact | Phase | Notes |
|---|---|---|---|
| Docker Images | — No new dependencies at image level | — | `@workflow/ai` installed via pnpm |
| Health Endpoints | — Unaffected | — | Existing workflow health checks apply |

### Error handling strategy (durable path)

The DurableAgent and WDK error surface has **6 empirical unknowns** (U1-U6) that must be validated during Phase 1 implementation:

| ID | Unknown | What we need to validate | Impact if wrong |
|---|---|---|---|
| U1 | Does DurableAgent write an error UIMessageChunk to the writable stream when `model.doStream()` throws? | Mock a failing model provider, check if error chunk appears in stream | Client gets no error indication — just stream closure |
| U2 | Does DurableAgent write an error UIMessageChunk when a tool throws? | Mock a failing tool, check stream output | Client sees tool call start but no error/completion |
| U3 | Does the WDK writable stream remain writable after DurableAgent throws? | Catch DurableAgent error, attempt `writer.write()` | Defensive error chunk writing fails silently |
| U4 | What error types does DurableAgent throw vs swallow? | Trigger various failures (network, timeout, auth), observe throw/catch behavior | Error classification strategy may need adjustment |
| U5 | Does WDK step retry behavior interact correctly with DurableAgent's internal step management? | Trigger step failure mid-agent-turn, observe retry behavior | Double LLM calls or corrupted agent state |
| U6 | Does `run.status` reflect DurableAgent errors correctly? | Trigger DurableAgent failure, check `run.status` | Status endpoint returns 'running' for failed executions |

**Defensive strategy (implemented in runAgentTurn pseudocode above):**
1. Wrap `durableAgent.stream()` in try/catch
2. On error, write `{ type: 'error', errorText }` to writable stream before re-throwing
3. If stream is already closed, silently ignore the write failure
4. Classify errors for retry:
   - **Transient** (network timeout, rate limit): let WDK retry via step retry mechanism
   - **Permanent** (auth failure, validation error): catch and return as tool error result to agent
   - **Side-effecting** (failure after external mutation, e.g., email sent but DB write failed): throw `FatalError` to prevent retry — at-least-once could mean at-least-twice for the external effect

**UIMessageChunk error types** (from AI SDK source):
- `{ type: 'error', errorText: string }` — general error
- `{ type: 'tool-result', ... , isError: true }` — tool-specific error returned to agent
- `{ type: 'finish', finishReason: 'error' }` — generation-level error

### Workflow code discipline

WDK step IDs are positionally derived from source code order (not explicitly named). This creates fragility: reordering, inserting, or removing steps in a workflow function while runs are in-flight can break replay (the event log references step positions that no longer match the code).

**Conventions for the durable agent runtime:**

1. **Append-only workflow functions:** New steps are always added at the end. Never reorder or remove steps from an existing workflow function. If a step is no longer needed, make it a no-op rather than removing it.
2. **Drain before deploy:** Before deploying code changes that modify workflow step structure, allow in-progress workflows to complete. Agent workflows are typically minutes-long (not days), so this is a short drain window.
3. **Explicit hook tokens for HITL:** Tool approval hooks use WDK `defineHook()` with explicit token names (not positional). This ensures approval tokens remain valid across code deploys.
4. **Version your workflows:** If a workflow needs fundamental restructuring, create a new workflow function (e.g., `agentExecutionWorkflowV2`) rather than modifying the existing one. Route new executions to V2 while V1 drains.

**Risk level:** LOW for our use case. Agent execution workflows are short-lived (minutes). The primary risk scenario (code deploy during suspended HITL workflow) is addressed by explicit hook tokens. This is NOT the same risk profile as Temporal/Inngest workflows that run for days/weeks.

### Alternatives considered

**A) All-durable (no sync path):** Every request goes through WDK. Rejected — official benchmarks confirm ~2s/step on BOTH Postgres and Vercel worlds. This is architectural (suspend/persist/replay), not tunable. ~2s/step × 2-5 steps = 4-10s overhead on simple conversations. Only viable if WDK fundamentally changes its replay model.

**B) Custom durable wrapper (no @workflow/ai):** Build our own durable agent loop using raw `'use step'` directives. Rejected because `@workflow/ai`'s `DurableAgent` already implements this with `prepareStep`, `stopWhen`, and proper UIMessageChunk streaming. Would be redundant engineering.

**C) Temporal/Inngest instead of WDK:** Use a standalone durable execution framework. Rejected because WDK is already deployed, battle-tested, and tightly integrated with AI SDK. Migration cost vastly exceeds benefit.

**D) Single endpoint with mode flag:** Add `durable: true` to `/completions`. Rejected because the response format fundamentally differs (UIMessageChunk vs OpenAI SSE). Overloading the endpoint creates confusion and brittle conditional logic.

## 10) Decision log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Two-tier routing via explicit agent config flag (`executionMode: 'classic' \| 'durable'`) | X | No (reversible — can migrate all-durable later) | **DECIDED** | ~2s per step overhead CONFIRMED on both Postgres and Vercel worlds (official benchmarks). Architectural, not tunable. Agent builder explicitly opts in via config. No request-level override or auto-routing heuristics in Phase 1. | [step-overhead-verified.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/step-overhead-verified.md), [cross-industry-durable-ai-patterns.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/cross-industry-durable-ai-patterns.md) | `executionMode` field added to agent config schema + manage DB. Widget/manage-ui reads this to select transport. No runtime heuristics to debug. |
| D2 | Per-LLM-call durability via DurableAgent | T | No | **RESOLVED** | DurableAgent wraps each `model.doStream()` in `'use step'`. Tool execution optionally wrapped in `'use step'` for long-running tools. This is the exact granularity needed — finer than per-turn but coarser than per-token. | [durableagent-architecture-deep-dive.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/durableagent-architecture-deep-dive.md), [workflow-ai-durableagent-availability.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/workflow-ai-durableagent-availability.md) | DurableAgent replaces `streamText()` in the agent loop. Tool durability is opt-in per tool (`'use step'` in execute). Agent with 5 tool calls = ~5 durable steps. |
| D3 | New `/run/v1/executions` endpoint (UIMessageChunk native) + keep existing `/completions` and `/chat` unchanged | X | Yes (endpoint name is 1-way) | **DECIDED** | Stream piping incompatible (VercelUIWriter sync `write()` vs DurableAgent async WritableStream `pipeTo()`). WorkflowChatTransport throws on non-durable endpoints. Zero risk to existing clients. | [widget-transport-compatibility.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/widget-transport-compatibility.md), [format-compatibility-deep-dive.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/format-compatibility-deep-dive.md) | New route file in `agents-api/src/domains/run/routes/`. Existing `/completions` and `/chat` untouched. Widget uses conditional transport. |
| D4 | Streaming POST + reconnectable GET pattern: `POST /run/v1/executions` (start + stream), `GET .../stream` (reconnect), `GET .../status` (poll) | X | Yes (public API shape) | **DECIDED** | Matches WorkflowChatTransport's expected contract exactly. POST returns streaming response with `x-workflow-run-id` header. Reconnection via GET sub-resource. Same pattern as existing `/completions` (POST that streams). | [api-naming-analysis.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/api-naming-analysis.md), [cross-industry-durable-ai-patterns.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/cross-industry-durable-ai-patterns.md) | 3 new routes in Phase 1. `cancel` and `approve` sub-routes in Phase 2. SDK `client.executions.*` methods in Phase 3. |
| D5 | Delegation tools on durable path: Phase 1 uses raised timeouts (Task 1.10), Phase 2 uses step-poll child workflow pattern | T | No (reversible) | **DECIDED** | Delegation uses blocking `sendMessage()` with 20s retry. On durable path, delegation is just a tool call inside `executeToolStep()` — gets the raised timeout ceiling from Task 1.10. Phase 2 adds the transfer loop (Task 2.1) where delegation within the workflow is a natural extension via step-poll: a step calls `start(childWorkflow)` then `await run.returnValue` (durable, survives restarts, polls every 1s). Hook-based zero-resource wait (Option B) deferred to Phase 4 optimization if worker slot exhaustion becomes a concern. | Research: delegation uses `a2aClient.sendMessage()` (blocking, NOT streaming). `DELEGATION_TOOL_BACKOFF: 20s`. No per-delegation timeout on receiving agent. WDK steps run to completion atomically — hooks cannot be used inside steps. Step-poll pattern (`getRun().returnValue`) works from `'use step'` context. Cookbook examples (meeting-prep: 10-30s) within raised timeout ceiling. | Phase 1: no delegation-specific changes (Task 1.10 covers timeout). Phase 2 Task 2.1: delegation within transfer loop uses step-poll. Phase 4: consider hook-based rendezvous for zero-resource wait. |
| D7 | Server-side concurrency guard on durable POST /executions: reject 409 if active execution on same conversation. Durable path only. | X | No (new endpoint) | **DECIDED** | Vercel AI SDK AbstractChat has ZERO concurrency enforcement (sendMessage() overwrites activeResponse). Widget disables input during streaming but API consumers may not. Two concurrent POSTs create interleaved messages and dual SSE streams. OpenAI Assistants API precedent: returns 400 for active Runs on a Thread. Guard on durable path only — sync path is separate scope. | Research: AbstractChat.sendMessage() lines 12002-12055, widget use-inkeep-chat.js line 99 (D = status === "submitted"), OpenAI Assistants API docs | Phase 1 Task 1.4: concurrency check before start(). Sync path unchanged. |
| D8 | Insert-Before-Start pattern: create workflow_executions record with nullable runId BEFORE start(), UPDATE after. | T | No | **DECIDED** | WDK start() does NOT accept pre-generated runIds (monotonic ULIDs). Race condition: crash between start() and record creation leaves orphan workflow with no tenant isolation. Insert first with runId=null, update after. Orphan records cleanable by periodic job. | Research: WDK start() internals, run ID generation (wrun_ + ULID) | Phase 1 Task 0.3: nullable runId column. Task 1.4: insert-update flow. |
| D9 | Defensive error handling in runAgentTurn: write error chunk to stream before re-throwing. Hybrid tool error strategy (transient/permanent/side-effecting). | T | No | **DECIDED** | 6 empirical unknowns (U1-U6) about DurableAgent error surface. Defensive approach ensures client always gets error indication regardless of WDK behavior. Strategy may be simplified after U1-U6 validation in Phase 1. | Research: DurableAgent source analysis, UIMessageChunk error types, WDK step retry behavior | Phase 1 Task 1.12: empirical validation. May simplify error handling if DurableAgent handles errors correctly. |
| D10 | `workflow_executions.status` lifecycle: belt-and-suspenders with final workflow step (primary) + concurrency guard double-read (safety net). | T | No | **DECIDED** | WDK `Run` class has no callback/event/`.then()` mechanism — purely pull-based async getters. Option 2 (WDK callback) ruled out. Option 1 (final step): direct precedent in `scheduledTriggerRunner.markCompletedStep()` / `markFailedStep()`. Option 3 (double-read): `getRun()` is synchronous, `run.status` is async getter hitting WDK DB. Combined: primary mechanism handles 99%+, safety net self-heals edge cases (process crash, final step DB failure). No stale window on concurrency guard. | Research: WDK Run class (runtime.js:24-133), scheduledTriggerRunner.ts:249-303, WDK start.js (no callbacks in StartOptions) | Phase 1: `persistExecutionStatusStep` in workflow, double-read in concurrency guard, orphan cleanup for `'starting'` records >60s. |
| D11 | Q10 (tool progress) is NOT a regression. Close as non-issue. Address `data-operation` metadata parity in Phase 1. | T | No | **DECIDED** | Research confirms: (1) Sync path's `wrapToolWithStreaming` (Agent.ts:543-732) emits lifecycle events (tool-input-start/delta/available) BEFORE execution and tool-output-available AFTER — but NOTHING during execution. (2) DurableAgent's `doStreamStep` emits identical UIMessageChunk tool lifecycle events live from within steps. (3) WDK writable stream writes from steps go directly to persistence layer — NOT buffered until step completion. (4) OpenAI Responses API also does NOT show mid-execution progress for user-defined tools. The only actual gap is `data-operation` metadata from `agentSessionManager` used by manage-ui for tool call rendering — addressed as Task 1.13. | Research: Agent.ts wrapToolWithStreaming analysis, @workflow/ai DurableAgent doStreamStep source, WDK writable persistence behavior | Phase 1 Task 1.13: `data-operation` metadata parity. Risk entry updated. Integration gap updated. |
| D6 | External A2A callers: Phase 1-2 stays sync, advertise via agent card extension. Phase 4+ implements real async A2A. | X | No (extension is additive) | **DECIDED** | A2A implementation has 6 critical stubs: `tasks/get` returns hardcoded "completed", `tasks/cancel` returns `{ success: true }` without acting, `tasks/resubscribe` returns mock data, no push notification server-side support, no `extensions` field on AgentCard, `message/send` is synchronous under the hood. Building real async A2A is a large standalone project orthogonal to durable execution. A2A extensions mechanism (spec-standard) allows advertising `executionMode` without breaking core protocol. | Research: A2A spec supports async (submitted→working→completed), push notifications, task lifecycle. Our implementation is stubs. `handleMessageSend()` blocks on `taskHandler()`. AgentCard lacks `extensions` field. A2A client is complete; server is not. | Phase 1: A2A unchanged. Phase 2 Task 2.3: add `extensions` field to AgentCard type + include `executionMode`. Phase 4+: real async A2A with task persistence, push notifications, `tasks/get` polling. |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Routing strategy: all-durable, two-tier, or opt-in? | X | P0 | Yes (Phase 1) | **Resolved (D1):** Explicit opt-in via agent config `executionMode` field. No auto-routing or request-level override. | **Resolved** |
| Q2 | Durability granularity: execution-handler level, agent-turn level, or tool-call level? | T | P0 | Yes (Phase 1) | **Resolved by DurableAgent (D2)**: per-LLM-call granularity. | **Resolved** |
| Q3 | Streaming: existing SSE contract vs new reconnectable protocol vs both? | X | P0 | Yes (Phase 1) | **Resolved (D3):** New `/run/v1/executions` endpoint with UIMessageChunk native streaming. Existing `/completions` and `/chat` unchanged. | **Resolved** |
| Q4 | API contract: evolve `/completions` or new `/executions` endpoint? | X | P0 | Yes (1-way door) | **Resolved (D4):** Streaming POST + reconnectable GET. `POST /run/v1/executions` starts + streams. `GET .../stream?startIndex=N` reconnects. `GET .../status` polls. | **Resolved** |
| Q5 | What is the production WORKFLOW_TARGET_WORLD — Postgres or Vercel? | T | P1 | No | **Resolved:** Postgres World (`@workflow/world-postgres`). The codebase supports all 3 worlds (Local, Postgres, Vercel) via `WORKFLOW_TARGET_WORLD` env var. Local is the default (dev). Postgres is the production path — `world.start()` and orphan recovery only run for Postgres and Local (`index.ts:108-130`). Vercel World exists but is experimental — requires platform-specific env vars (`VERCEL`, `WORKFLOW_VERCEL_AUTH_TOKEN`, etc.) and is excluded from startup initialization. All spec assumptions (pg-boss, retention cron SQL, deployment model) confirmed. | **Resolved** |
| Q6 | @workflow/ai — will it be published? Should we wait or build custom? | T | P1 | No | **Resolved: @workflow/ai IS published** (v4.0.1-beta.52 on npm). DurableAgent available. Need to `pnpm add @workflow/ai` and upgrade `workflow` to ^4.1.0-beta.51. | **Resolved** |
| Q7 | Step ID fragility — how do we handle code deploys during suspended workflows? | T | P1 | No | **Resolved:** Workflow code discipline conventions: append-only workflow functions, drain-before-deploy, explicit hook tokens for HITL, version workflows for restructuring. Risk is LOW — agent workflows are minutes-long. See "Workflow code discipline" section. | **Resolved** |
| Q8 | @workflow/ai is labeled "experimental" — how do we manage version pinning? | T | P1 | No | **Resolved:** Pin exact version in lockfile. Monitor changelogs. DurableAgent API surface (constructor + stream) is stable. pg-boss step expiration confirmed NOT an issue — hybrid architecture (pg-boss dequeues quickly, local world handles execution) means long-running steps are not expired. Verified: pg-boss `MIN_POLLING_INTERVAL_MS: 500` is a hard floor but total per-step overhead is dominated by suspend/persist/replay cycle, not polling. | **Resolved** |
| Q9 | How do we handle concurrent messages to the same conversation during a running execution? | X | P1 | No | **Resolved:** Server-side concurrency guard on `POST /run/v1/executions` rejects with 409 Conflict if a durable workflow is already active on the conversation (checked via `workflow_executions` table). Durable path only — sync path is separate scope. Vercel AI SDK has zero server-side concurrency enforcement. OpenAI Assistants API precedent: returns 400 for active Runs. Widget already disables input during streaming (`status === "submitted"`). | **Resolved** |
| Q10 | How do we provide tool execution progress on the durable path? | T | P2 | No | **Resolved (D11):** Not a regression. Research confirms NEITHER path provides mid-execution tool progress. Sync path's `wrapToolWithStreaming` emits lifecycle events (start/delta/available) BEFORE and AFTER tool execution, not during. DurableAgent's `doStreamStep` emits identical `tool-input-start/delta/available` chunks live from within steps. WDK writable writes are NOT buffered until step completion — they go directly to persistence and are immediately readable. Only gap: `data-operation` metadata (from `agentSessionManager`) used by manage-ui for tool call rendering — addressed as Task 1.13. | **Resolved** |
| Q11 | Should A2A support durable execution for durable agents? | X | P1 | No (Phase 2) | **Resolved (D6):** Phase 1-2: A2A stays synchronous. Phase 2: advertise `executionMode` via agent card extension. Phase 4+: real async A2A with task persistence and push notifications. The A2A server has 6 critical stubs that must be replaced before async works — this is a large standalone project. | **Resolved** |
| Q12 | Should `executionMode` be exposed in `/.well-known/agent.json` agent discovery card? | X | P2 | No | **Resolved (D6):** Yes, via A2A extensions mechanism. Phase 2 Task 2.3 adds `extensions` field to `AgentCapabilities` type and includes `executionMode` info. Uses spec-standard extension URI pattern. | **Resolved** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | ~2s per step overhead is acceptable for durable executions | **CONFIRMED** | Official WDK benchmarks: ~2.0s/step Postgres, ~2.0s/step Vercel. Architectural (suspend/persist/replay), not queue-specific. | — | **Verified** |
| A2 | MCP connection re-establishment per step (100-500ms) is acceptable | HIGH | Already measured via existing per-task Agent creation | — | Active |
| A3 | UIMessageChunk format provides semantic equivalence to our current SSE events | HIGH | Confirmed via DurableAgent source: `text-delta`, `tool-input-start/delta/available`, `tool-output-available` map to our events | — | **Verified** |
| A4 | Orphan recovery handles durable agent workflows correctly | HIGH | Existing orphan recovery works for eval/trigger workflows | Phase 1 testing | Active |
| A5 | DurableAgent's `prepareStep` and `stopWhen` callbacks are compatible with our compression and transfer detection logic | HIGH | Confirmed: same AI SDK types (`PrepareStepFunction`, `StopCondition`). Agent.ts uses identical signatures. | — | **Verified** |
| A6 | `@workflow/ai` beta API won't break before we ship Phase 1 | MED | Pin version. DurableAgent constructor + stream API is stable across @workflow/ai betas. | Phase 1 ship | Active |
| A7 | WDK deterministic VM handles all non-determinism automatically | **CONFIRMED** | WDK provides: seeded `Math.random()`, fixed `Date.now()`, deterministic `crypto.randomUUID()`. `setTimeout`/`fetch` throw errors inside workflows (all I/O goes through steps). No user action needed. | — | **Verified** |
| A8 | Completed WDK steps are NOT re-executed on replay | **CONFIRMED** | Event log stores step results. On replay, `step_completed` events resolve step Promises with cached hydrated results (step.js:89-96). Partial failures (no completion event) DO re-execute. | — | **Verified** |
| A9 | WDK workflow VM does NOT enforce I/O isolation at JS level | **CONFIRMED** | The VM blocks `fetch`/`setTimeout`/`setInterval` but does NOT block direct Postgres calls. However, I/O outside of steps BREAKS deterministic replay (on replay, the query re-executes and may return stale/different results). This is an architectural requirement, not a runtime enforcement. Every existing workflow in the codebase strictly keeps I/O inside steps. | — | **Verified** |
| A10 | `prepareStep` callback runs outside of `'use step'` | **CONFIRMED** | DurableAgent's `prepareStep` is called from the agent loop, NOT from within a `'use step'` function. It runs inside the workflow VM context. Must be pure (in-memory only). DB access in `prepareStep` would appear to work but breaks determinism on replay. | — | **Verified** |

## 13) Phases & rollout plan

### Phase 0: Foundation (prerequisite)
**Goal:** WDK infrastructure is up-to-date, `@workflow/ai` is installable, and `executionMode` field exists in the data model.

#### Task 0.1: Upgrade workflow packages
- Upgrade `workflow` from installed 4.0.1-beta.33 to ^4.1.0-beta.51+ (required peer dep for @workflow/ai)
- Install `@workflow/ai@4.0.1-beta.52`
- Verify Vite plugin (`workflow/vite` in `agents-api/vite.config.ts`) handles `@workflow/ai` imports
- Add `@workflow/ai` to `optimizeDeps.exclude` in `agents-api/vite.config.ts` if needed
- **Files:** `agents-api/package.json`, `pnpm-lock.yaml`, `agents-api/vite.config.ts`

#### Task 0.2: Verify existing workflows still work
- Run existing workflow tests (scheduledTriggerRunner, evaluateConversation, runDatasetItem)
- Confirm `pnpm build` succeeds — the build script (`agents-api/scripts/build-workflow.ts`) scans `./src/domains/evals/workflow` and `./src/domains/run/workflow`
- Confirm orphan recovery startup still works (`agents-api/src/workflow/world.ts`)
- **Acceptance:** All existing workflow tests pass, build green, `DurableAgent` can be imported in a test file

#### Task 0.3: Add `executionMode` to agent config schema + `workflow_executions` table
- **Manage schema:** Add `executionMode` column to agents table in `packages/agents-core/src/db/manage/manage-schema.ts:87-108` — `varchar('execution_mode', { length: 50 })`, nullable, default `null` (null = classic)
- **Runtime schema:** Add `workflow_executions` table to `packages/agents-core/src/db/runtime/runtime-schema.ts`:
  ```typescript
  export const workflowExecutions = pgTable('workflow_executions', {
    ...projectScoped,          // tenantId, id, projectId
    runId: varchar('run_id', { length: 256 }), // Nullable for Insert-Before-Start pattern
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    conversationId: varchar('conversation_id', { length: 256 }),
    status: varchar('status', { length: 50 }).notNull().default('starting'),
    // status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  }, (table) => [
    uniqueIndex('workflow_executions_run_id_idx').on(table.runId),
  ]);
  ```
  **Purpose:** Maps WDK `runId` → `(tenantId, projectId)` for tenant isolation on reconnection/status endpoints. `getRun(runId)` has NO multi-tenant awareness — this table is the ONLY security boundary.
  **Insert-Before-Start pattern:** `runId` is nullable because the record is created BEFORE `start()` returns. This closes a race condition: if the process crashes between `start()` and record creation, the orphan workflow has no ownership record (no tenant isolation on reconnection, no cleanup path). By inserting first with `runId: null, status: 'starting'`, then updating with the actual `runId` after `start()` returns, we ensure: (a) every `start()` call has a pre-existing ownership record, (b) orphan records with `status: 'starting'` and `runId: null` can be cleaned up by a periodic job, (c) the concurrency guard can reject concurrent requests even during the `start()` window.
- **Data access:** Add to data-access layer:
  - `createWorkflowExecution()` — creates record with nullable `runId` (Insert-Before-Start pattern)
  - `updateWorkflowExecution()` — updates `runId` and `status` after `start()` returns
  - `getWorkflowExecution()` — lookup by `runId`, MUST filter by `scopes: { tenantId, projectId }` (follows existing pattern in `conversations.ts`)
  - `getActiveWorkflowExecution()` — lookup by `conversationId` where `status IN ('starting', 'running')` for concurrency guard
- Run `pnpm db:generate` to create migrations (one manage, one runtime)
- Extend Zod schemas in `packages/agents-core/src/validation/schemas.ts`:
  - `AgentInsertSchema` (line ~436) — add `executionMode: z.enum(['classic', 'durable']).optional()`
  - `AgentWithinContextOfProjectSchema` (line ~2372) — add to `.extend()` block
- No API route changes needed — schemas propagate automatically through `AgentApiInsertSchema`, `AgentApiUpdateSchema`
- **Files:** `manage-schema.ts`, `runtime-schema.ts`, `schemas.ts`, new data-access file, 2 migration files in `drizzle/`

#### Task 0.4: Add `executionMode` to SDK, manage-ui, CLI, and shared types
- **SDK types:** Add `executionMode` to `AgentConfig` interface in `packages/agents-sdk/src/types.ts`, handle in `Agent` class constructor and `toFullAgentDefinition()` in `packages/agents-sdk/src/agent.ts`
- **Shared types exports:** Add `ExecutionMode` type to `packages/agents-core/src/client-exports.ts` (`FullAgentDefinitionSchema`) and re-export from `packages/agents-core/src/index.ts`. Required for SDK consumers to get type safety on `executionMode`.
- **Manage-UI agent form:** Extend schema in `agents-manage-ui/src/components/agents/agent-form.tsx:15-22`, add select/toggle component
- **Manage-UI metadata extraction:** Add to `extractAgentMetadata()` in `agents-manage-ui/src/features/agent/domain/agent-initializer-helpers.ts:18-61`
- **CLI pull generator:** Add `executionMode` field handling in `agents-cli/src/commands/pull-v3/components/agent-generator.ts` (explicitly maps agent fields to generated code — needs new field mapping for `executionMode`)
- **Files:** `packages/agents-sdk/src/types.ts`, `packages/agents-sdk/src/agent.ts`, `packages/agents-core/src/client-exports.ts`, `packages/agents-core/src/index.ts`, `agent-form.tsx`, `agent-initializer-helpers.ts`, `agents-cli/src/commands/pull-v3/components/agent-generator.ts`

**Phase 0 acceptance criteria:**
- [ ] `pnpm build` succeeds with new packages
- [ ] Existing 3 workflow tests pass
- [ ] `DurableAgent` can be imported and instantiated in a test
- [ ] `executionMode` field round-trips through API (create agent with `executionMode: 'durable'`, read it back)
- [ ] Manage-UI shows execution mode toggle in agent settings

**Risk:** Workflow version upgrade may have breaking changes for existing 3 workflows.
**Mitigation:** Run all existing workflow tests before and after upgrade. Pin exact versions.

---

### Phase 1: Durable agent execution (core value)
**Goal:** A single agent turn (LLM calls + tool execution) runs durably via DurableAgent inside a WDK workflow. Streaming to client. Reconnection. No transfer/delegation yet.

#### Task 1.1: Create `agentExecutionWorkflow`
- New file: `agents-api/src/domains/run/workflow/functions/agentExecution.ts`
- Mark with `'use workflow'` directive
- Implements single-agent turn: load config → create DurableAgent → stream
- Uses `getWritable<UIMessageChunk>()` for streaming output
- Export with `.workflowId` following existing pattern (see `scheduledTriggerRunner.ts:50`)
- The build script already scans `./src/domains/run/workflow` — no config changes needed
- **Pattern reference:** `agents-api/src/domains/run/workflow/functions/scheduledTriggerRunner.ts`

#### Task 1.2: Create durable agent step functions
- New file: `agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts`
- `loadAgentConfig()` — `'use step'`: loads agent config, resolves model provider, builds tool set. Mirrors what `executionHandler.ts` does today but as a serializable step.
- `loadConversationHistoryStep(conversationId, tenantId, projectId, agentId, compressionConfig)` — `'use step'`: loads full conversation history from runtime DB and applies compression. **Critical for WDK determinism** — `prepareStep` callback runs outside of `'use step'` but inside the workflow VM. Any DB I/O in `prepareStep` breaks deterministic replay (on replay, the query re-executes and may return different results). By loading history in a step BEFORE `durableAgent.stream()`, we ensure: (a) the DB read result is cached in the event log, (b) `prepareStep` only does in-memory operations, (c) the pattern matches every existing workflow in the codebase. This mirrors the sync path's `buildConversationHistory()` → `getConversationHistoryWithCompression()` (executionHandler.ts:244-260).
- `executeToolStep(toolId, input, context)` — `'use step'`: **static dispatcher** for all tool execution. `'use step'` requires compile-time AST discoverability — cannot be inside dynamic functions. This single static step function dispatches to the correct tool at runtime via `toolId`. DurableAgent does NOT wrap tools in steps internally.
- `persistAgentMessage(conversationId, messages, tenantId, projectId)` — `'use step'`: persists agent response messages to runtime DB. Called AFTER `durableAgent.stream()` returns (matches sync path pattern where `executionHandler.ts:500-519` persists after `agent.generate()` completes — NOT incrementally during streaming). Called from the outer workflow loop, not from `onStepFinish`. All args must be serializable primitives/arrays (no DB client — resolve inside step via module-scope import).
- Credential resolution happens INSIDE steps (not passed as step params) — prevents leakage to WDK event log
- MCP connections re-established per step (~100-500ms, acceptable — A2 assumption)
- **Note:** `runAgentTurn()` is NOT a `'use step'` — it's a regular async function called from the workflow. DurableAgent internally wraps each `model.doStream()` call in its own step via `doStreamStep()`.
- **Note:** `prepareStep` callback is PURE in-memory compression only. The conversation history is already loaded and compressed by `loadConversationHistoryStep`. `prepareStep` must NOT make DB calls — it runs outside `'use step'` and any I/O breaks WDK deterministic replay.
- **Pattern reference:** `agents-api/src/domains/run/workflow/steps/scheduledTriggerSteps.ts`

#### Task 1.3: Build DurableAgent ↔ Agent.ts bridge
- Map our agent config to DurableAgent constructor:
  - `model: () => createModelProvider(config)` — wraps our model resolution
  - `tools: buildDurableToolSet(config.tools)` — wraps tool definitions with `'use step'` for long-running tools
  - `system: config.systemPrompt`
- Map DurableAgent callbacks to our existing logic:
  - `prepareStep` → **in-memory compression only** (same AI SDK type `PrepareStepFunction` — A5 verified). Conversation history is pre-loaded by `loadConversationHistoryStep`. `prepareStep` receives pre-loaded data and does in-memory windowing/truncation. **No DB calls** — runs outside `'use step'`, inside workflow VM.
  - `stopWhen` → our transfer detection logic (same AI SDK type `StopCondition` — A5 verified)
  - `onStepFinish` → telemetry/metrics
  - `maxSteps` → from agent config `maxGenerationSteps`
- **Key file to reference:** `agents-api/src/domains/run/agents/Agent.ts` (3722 lines — the generate/stream logic we're replacing for durable mode)

#### Task 1.4: Create `/run/v1/executions` route file
- New file: `agents-api/src/domains/run/routes/executions.ts`
- **OpenAPI:** All routes MUST use `createRoute()` with Zod request/response schemas (same pattern as `agents-api/src/domains/manage/routes/agentFull.ts`) so they appear in `/openapi.json` and `/docs`. This is a 1-way-door public API surface.
- Three handlers:
  - `POST /` — Start execution:
    1. Validate request (agentId, messages, optional conversationId)
    2. Verify agent has `executionMode: 'durable'` (return 400 if not)
    3. Create/get conversation record + persist user message **before** workflow start (same pre-processing as sync path in `chat.ts:237-328`)
    4. **Concurrency guard:** Check `workflow_executions` for active execution on this conversation → return 409 if found
    5. **Insert-Before-Start:** Create `workflow_executions` record with `runId: null, status: 'starting'` BEFORE calling `start()`
    6. Call `start(agentExecutionWorkflow, [payload])` — returns `Run` object
    7. Update `workflow_executions` record with actual `runId` and `status: 'running'`
    8. Return `run.readable` stream with `x-workflow-run-id: run.runId` header
  - `GET /:executionId/stream` — Reconnect: `getRun(executionId)` (synchronous), return `run.getReadable({ startIndex })` or 204 if completed
  - `GET /:executionId/status` — Poll: `run.status` (async getter), return `{ executionId, status, ... }`
- Auth: `runApiKeyAuth()` already applies to `/run/v1/*` (line 329 in createApp.ts) — no additional middleware needed. Reconnection GET requires same auth (API key + context headers).
- `createUIMessageStreamResponse()` does NOT exist in `@workflow/ai` — build as local utility (simple `new Response(stream, { headers })`)
- **Pattern reference:** `agents-api/src/domains/run/routes/chat.ts`, `chatDataStream.ts`

#### Task 1.5: Register executions route
- Edit `agents-api/src/domains/run/index.ts` to mount the new route:
  ```typescript
  import executionRoutes from './routes/executions';
  app.route('/v1/executions', executionRoutes);
  ```
- Full path becomes `/run/v1/executions` (run domain mounted at `/run` in `createApp.ts`)
- **File:** `agents-api/src/domains/run/index.ts:9-18`

#### Task 1.6: Widget conditional transport
- Edit `use-inkeep-chat.ts` in @inkeep/agents-ui (v0.15.x): conditional `WorkflowChatTransport` vs `DefaultChatTransport` based on `executionMode` prop
- Add `executionMode` to type definitions in `types/config/ai.ts`
- Add `@workflow/ai` as optional peer dep
- **Files:** Widget repo `packages/primitives/src/components/embedded-chat/use-inkeep-chat.ts`, `packages/types/src/config/ai.ts`, `package.json`

#### Task 1.7: Manage-UI pass execution mode to widget
- In `agents-manage-ui/src/components/agent/playground/chat-widget.tsx`: read agent's `executionMode` from config, pass as prop + construct `executionsUrl` when durable
- Same in `copilot-chat.tsx`
- **Files:** `chat-widget.tsx`, `copilot-chat.tsx`

#### Task 1.8: Telemetry
- Extend existing OpenTelemetry tracing to cover workflow steps:
  - Workflow runId as span attribute
  - Step start/end timing
  - Step type (LLM call, tool execution, config load)
- Correlate: `runId` → `conversationId` → `requestId`
- **Pattern reference:** Existing tracing in `agents-api/src/domains/run/`

#### Task 1.9: Tests
- Unit tests for DurableAgent bridge (config mapping, tool wrapping, callback bridging)
- Integration test: POST to `/run/v1/executions`, verify UIMessageChunk stream
- Integration test: Reconnection — start execution, GET `/stream?startIndex=N`, verify continuation
- Integration test: Status endpoint returns correct state
- Verify existing `/completions` and `/chat` endpoints are unchanged (regression test)
- **Directory:** `agents-api/src/__tests__/run/`

#### Task 1.10: Execution-mode-aware timeout defaults
- Add durable timeout constants to `agents-api/src/domains/run/constants/execution-limits/defaults.ts`:
  ```typescript
  // Durable execution timeout defaults (all env-overridable via AGENTS_ prefix)
  DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS: 1_800_000,        // 30 min (vs 60s sync)
  DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS: 600_000,    // 10 min (vs 30s sync)
  DURABLE_LLM_GENERATION_MAX_TIMEOUT_MS: 3_600_000,       // 60 min (vs 10 min sync)
  DURABLE_TOOL_TIMEOUT_MAX_MS: 7_200_000,                 // 2 hour ceiling (safety limit)
  ```
- Branch timeout resolution on `executionMode` in `executeToolStep`:
  ```typescript
  function getToolTimeout(toolType: 'mcp' | 'function', executionMode: string | null): number {
    if (executionMode === 'durable') {
      const timeout = toolType === 'mcp'
        ? DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS
        : DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS;
      return Math.min(timeout, DURABLE_TOOL_TIMEOUT_MAX_MS);
    }
    return toolType === 'mcp'
      ? MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT
      : FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT;
  }
  ```
- Branch LLM timeout in `createModelProvider` (or the DurableAgent bridge factory):
  - When `executionMode === 'durable'`, use `DURABLE_LLM_GENERATION_MAX_TIMEOUT_MS` instead of `LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS` as the `AbortSignal.timeout()` cap
- All new constants follow the existing `AGENTS_` prefix override convention (env var ceiling)
- Verify pg-boss step expiration behavior with a 20+ minute tool call test (confirms the hybrid architecture doesn't expire long-running steps)
- **Why in-scope:** The durable path's core use case is long-running tool calls. Without raised timeouts, the feature doesn't work — a 10-minute MCP call is killed at 60s. This is foundational, not optional.
- **Why NOT per-tool config (yet):** Per-tool timeout requires schema migration, SDK changes, and manage-ui changes. The execution-mode signal is sufficient for Phase 1 — all tools on a durable agent get the higher ceiling. Per-tool config deferred to Phase 3+ (see Appendix).
- **Files:** `agents-api/src/domains/run/constants/execution-limits/defaults.ts`, `agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts` (tool timeout), DurableAgent bridge (LLM timeout)
- **Tests:** See Task 1.9 — includes timeout resolution tests for both durable and classic paths, and pg-boss expiration verification

#### Task 1.11: Message write idempotency
- Add nullable `idempotencyKey` column to messages table in `packages/agents-core/src/db/runtime/runtime-schema.ts`:
  ```typescript
  idempotencyKey: varchar('idempotency_key', { length: 512 }),
  ```
- Add unique constraint: `uniqueIndex('messages_idempotency_key_idx').on(table.idempotencyKey)` (partial — only where non-null)
- Update `createMessage()` in data-access layer to accept optional `idempotencyKey` param. On conflict (duplicate key), return existing message instead of inserting.
- Durable write path (`persistAgentMessage` step) passes deterministic key: `{workflowRunId}_{stepName}_{role}` — ensures step retry produces the same key, preventing duplicate messages.
- Sync path is unaffected (key is null — no constraint check).
- **Why:** `createMessage()` uses `generateId()` which generates a new ID on each invocation. On WDK step retry (crash after DB write, before event log persistence), the step re-executes and creates a duplicate message. This is the most common step retry side effect.
- **Files:** `runtime-schema.ts`, `messages.ts` (data-access), `agentExecutionSteps.ts` (pass key to persistAgentMessage)
- **Migration:** One new runtime migration (`pnpm db:generate`)

#### Task 1.12: Empirical validation of DurableAgent error surface (U1-U6)
- Write focused test cases for each of the 6 unknowns (U1-U6) identified in the error handling strategy:
  - U1: Mock failing model provider → check if error UIMessageChunk appears in stream
  - U2: Mock failing tool → check if error chunk appears in stream
  - U3: Catch DurableAgent error → attempt writer.write() → check if writable stream is still writable
  - U4: Trigger various failures (network, timeout, auth) → observe throw vs swallow behavior
  - U5: Trigger step failure mid-agent-turn → observe WDK retry interaction with DurableAgent
  - U6: Trigger DurableAgent failure → check `run.status` reflects error correctly
- **Outcome:** Results determine whether defensive error chunk writing is needed (if U1-U3 show DurableAgent already handles errors correctly, the defensive try/catch can be simplified).
- **Files:** `agents-api/src/__tests__/run/workflow/durableAgentErrorSurface.test.ts`
- **Dependency:** Requires Task 1.3 (DurableAgent bridge) to be implemented first

#### Task 1.13: `data-operation` metadata parity on durable path
- The sync path's `agentSessionManager` attaches `data-operation` metadata to tool call events consumed by manage-ui for tool call rendering (operation type, display name, progress indicators).
- On the durable path, DurableAgent's `doStreamStep` emits `tool-input-start/delta/available` and `tool-output-available` UIMessageChunk events, but does NOT include `data-operation` metadata.
- **Action:** In the DurableAgent bridge (Task 1.3), intercept tool lifecycle UIMessageChunk events and attach equivalent `data-operation` metadata that manage-ui expects for rendering tool calls in the playground.
- **Scope:** This is a metadata enrichment task — the underlying streaming behavior is already parity (D11 confirms no regression in tool lifecycle events).
- **Files:** DurableAgent bridge code (Task 1.3), manage-ui tool call rendering components (reference only — no changes expected if metadata shape matches)
- **Dependency:** Requires Task 1.3 (DurableAgent bridge)

**Phase 1 acceptance criteria:**
- [ ] Agent with `executionMode: 'durable'` + a 10-minute tool call completes successfully
- [ ] Tool call lasting 30 minutes completes on durable path (validates raised timeouts + pg-boss expiration is not a blocker)
- [ ] Server restart during execution → workflow resumes from last step
- [ ] Client reconnects after network drop → receives continuation stream from correct position
- [ ] Existing `/completions` and `/chat` endpoints unchanged and fully functional
- [ ] No credentials in WDK event log (verified via event log inspection)
- [ ] Widget correctly selects transport based on `executionMode`
- [ ] Telemetry: workflow runId visible in traces, step timing recorded
- [ ] Timeout resolution correctly branches on `executionMode` (durable vs classic defaults verified in unit tests)
- [ ] Concurrent POST to same conversation returns 409 Conflict (concurrency guard verified)
- [ ] Insert-Before-Start: workflow_executions record exists before start() call (verified via test that crashes after start)
- [ ] Message idempotency: step retry does not create duplicate messages (idempotencyKey verified)
- [ ] U1-U6 empirical validation complete — error handling strategy confirmed or adjusted based on findings
- [ ] Execution status transitions to 'completed' after successful workflow (persistExecutionStatusStep verified)
- [ ] Execution status transitions to 'failed' after workflow error (persistExecutionStatusStep verified)
- [ ] Concurrency guard self-heals: stale 'running' record with completed WDK run → lazily reconciled, new request allowed
- [ ] Orphan 'starting' records older than 60s treated as stale by concurrency guard
- [ ] `data-operation` metadata attached to tool lifecycle UIMessageChunk events on durable path (manage-ui renders tool calls correctly)

**Not in scope:** Agent transfers/delegation, HITL tool approval, UIMessageChunk→OpenAI adapter, parallel durable tools, per-tool timeout config (Phase 3+ — see Appendix).

---

### Phase 2: Transfer orchestration + HITL + A2A discovery
**Goal:** Multi-agent delegation chains run durably. Tool approvals survive restarts. External callers can discover durable agents.

#### Task 2.1: Extend workflow with transfer loop + durable delegation
- Modify `agentExecutionWorkflow` to add the transfer `while` loop:
  ```
  while (iterations < MAX_TRANSFERS) {
    result = await runAgentTurn(currentAgentId, params, writable);
    // persistAgentMessage step called here (after stream completes)
    if (result.type === 'transfer') { currentAgentId = result.targetId; continue; }
    break;
  }
  // Manually close writable after loop exits
  const writer = writable.getWriter();
  await writer.close();
  ```
- **CRITICAL: `preventClose: true`** — DurableAgent closes the writable stream by default when `.stream()` returns (`preventClose` defaults to `false`). In a multi-agent chain, the second agent can't write to a closed stream. All `runAgentTurn()` calls MUST use `preventClose: true` (already set in the code pattern). The workflow closes the stream manually after the loop exits.
- **Stream lifecycle for multi-turn:** Consider `sendStart: false, sendFinish: false` on individual agent turns, and manually write a single `start` chunk before the loop and `finish` chunk after the loop. This gives the client one continuous stream instead of multiple start/finish pairs per agent.
- `stopWhen` callback returns transfer signal → workflow reads it and routes to next agent
- **stopWhen nuance:** `stopWhen` is called after each tool execution completes with `{ steps: StepResult[] }`. The triggering tool call IS included in the returned messages. There is no explicit flag to distinguish "stopped by stopWhen" from "finished naturally" — our `parseAgentResult()` must inspect the last message's tool calls to detect the `transfer_to_agent` tool invocation. This is the same detection pattern used in the sync path today.
- Each agent turn is a separate DurableAgent.stream() call within the same workflow
- **Durable delegation (D5):** Delegation tools within the transfer loop use the step-poll pattern — a `'use step'` function calls `start(childAgentWorkflow, [...])` then `await run.returnValue` (polls every 1s internally). This is durable (step survives restarts via pg-boss re-enqueue), simple, and handles delegations lasting 10+ minutes. The step blocks a pg-boss worker slot for the delegation duration — acceptable for Phase 2 volumes. Phase 4 can optimize to hook-based zero-resource wait if worker exhaustion becomes a concern.
- **Step retry idempotency (from A2A triple-check):** Two cross-cutting concerns for all tools running inside `executeToolStep`:
  1. **DB write dedup:** Delegation tools call `createMessage()` + `saveA2AMessageResponse()` inside the step. On step retry, these re-execute with fresh `generateId()` values → duplicate messages. Accept at-least-once semantics for Phase 2 (messages are additive). Phase 4: add idempotency keys.
  2. **Child workflow dedup:** `start(childAgentWorkflow)` inside a retried step could create a duplicate child. Implementation MUST use a deterministic run ID derived from `(parentRunId, stepId, delegationParams)` so `start()` returns the existing run on retry. Verify WDK `start()` dedup behavior during Phase 2 implementation.
- **`isDelegation` flag on durable path:** The sync path's `isDelegation: true` metadata disables streaming on the delegated agent. On the durable path, this is unnecessary — the child workflow runs to completion and returns its result via `run.returnValue`. No streaming to client occurs in the child. The durable delegation implementation should NOT pass `isDelegation` to the child workflow (it's a sync-path-only concern).
- **Transfer logging parity:** On the sync path, the A2A handler (`handlers.ts:301-354`) logs transfer artifacts. On the durable path, transfers bypass the A2A handler entirely (the workflow orchestrates DurableAgents directly). Equivalent transfer logging must be added to the workflow's transfer detection logic.
- **File:** `agents-api/src/domains/run/workflow/functions/agentExecution.ts`

#### Task 2.1b: Cancel endpoint
- New route: `POST /run/v1/executions/{executionId}/cancel`
- Verify tenant ownership via `workflow_executions` table
- Call `run.cancel()` (async, does NOT interrupt current step — prevents new step invocations)
- Status transitions to `'cancelled'` asynchronously
- Stream may contain partial results up to cancellation point
- Return 200 with `{ executionId, status: 'cancelling' }` (actual cancellation is async)
- **File:** `agents-api/src/domains/run/routes/executions.ts`

#### Task 2.2: Durable HITL tool approval
- Replace process-local `ToolApprovalUiBus` (in-memory Map) with WDK `defineHook()` for durable suspension
- Workflow suspends at tool approval point → webhook token generated
- New route: `POST /run/v1/executions/{executionId}/approve/{token}` resumes the workflow
- Auto-webhook already registered at `/.well-known/workflow/v1/webhook/:token` by the build system
- **Files:** New approval route in `executions.ts`, modify tool wrapping in `agentExecutionSteps.ts`

#### Task 2.3: Agent card extension for execution mode (D6)
- Add `extensions` field to `AgentCapabilities` interface in `packages/agents-core/src/types/a2a.ts`:
  ```typescript
  export interface AgentExtension {
    uri: string;
    description?: string;
    required?: boolean;
    params?: Record<string, unknown>;
  }

  export interface AgentCapabilities {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
    extensions?: AgentExtension[];  // NEW
  }
  ```
- Update `createAgentCard()` in `agents-api/src/domains/run/data/agents.ts` to include durable execution extension when `executionMode === 'durable'`:
  ```typescript
  extensions: agent.executionMode === 'durable' ? [{
    uri: 'urn:inkeep:ext:durable-execution/v1',
    description: 'Supports long-running durable task execution with reconnection',
    required: false,
    params: {
      executionsEndpoint: '/run/v1/executions',
      supportsReconnection: true,
    },
  }] : undefined,
  ```
- Add `A2A-Extensions` header processing in A2A handler for extension negotiation (per A2A spec)
- **Scope:** Small — 2 type additions + ~15 lines in `createAgentCard()` + header handling
- **Why not a breaking change:** `extensions` is additive to AgentCard (optional field). Existing callers that don't read it are unaffected.
- **Files:** `packages/agents-core/src/types/a2a.ts`, `agents-api/src/domains/run/data/agents.ts`, `agents-api/src/domains/run/a2a/handlers.ts`

#### Task 2.4: Tests
- Integration: A→B→C delegation chain completes across simulated restart
- Integration: Durable delegation (step-poll) — agent A delegates to agent B (10+ min), completes successfully
- Integration: Tool approval request survives restart; approval resumes workflow
- Unit: Transfer detection via `stopWhen` routes correctly
- Unit: AgentCard includes durable execution extension when `executionMode === 'durable'`
- Unit: AgentCard omits extension when `executionMode !== 'durable'`
- Unit: `A2A-Extensions` header processing echoes supported extensions

#### Task 2.5: WDK data retention cron
- Implement periodic cleanup of completed workflow data from WDK tables
- **Approach:** `setInterval()` in the API startup (same process, no new infrastructure). Runs every 6 hours. Deletes rows from `workflow.workflow_runs`, `workflow.workflow_steps`, and `workflow.workflow_events` where `completed_at < NOW() - INTERVAL 'N days'`.
- **Configuration:** `WORKFLOW_DATA_RETENTION_DAYS` environment variable (default: 30 days). Follows existing `AGENTS_` prefix convention.
- **Scope:** ~30 lines of SQL, ~20 lines of scheduling code. No new system components.
- **Why Phase 2 (not Phase 1):** Storage growth is ~10MB/day at expected Phase 1 volumes. Not urgent for months. Phase 1 should focus on core functionality. Phase 2 adds this as a hygiene measure before production scaling.
- **Why not a WDK workflow:** Using a WDK workflow to clean up WDK data is circular — if the workflow fails, it generates more data. A simple `setInterval` + SQL is more robust.
- **Files:** New file in `agents-api/src/workflow/` (e.g., `retention.ts`), startup registration in `agents-api/src/index.ts`

**Phase 2 acceptance criteria:**
- [ ] A→B→C delegation chain completes, including across server restarts
- [ ] Durable delegation: agent A delegates to agent B (simulated 10+ min), step-poll completes successfully
- [ ] Tool approval request survives process restart; user approves later → workflow resumes
- [ ] Transfer detection via `stopWhen` routes correctly to next agent
- [ ] Approval API returns clear error for expired/invalid tokens
- [ ] Agent card for durable agent includes `extensions` with durable execution info
- [ ] Agent card for classic agent does NOT include durable extension
- [ ] WDK data retention cron purges completed workflow data older than configured TTL

---

### Phase 3: Format bridge + SDK integration
**Goal:** Backward compatibility for OpenAI-format SDK consumers. SDK methods for durable execution. Documentation.

#### Task 3.1: UIMessageChunk → OpenAI SSE adapter
- TransformStream that maps UIMessageChunk types to `chat.completion.chunk` format
- `text-delta` → `choices[0].delta.content`
- `tool-input-start/delta` → `choices[0].delta.tool_calls`
- `start-step`/`finish-step` → dropped (no OpenAI equivalent) or mapped to custom SSE comments
- Optional `?format=openai` query param on `GET /run/v1/executions/{id}/stream`
- **File:** New utility in `agents-api/src/domains/run/utils/` or alongside `stream-helpers.ts`

#### Task 3.2: SDK client methods
- New `ExecutionsClient` class in `packages/agents-sdk/src/`
- Methods: `create()`, `stream()`, `status()`, `cancel()` (Phase 2 prerequisite)
- Pattern: follow `packages/agents-sdk/src/evaluationClient.ts`
- **Files:** `packages/agents-sdk/src/executionsClient.ts`, export from `packages/agents-sdk/src/index.ts`

#### Task 3.3: Documentation
- New page: `agents-docs/content/docs/features/durable-execution.mdx`
- Cover: what it is, when to use it, how to enable (agent config), API reference, SDK usage, reconnection, limitations
- Update existing API reference pages for new endpoints
- **Directory:** `agents-docs/content/docs/`

**Phase 3 acceptance criteria:**
- [ ] SDK `client.executions.create()` → stream → reconnect works end-to-end
- [ ] `?format=openai` returns valid OpenAI SSE from durable execution
- [ ] Documentation published and accurate

---

### Phase 4: Optimization + production hardening
**Goal:** Reduce overhead where possible, handle edge cases, production monitoring.

#### Task 4.1: Benchmark and optimize step overhead
- Benchmark durable path vs sync path for equivalent operations in staging
- Identify if fast tool calls (< 1s) should be batched in single step vs individual steps
- Implement batching heuristic if beneficial

#### Task 4.2: Parallel durable tool execution
- Wrap each parallel tool call in its own `'use step'` for independent durability
- WDK handles concurrent step execution natively
- Relevant for parallelized team agents (each taking minutes)

#### Task 4.3: Production dashboards
- Workflow completion rates, step durations, retry counts, failure modes
- Alert on: orphan recovery rate > threshold, step duration > 5x expected

#### Task 4.4: Per-tool timeout configuration
- Add `timeout?: number` to tool definition in manage schema (Phase 1 uses execution-mode-aware defaults — see Task 1.10)
- Per-tool granularity: e.g., Claude Code at 1 hour, fast API lookup at 60s on the same durable agent
- Requires schema migration, SDK tool builder changes, manage-ui tool editor changes
- Resolution: tool config > agent durable default > env var default > hardcoded default

#### Task 4.5: Step ID stability
- Evaluate whether code deploys during suspended workflows cause step ID mismatches
- If so: add explicit step IDs to workflow functions, or implement drain-before-deploy

#### Task 4.6: Hook-based delegation (zero-resource wait)
- Optimize Phase 2's step-poll delegation to use WDK hooks for zero-resource wait
- Pattern: delegation detected at workflow level (not inside step) → create hook → start child workflow in a step → `await hook` at workflow level (workflow suspends, zero resource usage) → child calls `resumeHook(token, result)` on completion
- **Prerequisite:** Child workflow must know parent's hook token and call `resumeHook()` in its final step
- **Benefit:** Frees pg-boss worker slot during long delegations (10+ min)
- **Complexity:** Medium — requires delegation to be detected and handled at workflow level rather than as a regular tool call inside a step
- **When to prioritize:** If pg-boss worker pool exhaustion is observed in production with the step-poll pattern

#### Task 4.7: Real async A2A (D6 Phase 4+)
- Replace A2A server stubs with real implementations:
  - `tasks/get`: Look up actual task state from DB (currently returns hardcoded "completed")
  - `tasks/cancel`: Actually cancel the workflow (currently returns `{ success: true }` without acting)
  - `tasks/resubscribe`: Reconnect to existing task's event stream (currently returns mock)
  - Push notification support: register webhooks, send HTTP POST on state changes (per A2A spec)
- Add task persistence layer (A2A tasks → DB table with state, result, history)
- Route `message/send` to workflow for durable agents (async fire-and-forget, return `working` state)
- **Scope:** Large standalone project — requires: new DB table for A2A task state, webhook delivery infrastructure, JWT-signed notifications, JWKS endpoint
- **Dependencies:** Phase 1 (durable execution), Phase 2 (agent card extension for discovery)
- **Files:** `agents-api/src/domains/run/a2a/handlers.ts`, new `agents-api/src/domains/run/a2a/taskStore.ts`, `agents-api/src/domains/run/data/agents.ts`

**Phase 4 acceptance criteria:**
- [ ] Durable path overhead understood and documented per operation type
- [ ] No regressions in sync path performance
- [ ] Production dashboards live and alerting
- [ ] (If Task 4.6 done) Delegation uses zero-resource wait — no worker slot blocked during long delegations
- [ ] (If Task 4.7 done) External A2A caller sends `message/send` → gets task in `working` state → polls `tasks/get` → gets `completed` with result

## 14) Testing plan

### Testing infrastructure context

- **Framework:** Vitest with workspace mode (7 projects), 60s test timeout
- **Test DB:** Each test worker gets isolated in-memory PGLite database with all Drizzle migrations applied (manage: ~10 migrations, runtime: ~14 migrations)
- **Request pattern:** `makeRequest()` / `makeRunRequest()` helpers call the Hono app directly via `app.request()` — no network needed
- **Existing workflow test pattern:** Unit tests with hoisted mocks for each step function. Steps are tested individually by importing them and calling directly with mock dependencies. Workflow orchestration logic tested separately.
- **Factories available:** `createTestAgentData()`, `createTestProjectData()`, `createTestToolData()`, `createTestCredentialData()`, `createTestSubAgentData()`, and 6+ more in `agents-api/src/__tests__/utils/testHelpers.ts`
- **Integration test pattern:** Serial execution (1 thread), real PGLite DB, full CRUD flows via `makeRequest()` against Hono app
- **WDK workflow testing strategy:** Workflows under test use hoisted mocks for WDK primitives (`getWritable`, `start`, `getRun`). Step functions are tested individually by importing and calling them with mock dependencies — the `'use step'` directive is a build-time transform that Vitest does not process. This means: (a) step functions are testable as regular async functions in Vitest, (b) the workflow orchestration logic (transfer loop, stream lifecycle) is tested by mocking `runAgentTurn` and verifying control flow, (c) DurableAgent is mocked at the import level for unit tests. Integration tests that need real WDK behavior would require Local World, but Phase 1 unit tests do NOT need it — the existing hoisted-mock pattern is sufficient. This matches how existing workflow tests (evaluateConversation, runDatasetItem) are structured.

### Test directory structure

```
agents-api/src/__tests__/
  run/
    routes/
      executions.test.ts              ← Phase 1: route handler tests (incl. concurrency guard, Insert-Before-Start)
    workflow/
      agentExecution.test.ts          ← Phase 1: workflow step unit tests (incl. idempotency, error handling)
      agentExecutionIntegration.test.ts ← Phase 1: end-to-end workflow test
      durableAgentErrorSurface.test.ts ← Phase 1: U1-U6 empirical validation
    utils/
      uiMessageChunkAdapter.test.ts   ← Phase 3: format bridge tests
  manage/
    routes/
      crud/
        (existing agent tests extended) ← Phase 0: executionMode CRUD
packages/agents-sdk/src/__tests__/
    executionsClient.test.ts           ← Phase 3: SDK client tests
packages/agents-core/src/__tests__/
    validation/
      executionMode.test.ts            ← Phase 0: schema validation
```

---

### Phase 0 tests: Foundation

**Confidence goal:** `executionMode` field works end-to-end through the data model, and WDK packages are compatible.

#### T0.1: Schema & validation (unit)
**File:** `packages/agents-core/src/__tests__/validation/executionMode.test.ts`
**Pattern:** Direct Zod schema validation (no DB, no HTTP)

```
describe('executionMode schema validation')
  ✓ AgentInsertSchema accepts executionMode: 'classic'
  ✓ AgentInsertSchema accepts executionMode: 'durable'
  ✓ AgentInsertSchema accepts executionMode: undefined (optional field)
  ✓ AgentInsertSchema rejects executionMode: 'invalid'
  ✓ AgentInsertSchema rejects executionMode: '' (empty string)
  ✓ AgentUpdateSchema accepts partial update with only executionMode
  ✓ AgentWithinContextOfProjectSchema includes executionMode in full agent definition
```

#### T0.2: Database round-trip (integration)
**File:** Extend existing `agents-api/src/__tests__/manage/routes/crud/agentFull.test.ts`
**Pattern:** PGLite DB + `makeRequest()` against Hono app

```
describe('executionMode CRUD')
  ✓ POST /manage/.../agents — creates agent with executionMode: 'durable', returns it in response
  ✓ POST /manage/.../agents — creates agent without executionMode, defaults to null/classic
  ✓ GET /manage/.../agents/{id} — returns executionMode in response body
  ✓ PATCH /manage/.../agents/{id} — updates executionMode from null to 'durable'
  ✓ PATCH /manage/.../agents/{id} — updates executionMode from 'durable' to 'classic'
  ✓ PUT /manage/.../agents/{id} (full agent) — executionMode round-trips through full agent definition
```

#### T0.3: DurableAgent import (smoke)
**File:** `agents-api/src/__tests__/run/workflow/durableAgentImport.test.ts`
**Pattern:** Verify package is resolvable and constructible

```
describe('DurableAgent availability')
  ✓ @workflow/ai can be imported without errors
  ✓ DurableAgent can be instantiated with minimal config (mock model)
  ✓ WorkflowChatTransport can be imported (for type verification)
```

#### T0.4: Existing workflow regression
**Pattern:** Run existing workflow test suites after package upgrade

```
✓ evaluateConversation.test.ts — all existing tests pass
✓ runDatasetItem.test.ts — all existing tests pass
✓ pnpm build — succeeds with new packages, workflow bundles generated
```

---

### Phase 1 tests: Durable agent execution

**Confidence goal:** A durable execution can be started, streamed, reconnected, and survives step boundaries. Existing sync path is unaffected.

#### T1.1: Workflow step unit tests
**File:** `agents-api/src/__tests__/run/workflow/agentExecution.test.ts`
**Pattern:** Hoisted mocks (same as `runDatasetItem.test.ts`), test each step in isolation

```
describe('loadAgentConfigStep')
  ✓ loads agent config from manage DB, returns serializable TaskHandlerConfig
  ✓ resolves model provider config (not credentials — those stay in-step)
  ✓ throws on missing agent (agent not found)
  ✓ throws on missing project (project not found)
  ✓ returns executionMode from agent config

describe('loadConversationHistoryStep')
  ✓ is a top-level named export with 'use step' (build-time discoverable)
  ✓ loads conversation history from runtime DB for given conversationId
  ✓ applies compression according to compressionConfig
  ✓ returns serializable array of message objects (no class instances)
  ✓ returns empty array for new conversation (no prior messages)
  ✓ returns messages from ALL agents in a transfer chain (loads full history)
  ✓ all step arguments are serializable primitives or plain objects
  ✓ does NOT receive dbClient as argument (resolves inside step via module-scope import)
  ✓ mirrors sync path getConversationHistoryWithCompression() output format

describe('runAgentTurnStep')
  ✓ creates DurableAgent with correct model config
  ✓ creates DurableAgent with correct tool definitions
  ✓ creates DurableAgent with correct system prompt
  ✓ calls loadConversationHistoryStep BEFORE durableAgent.stream()
  ✓ passes loaded conversation history (not params.messages) to durableAgent.stream()
  ✓ passes prepareStep callback that does IN-MEMORY compression only (no DB calls)
  ✓ prepareStep receives pre-loaded conversation history, not raw DB access
  ✓ passes stopWhen callback for transfer detection
  ✓ passes maxSteps from agent config
  ✓ pipes UIMessageChunks to writable stream
  ✓ returns {type: 'complete'} when agent finishes normally
  ✓ returns {type: 'transfer', targetSubAgentId} when stopWhen detects transfer
  ✓ handles agent error — writes error chunk to writable, returns {type: 'error'}

describe('executeToolStep — static dispatcher')
  ✓ is a top-level named export with 'use step' (build-time discoverable)
  ✓ dispatches to correct tool by toolId
  ✓ passes input and context to tool.execute()
  ✓ all step arguments are serializable primitives or plain objects (no functions, no class instances)
  ✓ does NOT receive toolRegistry, dbClient, or any service instance as argument
  ✓ uses module-scope imports to reconstruct capabilities inside the step
  ✓ credential resolution happens inside the step function (not as param)
  ✓ MCP tool: re-establishes connection within step scope
  ✓ function tool: executes sandbox within step scope
  ✓ tool execution error is caught and returned as tool error result (not thrown)
  ✓ preserves tool name, description, parameters schema in tool registry

describe('buildDurableToolSet — tool config mapping')
  ✓ maps each tool config to call executeToolStep with correct toolId
  ✓ preserves tool metadata (name, description, inputSchema)
  ✓ does NOT use 'use step' in dynamic function (compile-time constraint)

describe('persistAgentMessage step')
  ✓ is a top-level named export with 'use step' (build-time discoverable)
  ✓ persists agent response message to runtime DB
  ✓ creates message with correct conversationId, role, content
  ✓ handles write failure gracefully (logs error, does not crash workflow)
```

#### T1.2: DurableAgent bridge unit tests
**File:** `agents-api/src/__tests__/run/workflow/durableAgentBridge.test.ts`
**Pattern:** Mock DurableAgent, verify our bridge maps config correctly

```
describe('createModelProvider bridge')
  ✓ maps base model config to AI SDK model provider
  ✓ maps structuredOutput model config when present
  ✓ passes model settings (temperature, maxTokens, etc.)

describe('prepareStep bridge — I/O purity')
  ✓ calls in-memory compression logic with pre-loaded messages (not DB)
  ✓ returns compressed messages in AI SDK format
  ✓ handles empty message history (no compression needed)
  ✓ does NOT make any DB calls (mock DB layer, assert zero calls)
  ✓ receives pre-loaded conversation history from loadConversationHistoryStep
  ✓ operates purely on in-memory message arrays (no side effects)

describe('stopWhen bridge')
  ✓ detects transfer_to_agent tool call → returns stop signal
  ✓ detects step limit reached → returns stop signal
  ✓ returns continue signal for normal tool calls
  ✓ returns continue signal when under step limit

describe('onStepFinish bridge')
  ✓ records step timing to telemetry
  ✓ records step type (llm_call, tool_execution)
  ✓ records token usage from step result
```

#### T1.3: Route handler tests
**File:** `agents-api/src/__tests__/run/routes/executions.test.ts`
**Pattern:** Mock workflow `start()` and `getRun()`, test HTTP layer

```
describe('POST /run/v1/executions')
  ✓ returns 200 with content-type text/event-stream
  ✓ returns x-workflow-run-id header (using run.runId)
  ✓ starts agentExecutionWorkflow with correct payload
  ✓ creates conversation record BEFORE starting workflow
  ✓ persists user message BEFORE starting workflow
  ✓ generates conversationId when not provided
  ✓ uses provided conversationId when given (continue existing conversation)
  ✓ returns 400 when agentId is missing
  ✓ returns 400 when messages array is empty
  ✓ returns 400 when messages format is invalid
  ✓ returns 400 when agent executionMode is not 'durable'
  ✓ returns 401 when auth is missing/invalid
  ✓ returns 404 when agent not found
  ✓ passes requestContext when provided
  ✓ returns 409 when durable execution already active on conversation (concurrency guard)
  ✓ 409 response includes activeExecutionId for client diagnostics
  ✓ allows new execution after previous completes (concurrency guard clears)
  ✓ creates workflow_executions record BEFORE calling start() (Insert-Before-Start)
  ✓ workflow_executions record has runId=null before start() returns
  ✓ workflow_executions record updated with runId after start() returns

describe('GET /run/v1/executions/:executionId/stream')
  ✓ returns 200 with streaming response when execution is running
  ✓ returns stream starting from startIndex query param
  ✓ returns 204 when execution is completed and no stream available
  ✓ returns 404 when executionId not found
  ✓ returns 401 when auth is missing/invalid
  ✓ defaults startIndex to 0 when not provided
  ✓ SECURITY: returns 404 when runId exists but belongs to different tenant
  ✓ SECURITY: returns 404 when runId exists but belongs to different project

describe('GET /run/v1/executions/:executionId/status')
  ✓ returns 200 with execution status object
  ✓ returns status: 'pending' for newly started execution
  ✓ returns status: 'running' for in-progress execution
  ✓ returns status: 'running' for execution awaiting HITL approval (no 'suspended' status exists)
  ✓ returns status: 'completed' for finished execution
  ✓ returns status: 'failed' for errored execution
  ✓ returns status: 'cancelled' for cancelled execution
  ✓ returns 404 when executionId not found
  ✓ returns 401 when auth is missing/invalid
  ✓ includes stepCount and agentId in response
  ✓ SECURITY: returns 404 when runId exists but belongs to different tenant
```

#### T1.4: Credential safety test
**File:** Part of `agentExecution.test.ts`
**Pattern:** Verify step params don't contain secrets

```
describe('credential safety')
  ✓ step params for loadAgentConfigStep do NOT contain API keys
  ✓ step params for runAgentTurnStep do NOT contain credentials
  ✓ tool step params do NOT contain MCP server auth tokens
  ✓ credential resolution is called INSIDE step function scope
```

This is a critical security test. The WDK event log persists all step input/output. If credentials are passed as step parameters, they'd be stored in the event log in plaintext.

**How to test:** Mock the step registration mechanism. Capture the arguments passed to `'use step'` functions. Assert none of the captured params match known credential patterns (API keys, tokens, secrets).

#### T1.5: Sync path regression tests
**File:** Extend existing `agents-api/src/__tests__/run/routes/chat.test.ts`
**Pattern:** Same as existing chat tests — verify nothing changed

```
describe('sync path regression — POST /run/api/completions')
  ✓ all existing tests still pass (no behavioral changes)
  ✓ does NOT invoke agentExecutionWorkflow for agents without executionMode: 'durable'
  ✓ does NOT return x-workflow-run-id header

describe('sync path regression — POST /run/api/chat')
  ✓ all existing tests still pass (no behavioral changes)
  ✓ does NOT invoke agentExecutionWorkflow for agents without executionMode: 'durable'
```

#### T1.6: Stream content verification (integration)
**File:** `agents-api/src/__tests__/run/workflow/agentExecutionIntegration.test.ts`
**Pattern:** Higher-level test with real-ish workflow simulation. Mock the LLM provider but let the workflow + DurableAgent + streaming pipeline run end-to-end.

```
describe('durable execution stream content')
  ✓ streams text-delta chunks in correct order
  ✓ streams tool-input-start → tool-input-delta → tool-input-available sequence
  ✓ streams tool-output-available after tool execution completes
  ✓ streams start-step / finish-step boundaries
  ✓ stream ends with finish chunk
  ✓ all chunks have monotonically increasing indices (for reconnection)

describe('reconnection content continuity')
  ✓ stream from startIndex=0 contains all chunks
  ✓ stream from startIndex=N skips first N chunks
  ✓ stream from startIndex=N contains no duplicates with stream from 0..N-1
  ✓ reconnecting after stream completes returns 204
```

This is the most important test in Phase 1. It verifies that the entire pipeline — from workflow start through DurableAgent through UIMessageChunk streaming through reconnection — produces correct, ordered, non-duplicated output.

#### T1.7: Error path tests
**File:** Part of `agentExecution.test.ts` and `executions.test.ts`

```
describe('error paths')
  ✓ LLM provider error → error chunk in stream + execution status: 'failed'
  ✓ tool execution error → error returned to agent as tool result (agent decides next action)
  ✓ tool execution timeout → timeout error as tool result
  ✓ MCP connection failure → error as tool result
  ✓ workflow-level exception → execution status: 'failed', stream closed with error
  ✓ invalid startIndex on reconnection → 400 or empty stream (not crash)
  ✓ concurrent reconnection attempts → both get valid streams (not race condition)
  ✓ defensive error chunk: error written to stream before re-throw (runAgentTurn error handling)
  ✓ FatalError: side-effecting failure prevents WDK retry
  ✓ transient error: WDK retries step (not surfaced as permanent failure)
```

#### T1.7b: Message idempotency tests
**File:** Part of `agentExecution.test.ts`
**Pattern:** Verify duplicate message prevention on step retry

```
describe('message write idempotency')
  ✓ persistAgentMessage passes deterministic idempotencyKey ({runId}_{stepName}_{role})
  ✓ duplicate idempotencyKey returns existing message (no duplicate insert)
  ✓ null idempotencyKey allows insert (sync path compatibility)
  ✓ different idempotencyKeys create separate messages (no false dedup)
```

#### T1.7c: DurableAgent error surface empirical validation (U1-U6)
**File:** `agents-api/src/__tests__/run/workflow/durableAgentErrorSurface.test.ts`
**Pattern:** Real DurableAgent with mock model/tools — validate actual error behavior

```
describe('U1: DurableAgent error chunk on model failure')
  ✓ failing model.doStream() → check if error UIMessageChunk appears in writable stream
  ✓ document: DurableAgent does / does not write error chunk on model failure

describe('U2: DurableAgent error chunk on tool failure')
  ✓ failing tool.execute() → check if error UIMessageChunk appears in writable stream
  ✓ document: DurableAgent does / does not write error chunk on tool failure

describe('U3: writable stream state after DurableAgent throws')
  ✓ catch DurableAgent error → attempt writer.write() → check if write succeeds
  ✓ document: writable stream is / is not usable after DurableAgent throws

describe('U4: DurableAgent error type classification')
  ✓ network error → observe throw behavior
  ✓ timeout error → observe throw behavior
  ✓ auth error → observe throw behavior
  ✓ document: which errors DurableAgent throws vs swallows

describe('U5: WDK step retry + DurableAgent interaction')
  ✓ step failure mid-agent-turn → observe retry behavior (no double LLM calls)

describe('U6: run.status after DurableAgent error')
  ✓ DurableAgent failure → check run.status reflects 'failed' (not 'running')
```

#### T1.7d: Execution status lifecycle tests
**File:** Part of `agentExecution.test.ts` and `executions.test.ts`
**Pattern:** Verify status transitions and concurrency guard self-healing

```
describe('execution status lifecycle — primary mechanism')
  ✓ successful workflow → persistExecutionStatusStep('completed') called as final step
  ✓ failed workflow → persistExecutionStatusStep('failed') called in catch block
  ✓ workflow_executions.status transitions: starting → running → completed
  ✓ workflow_executions.status transitions: starting → running → failed (on error)
  ✓ writable stream closed in finally block (both success and error paths)

describe('concurrency guard — double-read safety net')
  ✓ our table says 'running', WDK says 'completed' → lazily updates table, allows new request
  ✓ our table says 'running', WDK says 'failed' → lazily updates table, allows new request
  ✓ our table says 'running', WDK says 'running' → returns 409
  ✓ our table says 'starting', runId null, age < 60s → returns 409
  ✓ our table says 'starting', runId null, age > 60s → marks as failed, allows new request
  ✓ WDK query fails → falls back to our table's status, returns 409 (fail closed)
  ✓ no active execution in table → allows new request (no WDK query needed)

describe('execution status — ExecutionWorkflowPayload')
  ✓ payload includes executionId (our workflow_executions.id)
  ✓ executionId passed through to persistExecutionStatusStep
```

#### T1.8: Timeout resolution tests
**File:** Part of `agentExecution.test.ts` and `durableAgentBridge.test.ts`
**Pattern:** Unit tests for branched timeout logic + integration test for long-running tool

```
describe('timeout resolution — execution-mode branching')
  ✓ getToolTimeout('mcp', 'durable') returns DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS
  ✓ getToolTimeout('function', 'durable') returns DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS
  ✓ getToolTimeout('mcp', null) returns MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT (60s)
  ✓ getToolTimeout('function', null) returns FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT (30s)
  ✓ getToolTimeout('mcp', 'classic') returns sync default (not durable)
  ✓ durable tool timeout is capped by DURABLE_TOOL_TIMEOUT_MAX_MS (env ceiling)
  ✓ env var override: AGENTS_DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS overrides default
  ✓ env var override: AGENTS_DURABLE_TOOL_TIMEOUT_MAX_MS overrides ceiling

describe('LLM timeout — durable model provider')
  ✓ createModelProvider with executionMode='durable' uses DURABLE_LLM_GENERATION_MAX_TIMEOUT_MS
  ✓ createModelProvider with executionMode=null uses LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS (10 min)
  ✓ durable LLM timeout is respected by AbortSignal (mock clock advancement)

describe('pg-boss step expiration — integration')
  ✓ tool step running 20+ minutes is NOT expired by pg-boss (validates hybrid architecture)
```

---

### Phase 2 tests: Transfer orchestration + HITL + A2A discovery

**Confidence goal:** Multi-agent chains work durably. Tool approvals survive process boundaries. Durable agents discoverable via agent card.

#### T2.1: Transfer loop tests
**File:** `agents-api/src/__tests__/run/workflow/agentExecution.test.ts` (extended)

```
describe('transfer orchestration')
  ✓ single transfer: agent A detects transfer → agent B runs → completes
  ✓ chain transfer: A → B → C completes successfully
  ✓ transfer limit: stops after MAX_TRANSFERS iterations
  ✓ transfer preserves conversation context — Agent B loads Agent A's messages from DB (not params)
  ✓ continuation prompt is appended to user message on transfer (matches sync path pattern)
  ✓ transfer loads new agent config for each agent in chain
  ✓ stream contains chunks from ALL agents in chain (not just last)
  ✓ each agent turn has its own start-step/finish-step boundaries in stream

describe('durable delegation (step-poll)')
  ✓ delegation tool inside workflow starts child workflow via step-poll pattern
  ✓ step-poll blocks until child workflow completes (simulated 10+ min)
  ✓ step-poll survives simulated restart (pg-boss re-enqueues step, re-polls child)
  ✓ delegation result is returned to parent agent as tool result
  ✓ delegation to external agent uses raised timeout (Task 1.10 ceiling)

describe('transfer stream lifecycle')
  ✓ writable stream stays open between agent turns (preventClose: true verified)
  ✓ writable stream is closed after last agent turn completes
  ✓ single start chunk at beginning of stream, single finish chunk at end
  ✓ no duplicate start/finish chunks between agent turns

describe('transfer error handling')
  ✓ transfer to non-existent agent → error in stream
  ✓ second agent in chain fails → error chunk, execution status: 'failed'
  ✓ transfer loop does not leak resources (each agent turn cleaned up)
  ✓ delegation child workflow fails → error returned as tool result to parent
```

#### T2.2: HITL tool approval tests
**File:** `agents-api/src/__tests__/run/workflow/toolApproval.test.ts`

```
describe('durable tool approval')
  ✓ tool requiring approval → workflow stays 'running', emits approval-required event in stream
  ✓ approval-required event includes tool name, input preview, and approval token
  ✓ POST /executions/{id}/approve/{token} with approved=true → workflow resumes
  ✓ POST /executions/{id}/approve/{token} with approved=false → workflow continues with rejection
  ✓ approval with invalid token → 404
  ✓ GET /executions/{id}/status during approval wait → status: 'running' (NOT 'suspended' — no such status)
  ✓ approval on completed execution → 410 (gone)
  ✓ stream resumes after approval — reconnection picks up from suspension point
  ✓ multiple tools requiring approval in sequence — each gets its own suspension

describe('approval durability')
  ✓ approval token survives simulated restart (stored in WDK event log, not memory)
  ✓ ToolApprovalUiBus NOT used for durable path (verify mock not called)
```

#### T2.3: Agent card extension tests
**File:** `agents-api/src/__tests__/run/data/agentCard.test.ts`

```
describe('agent card durable execution extension')
  ✓ createAgentCard() includes extensions array when executionMode='durable'
  ✓ durable extension has correct URI ('urn:inkeep:ext:durable-execution/v1')
  ✓ durable extension params include executionsEndpoint and supportsReconnection
  ✓ createAgentCard() does NOT include extensions when executionMode is null/classic
  ✓ A2A-Extensions header in request → echoed in response for supported extensions
  ✓ A2A-Extensions header with unsupported extension → not echoed
  ✓ extensions field is compatible with A2A AgentCard spec (correct shape)
```

---

### Phase 3 tests: Format bridge + SDK

**Confidence goal:** OpenAI-format clients can consume durable executions. SDK methods work end-to-end.

#### T3.1: UIMessageChunk → OpenAI SSE adapter tests
**File:** `agents-api/src/__tests__/run/utils/uiMessageChunkAdapter.test.ts`

```
describe('UIMessageChunk → OpenAI SSE adapter')
  ✓ text-delta → choices[0].delta.content
  ✓ tool-input-start → choices[0].delta.tool_calls[0].function.name
  ✓ tool-input-delta → choices[0].delta.tool_calls[0].function.arguments (appended)
  ✓ tool-output-available → separate chunk with tool output
  ✓ finish → choices[0].finish_reason: 'stop'
  ✓ error → SSE error event (not crash)
  ✓ start-step / finish-step → dropped (no OpenAI equivalent)
  ✓ output is valid JSON per OpenAI chat.completion.chunk spec
  ✓ output includes model field and id field
  ✓ multiple text-delta chunks produce multiple SSE events (1:1 mapping)

describe('format=openai on reconnection endpoint')
  ✓ GET /executions/{id}/stream?format=openai returns text/event-stream with SSE format
  ✓ GET /executions/{id}/stream (no format param) returns UIMessageChunk format (default)
```

#### T3.2: SDK ExecutionsClient tests
**File:** `packages/agents-sdk/src/__tests__/executionsClient.test.ts`

```
describe('ExecutionsClient')
  ✓ create() sends POST /run/v1/executions with correct body
  ✓ create() returns executionId from x-workflow-run-id header
  ✓ create() returns ReadableStream body
  ✓ stream() sends GET /run/v1/executions/{id}/stream
  ✓ stream() passes startIndex query param
  ✓ stream() returns ReadableStream or null (204)
  ✓ status() sends GET /run/v1/executions/{id}/status
  ✓ status() returns parsed ExecutionStatus object
  ✓ cancel() sends POST /run/v1/executions/{id}/cancel
  ✓ handles 401 → throws auth error
  ✓ handles 404 → throws not found error
  ✓ handles network error → throws connection error
```

---

### Phase 4 tests: Optimization + hardening

**Confidence goal:** Performance is acceptable. Edge cases are handled.

#### T4.1: Performance benchmarks (not unit tests — manual or CI benchmark suite)

```
benchmark('step overhead')
  measure: durable path e2e latency for 1-step agent (single LLM call, no tools)
  measure: durable path e2e latency for 5-step agent (LLM + 4 fast tool calls)
  measure: sync path e2e latency for equivalent operations
  compare: overhead delta per step
  threshold: < 3s overhead per step vs sync

benchmark('reconnection latency')
  measure: time from GET /stream?startIndex=N to first chunk received
  threshold: < 500ms

benchmark('concurrent executions')
  measure: 10 concurrent durable executions, track step timing variance
  threshold: no significant degradation vs sequential
```

#### T4.2: Edge case tests

```
describe('edge cases')
  ✓ very large messages array (100+ messages) → workflow handles correctly
  ✓ very large tool output (> 1MB) → step stores and replays correctly
  ✓ rapid sequential tool calls (10 tools, each < 100ms) → all complete, no race conditions
  ✓ client disconnects during POST → workflow continues in background
  ✓ client never reconnects → workflow completes, event log retained per TTL
  ✓ same client reconnects multiple times → all connections get valid streams
  ✓ startIndex > total chunks → empty stream (not error)
  ✓ execution with 0 tool calls → completes normally (text-only response)
```

---

### Cross-phase: Regression safety net

Every phase adds tests, but we also need to ensure no regressions across the entire system:

```
regression suite (run in CI on every PR)
  ✓ all existing workflow tests (evaluateConversation, runDatasetItem) pass
  ✓ all existing chat route tests (chat.test.ts, chatDataStream) pass
  ✓ all existing stream-helpers tests pass
  ✓ all existing manage CRUD tests pass (including new executionMode field)
  ✓ pnpm build succeeds (workflow bundles generated)
  ✓ pnpm typecheck succeeds
  ✓ pnpm lint succeeds
```

---

### Test count summary

| Phase | Unit tests | Integration tests | Regression | Total |
|---|---|---|---|---|
| Phase 0 | ~10 (schema + workflow_executions validation) | ~8 (CRUD round-trip + import smoke) | ~2 (existing workflow suites) | **~20** |
| Phase 1 | ~106 (steps incl. loadConversationHistory + prepareStep purity, bridge, routes, credential safety, errors, serialization, timeout resolution branching, concurrency guard + double-read safety net, Insert-Before-Start, idempotency, U1-U6 empirical validation, status lifecycle, data-operation metadata parity) | ~17 (stream content, reconnection, tenant isolation, sync regression, 30-min tool call, pg-boss expiration) | ~4 (existing chat + stream tests) | **~127** |
| Phase 2 | ~32 (transfer loop, durable delegation, approval flow, cancellation, stream lifecycle, agent card extension) | ~9 (chain completion, delegation durability, approval durability, message accumulation, retention cron) | — | **~41** |
| Phase 3 | ~15 (adapter mapping, SDK client) | ~3 (format=openai e2e) | — | **~18** |
| Phase 4 | ~8 (edge cases) | benchmarks (separate suite) | — | **~8+** |
| **Total** | **~171** | **~37** | **~6** | **~214** |

## 15) Risks & mitigations


| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| ~2s per step overhead makes simple chats noticeably slower | Medium | Medium | Two-tier routing (D1): sync for fast, durable for long. Fast path unchanged. | TBD |
| UIMessageChunk → OpenAI SSE conversion loses step boundary info | Low | Medium | Step boundaries are metadata enrichment, not data loss. Clients needing boundaries use native format. | TBD |
| `@workflow/ai` breaking changes (labeled "experimental") | Medium | Medium | Pin exact version. DurableAgent API (constructor + stream) is stable. Monitor changelogs. | TBD |
| Credentials leak into WDK event log | Medium | High | Credential resolution inside steps, not passed as step params. Verify in Phase 1 testing. | TBD |
| Step overhead accumulates: agent with 5 tool calls = ~10s overhead | Medium | Medium | Phase 4: batch fast tool calls within single step. Most value comes from long-running tools where overhead is negligible. | TBD |
| Workflow `package.json` version mismatch (^4.1.0-beta.54 declared, 4.0.1-beta.33 installed) | High | Low | Phase 0: run `pnpm install` to resolve stale lockfile. Latest available is 4.1.0-beta.56. | TBD |
| Step ID fragility during code deploys (Inngest critique) | Low | Medium | Agent workflows are minutes-long (not days). Drain in-progress workflows before deploy. Phase 4: explicit step IDs if needed. | TBD |
| Cross-tenant data leak on reconnection | High (if unfixed) | Critical | `getRun(runId)` has no tenant awareness. MITIGATED by `workflow_executions` mapping table + ownership check on every GET endpoint. This is Phase 1 scope. | TBD |
| Tool re-execution on partial step failure | Low | Medium | If crash occurs after tool executes but before event log write, tool re-executes. Mitigate: side-effecting tools should be idempotent. Document in tool authoring guidelines. | TBD |
| Tool streaming parity (`data-operation` metadata) | Low | Low | **Resolved (D11).** Original concern about mid-tool progress regression was unfounded — neither path provides mid-execution progress. Both emit lifecycle events only. Only gap: `data-operation` metadata from `agentSessionManager` used by manage-ui for tool call rendering. Task 1.13 addresses this. | TBD |
| Concurrent messages to same conversation during execution | Medium | Medium | **MITIGATED (Phase 1):** Server-side concurrency guard on `POST /run/v1/executions` rejects with 409 if durable workflow is already active. Widget disables input during streaming. API consumers get clear 409 with active execution ID. Durable path only — sync path unchanged. | TBD |
| `prepareStep` I/O breaks WDK determinism silently | Medium | High | `prepareStep` runs outside `'use step'` but inside the workflow VM. The VM does NOT block Postgres at JS level, so DB calls would appear to work — but on replay they re-execute and may return different results, causing subtle non-determinism. MITIGATED by: (a) `loadConversationHistoryStep` loads history before `durableAgent.stream()`, (b) `prepareStep` is pure in-memory, (c) code review checklist for WDK callbacks. | TBD |
| pg-boss step expiration kills long-running tool calls | Low-Medium | High | pg-boss default `expire_seconds` is 15 minutes. If a single durable step (tool call) exceeds this, pg-boss may mark the job as expired. **Likely not an issue** because Postgres World uses a hybrid architecture: pg-boss dequeues quickly, local world handles actual execution. **Phase 1 Task 1.10** verifies this with a 20+ minute tool call test. | TBD |
| DurableAgent inherits our 10-min LLM timeout cap | High | Medium | DurableAgent `.stream()` does not accept timeout/abortSignal. It inherits from our model provider, which caps at `LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS` (10 min) via `AbortSignal.timeout()`. **Phase 1 Task 1.10** branches `createModelProvider` to use `DURABLE_LLM_GENERATION_MAX_TIMEOUT_MS` (60 min) when `executionMode === 'durable'`. | TBD |
| Step-poll delegation blocks pg-boss worker slot | Medium | Medium | Phase 2 durable delegation (D5) uses step-poll pattern where `'use step'` blocks awaiting `run.returnValue` (polls every 1s). For long delegations (10+ min), this ties up a pg-boss worker slot. With default `WORKFLOW_POSTGRES_WORKER_CONCURRENCY: 10`, 10 concurrent long delegations could exhaust the pool. **Mitigated:** (a) Worker concurrency is env-configurable, (b) Phase 4 Task 4.6 optimizes to hook-based zero-resource wait if exhaustion observed. | TBD |
| A2A server stubs block async pattern | High | Medium | 6 critical A2A server handlers are stubs: `tasks/get` (hardcoded "completed"), `tasks/cancel` (noop), `tasks/resubscribe` (mock), no push notification support, no task persistence, `message/send` is synchronous. External A2A callers cannot use async patterns until these are replaced. **Mitigated:** Phase 2 Task 2.4 adds agent card extension so callers can discover durability and route to `/executions` API directly. Phase 4+ Task 4.7 replaces stubs with real implementations. | TBD |
| DB writes inside `executeToolStep` are not idempotent on step retry | Medium | Medium | Any tool that writes to the DB inside `executeToolStep` (which is a `'use step'`) may create duplicate records on step retry. Delegation tools have two DB writes: `createMessage()` (request record) and `saveA2AMessageResponse()` (response record), each using `generateId()` which generates a new ID on each invocation. If the step crashes after the DB write but before the event log records the step result, pg-boss re-enqueues the step and the entire tool re-executes, creating duplicate messages. This affects ALL tools that write to DB inside steps, not just delegation. **Mitigated:** (a) Accept at-least-once semantics for message/artifact persistence — the runtime DB already tolerates duplicate messages (they're additive, not overwriting), (b) Phase 4: add idempotency keys derived from `(stepId, toolCallId)` to DB writes for strict dedup, (c) Mark delegation DB writes as non-critical — the A2A response itself is the source of truth, not the persisted record. | TBD |
| Step-poll `start()` may create duplicate child workflows on step retry | Medium | Medium | When a `'use step'` function calls `start(childWorkflow)` and the step crashes after the child starts but before the step result is recorded, the retried step calls `start()` again — potentially creating a second child workflow while the first is still running. **Mitigated:** (a) Use a deterministic run ID derived from `(parentRunId, stepId, delegationParams)` — if the child with that ID already exists, `start()` returns the existing run, (b) Ensure child workflows are idempotent (same input → same output even if run twice), (c) The second child's result overwrites the first in the delegation tool's return value — no data corruption, just wasted compute. **Phase 2 implementation must verify** WDK's `start()` dedup behavior with deterministic run IDs. | TBD |

## 16) Appendices (documented deferrals)

### Deferred: Multi-instance horizontal scaling
- **What we learned:** Process-local state (StreamHelper registry, sandbox pools) constrains to single instance. WDK Postgres World supports distributed workers.
- **Why deferred:** Durability doesn't require multi-instance. Single long-running process with Postgres World handles the use case. DurableAgent + Postgres World streaming already decouples execution from HTTP connection.
- **Trigger to revisit:** When request volume exceeds single-instance capacity
- **Implementation sketch:** Externalize StreamHelper registry to Redis; use WDK's distributed step execution; sandbox pools become per-step (establish + teardown)

### Deferred: `generateText` (non-streaming) on durable path
- **What we learned:** DurableAgent only implements `stream()`, not `generate()`. Our Agent.ts supports both via `streamText()` and `generateText()`.
- **Why deferred:** Most agent interactions use streaming. Non-streaming is used for internal operations (evals, some delegations) which already have their own workflow patterns.
- **Trigger to revisit:** If a use case requires durable non-streaming agent execution
- **Implementation sketch:** Either call `durableAgent.stream()` and discard the stream (consume to completion), or contribute `generate()` to @workflow/ai

### Appendix: Timeout strategy for durable execution (analysis backing Task 1.10)

- **What we learned:** Full trace of the execution path identified **97 constraints across 21 layers**. The critical ones for durable execution are:

  **Layer-by-layer timeout chain (current sync path):**
  | Layer | Constraint | Current value | How enforced |
  |---|---|---|---|
  | HTTP server | `requestTimeout` | 120s (2 min) | `factory.ts` / `index.ts` — Node HTTP server level |
  | SSE stream | `STREAM_MAX_LIFETIME_MS` | 600s (10 min) | `stream-helpers.ts:422` — VercelDataStreamHelper kills stream |
  | LLM generation | `LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS` | 600s (10 min) | `Agent.ts:3208,3547` — `AbortSignal.timeout()` on `streamText()` |
  | MCP tool call | MCP SDK `DEFAULT_REQUEST_TIMEOUT_MSEC` | 60s | `mcp-client.ts:71` — MCP SDK default, `SharedServerConfig.timeout` exists but never populated |
  | Function tool | `FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT` | 30s | `NativeSandboxExecutor.ts:461` — sandbox process SIGTERM |
  | Tool approval | `APPROVAL_TIMEOUT_MS` | 600s (10 min) | `PendingToolApprovalManager.ts:9` — **hardcoded, not env-overridable** |
  | pg-boss job | `expire_seconds` (pg-boss default) | 900s (15 min) | pg-boss `plans.js` — job considered expired if still active |
  | Worker concurrency | `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` | 10 | `world.ts:38` — max concurrent workflow executions per process |
  | DB pool | `connectionTimeoutMillis` | 10s | `manage-client.ts:39`, `runtime-client.ts:46` — pool acquisition timeout |
  | DB pool size | `POSTGRES_POOL_SIZE` | 100 | `manage-client.ts:36` — max connections per pool |

  **Which constraints affect the durable path and which don't:**
  | Constraint | Affects durable path? | Why |
  |---|---|---|
  | `requestTimeout` (120s) | **No** | Durable POST starts streaming immediately via `run.readable`. Client reconnects via GET. |
  | `STREAM_MAX_LIFETIME_MS` (10 min) | **No** | Durable path uses WDK `getWritable()`/`getReadable()`, NOT VercelDataStreamHelper. |
  | `LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS` (10 min) | **Yes — critical** | DurableAgent does NOT accept timeout/abortSignal on `.stream()`. It inherits from our model provider. Our `createModelProvider` applies `AbortSignal.timeout()` capped at 10 min. DurableAgent's `doStreamStep` inherits this cap. |
  | MCP SDK timeout (60s) | **Yes — critical** | A 10-minute MCP tool call (the core use case) is killed at 60s. |
  | Function tool timeout (30s) | **Yes — critical** | Same — long-running sandbox execution is killed at 30s. |
  | `APPROVAL_TIMEOUT_MS` (10 min) | **No** | Durable HITL uses WDK `defineHook()` (Phase 2), not PendingToolApprovalManager. |
  | pg-boss `expire_seconds` (15 min) | **Needs verification** | Postgres World uses hybrid architecture — pg-boss dequeues and re-queues into local world. The pg-boss job likely completes quickly (dequeue), and the local world handles long-running execution. But this MUST be verified in Phase 1 — if a single step exceeds 15 min, pg-boss may expire it. |
  | Worker concurrency (10) | **Yes — scaling concern** | 10 concurrent durable workflows per process. Fine for initial launch, needs tuning at scale. |
  | DB pool (100 / 10s) | **Yes — scaling concern** | Each durable step makes DB calls. More concurrent workflows = more pool pressure. |

  **Key finding: DurableAgent inherits our model timeout.** DurableAgent's `.stream()` does NOT accept a timeout parameter. The timeout comes from the model provider we construct. Our `createModelProvider()` calls `AbortSignal.timeout(Math.min(configured, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS))` — capping at 10 minutes. For durable execution, we need to pass a higher/no timeout when creating the model provider.

  **Key finding: No per-tool timeout exists in the schema today.** Function tool timeout comes from the agent's `sandboxConfig` (agent-level). MCP tool timeout uses the MCP SDK global default. The `SharedServerConfig.timeout` field exists in the type but is never populated.

- **Recommended approach (config vs env vars — layered model):**

  **Option D (recommended): Execution-mode-aware timeout resolution, no new schema fields.**

  When `executionMode: 'durable'`, the existing timeout resolution code branches to use higher defaults. No new config fields needed — the `executionMode` flag IS the signal.

  ```
  Precedence: env var ceiling → durable defaults (if executionMode='durable') → sync defaults
  ```

  New constants in `execution-limits/defaults.ts`:
  ```typescript
  // Durable execution timeout defaults (all env-overridable via AGENTS_ prefix)
  DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS: 1_800_000,        // 30 min (vs 60s sync)
  DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS: 600_000,    // 10 min (vs 30s sync)
  DURABLE_LLM_GENERATION_MAX_TIMEOUT_MS: 3_600_000,       // 60 min (vs 10 min sync)
  DURABLE_TOOL_TIMEOUT_MAX_MS: 7_200_000,                 // 2 hour ceiling (safety limit)
  ```

  Resolution logic (inside `executeToolStep` or model provider):
  ```typescript
  function getToolTimeout(toolType: 'mcp' | 'function', executionMode: string | null): number {
    if (executionMode === 'durable') {
      const timeout = toolType === 'mcp'
        ? DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS
        : DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS;
      return Math.min(timeout, DURABLE_TOOL_TIMEOUT_MAX_MS); // env var ceiling
    }
    return toolType === 'mcp'
      ? MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT
      : FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT;
  }
  ```

  **Why this approach:**
  1. No schema changes, no new UI elements, no SDK changes beyond Phase 0's `executionMode`.
  2. The agent builder already opted into durable mode — that IS the signal that tools need more time.
  3. Env var ceiling lets operators control the max.
  4. Follows the existing `AGENTS_` prefix override convention.
  5. Reversible — can add per-tool config later if needed.

  **Why NOT per-tool config (yet):**
  - Requires schema migration, SDK tool builder changes, manage-ui tool editor changes.
  - We don't know if per-tool granularity matters — the core use case is "agent with long-running tools" (agent-level), not "this specific tool needs a different timeout."
  - Can always add per-tool config in Phase 3+ if real usage demands it.

- **Phase 1 status: IN SCOPE** — Task 1.10 implements execution-mode-aware defaults + env var ceiling. The durable timeout constants, branched timeout resolution, and pg-boss expiration verification are all Phase 1 deliverables.
- **Still deferred:** Per-tool timeout configuration (Phase 3+ — see below). Worker concurrency tuning (Phase 4).
- **Trigger to revisit deferred items:**
  - Per-tool timeout: when agent builders need different timeouts for different tools on the same durable agent.
  - Worker concurrency: when durable execution volume exceeds 10 concurrent workflows.

### Deferred: Per-tool timeout configuration
- **What we learned:** No per-tool timeout exists in the DB schema today. Function tools use agent-level `sandboxConfig.timeout` (30s default). MCP tools use the MCP SDK global default (60s). `SharedServerConfig.timeout` field exists in the type but is never populated.
- **Why deferred:** The layered timeout approach (execution-mode-aware defaults + env var ceiling) covers Phase 1 needs without schema changes. Per-tool granularity is premature — we don't know if it's needed yet.
- **Trigger to revisit:** When agent builders need different timeouts for different tools on the same durable agent (e.g., Claude Code at 1 hour + fast API lookup at 60s).
- **Implementation sketch:** Add `timeout?: number` to tool definition in manage schema (`tools` table `config` JSONB). Expose in SDK tool builder and manage-ui tool editor. Resolution: tool config > agent durable default > env var default > hardcoded default.

### Deferred: Full parallel tool execution
- **What we learned:** DurableAgent's `executeTool()` runs tools in parallel by default within a single step (AI SDK behavior). Making each parallel tool its own durable step requires wrapping.
- **Why deferred:** Parallel durability is Phase 4 optimization. Single-step parallel execution works for fast tools. Only long-running parallel tools need separate steps.
- **Trigger to revisit:** When parallelized team agents (each taking minutes) are a production use case
- **Implementation sketch:** Each tool execution gets `'use step'` wrapper; WDK handles concurrent step execution

### Appendix: Cross-industry validation

The proposed architecture aligns with industry patterns across major frameworks:

| Aspect | Our approach | OpenAI Responses API | Inngest | Temporal | LangGraph |
|---|---|---|---|---|---|
| Durability | WDK steps | Server-managed | Step-based suspend/resume | Workflow/Activity | Checkpoint per super-step |
| Streaming | getWritable() → Postgres | SSE + sequence_number | Separate Realtime pub/sub | Activity-level only | Multi-mode SSE |
| Reconnection | startIndex | starting_after + sequence_number | Durable state resume | Automatic replay | Last-Event-ID |
| HITL | defineHook() | requires_action state | Step suspension | Signal/Update handlers | interrupt() + Command |
| API | Hybrid sync + durable | Hybrid sync/async/reconnectable | Async event-driven | Async workflow-based | Hybrid sync + checkpoint |

Key validation: All frameworks decouple streaming from durable execution. OpenAI's hybrid API (sync + background + reconnectable) is the closest match to our proposed `/completions` + `/executions` approach.

Evidence: [cross-industry-durable-ai-patterns.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/cross-industry-durable-ai-patterns.md)

### Appendix: A2A dynamics analysis (backing D5/D6)

**Research conducted:** 5 parallel research agents investigating delegation timeouts, WDK async patterns, A2A protocol async lifecycle, delegation usage patterns, and A2A streaming implementation.

#### Current A2A architecture (3 patterns)

| Pattern | Flow | Duration | Durable path impact |
|---|---|---|---|
| **Internal transfer** | A→B→C via ExecutionHandler `while` loop, `getInProcessFetch()` | Each hop: seconds-minutes | Phase 2 Task 2.1: transfer loop inside workflow |
| **Internal/external delegation** | Tool call → `a2aClient.sendMessage()` (blocking) → result | Seconds-30min+ | Phase 1: raised timeout (Task 1.10). Phase 2: step-poll pattern (D5). |
| **A2A as callee** | External agent → `POST /a2a` → `handleMessageSend()` → `taskHandler()` | Depends on caller | Phase 1: unchanged (sync). Phase 2: agent card extension (D6). Phase 4+: real async. |

#### Delegation timeout stack (researched)

```
Caller workflow → executeToolStep('delegation') → a2aClient.sendMessage()
  └─ DELEGATION_TOOL_BACKOFF: initialInterval 500ms, maxInterval 60s, exponent 1.5, maxElapsedTime 20s
  └─ A2A_BACKOFF: initialInterval 500ms, maxInterval 60s, exponent 1.5, maxElapsedTime 30s
  └─ No per-delegation timeout on receiving agent
  └─ Receiving agent: LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS = 10 min cap
```

On durable path: delegation runs inside `executeToolStep()` → gets `DURABLE_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS` (10 min) or `DURABLE_MCP_TOOL_REQUEST_TIMEOUT_MS` (30 min). The delegation backoff constants should also be raised for durable mode.

#### WDK inter-workflow patterns (researched)

| Pattern | Works from | Resource usage | Complexity |
|---|---|---|---|
| **Step-poll** (`getRun().returnValue`) | `'use step'` | Blocks worker (polls every 1s) | Low |
| **Hook-based rendezvous** (`createHook()` + `resumeHook()`) | `'use workflow'` (workflow-level only) | Zero resources during wait | Medium-high |
| **Fire-and-forget** (`start()`, no wait) | `'use step'` | None (child is independent) | Low |

Key constraint: Hooks cannot be used inside `'use step'` functions. Steps run to completion atomically. For hook-based delegation, the delegation must be detected at the workflow orchestration level (not inside a tool step).

#### A2A server implementation gaps (researched)

| Method | Current state | Required for async A2A |
|---|---|---|
| `tasks/get` | **Stub** — returns hardcoded "completed" | Real task state lookup from DB |
| `tasks/cancel` | **Stub** — returns `{ success: true }` noop | Actually cancel the workflow |
| `tasks/resubscribe` | **Stub** — returns mock completed task | Reconnect to event stream |
| Push notifications | **Not implemented** (`pushNotifications: false` hardcoded) | Webhook registration + delivery |
| `message/send` | **Synchronous** — blocks on `taskHandler()` | Fire-and-forget + return `working` state |
| AgentCard `extensions` | **Not in type** | `AgentExtension` type + extension declaration |

These 6 gaps represent a large standalone project (Phase 4+ Task 4.7). Phase 2 adds only the AgentCard extension (Task 2.3) as a discovery mechanism.

### Appendix: Comprehensive side-effects audit (backing idempotency strategy)

**Research conducted:** 7 parallel research agents tracing ALL stateful operations across: Agent.ts, executionHandler.ts, generateTaskHandler.ts, A2A handlers, tool execution (MCP/sandbox/relation tools), conversation/message persistence, streaming/SSE infrastructure, and telemetry/tracing.

Evidence: [side-effects-comprehensive-audit.md](../../.claude/reports/durable-agent-runtime-wdk/evidence/side-effects-comprehensive-audit.md)

#### Side effects by severity on durable path

**CRITICAL — must address in spec:**

| Side effect | Call sites | Idempotent? | On step retry | Mitigation |
|---|---|---|---|---|
| `createMessage()` with `generateId()` | Agent.ts:674, executionHandler.ts:404/501, handlers.ts:254, relationTools.ts:420/447 | **NO** | Duplicate messages with new IDs | Phase 1-2: accept at-least-once. Phase 4: deterministic IDs from `hash(stepId + toolCallId + content)` |
| MCP/function tool re-execution | All tool call paths via `executeToolStep` | **Depends on tool** | External tools may double-action (send email twice, create ticket twice) | Document idempotency requirements in tool authoring guidelines. Consider `toolExecutionId` in MCP requests. |

**MEDIUM — noted in spec, acceptable for Phase 1-2:**

| Side effect | Idempotent? | On step retry | Mitigation |
|---|---|---|---|
| A2A `sendMessage()` | NO | Delegated agent runs again (full LLM + tools) | Phase 2: step-poll with deterministic child run ID |
| `createTask()` in handlers.ts | NO (`generateId()`) | New task per handler call | On durable path, tasks created by workflow, not A2A handler |
| Sandbox lifecycle (orphaned processes) | N/A | New sandbox from scratch | Host OS cleanup. ~500ms setup overhead acceptable |
| Telemetry span duplication | NO (new span IDs) | Sibling branches in trace tree | Phase 4: add `step.attempt` attribute for filtering |
| `delegationId` in relation tools | NO (regenerated) | Different IDs in trace for same logical delegation | Acceptable — observability only, not correctness |

**LOW — acceptable as-is (no action needed):**

| Side effect | Why acceptable |
|---|---|
| AgentSession events | Observability only. Not used on durable path. |
| ToolSession results | DurableAgent's event log replays completed step results. |
| Stream helper registry | Replaced by WDK `getWritable()`/`getReadable()`. |
| VercelDataStreamHelper buffers | Not used on durable path. |
| Status update timer | Not initialized on durable path. WDK event log replaces. |
| Context cache | Soft failure, regeneratable. |
| Artifact async processing | `upsertLedgerArtifact()` is idempotent. Retry may generate different name — acceptable. |
| W3C trace context propagation | Works correctly. Trace ID consistent, baggage inherited. |
| `flushBatchProcessor()` | Idempotent. Multiple flushes safe. |

#### Key architectural conclusions

1. **Database writes fall into 2 clear categories:**
   - **SAFE (upsert/update):** `setActiveAgentForConversation()`, `createOrGetConversation()`, `updateTask()`, `upsertLedgerArtifact()`, `addLedgerArtifacts()`, `setCacheEntry()` — all use upsert patterns or true updates
   - **UNSAFE (insert with `generateId()`):** `createMessage()` (6 call sites), `createTask()` in A2A handler — these create duplicates on retry

2. **Process-local state has clean separation on durable path:**
   - AgentSession, ToolSession, StreamHelper, PendingToolApprovalManager — all replaced or unused on durable path
   - No process-local state leaks into the durable execution correctness path

3. **Streaming infrastructure is fully replaced:**
   - SSEStreamHelper, VercelDataStreamHelper, BufferingStreamHelper — none used on durable path
   - WDK `getWritable()`/`getReadable()` with `startIndex`-based dedup replaces all streaming concerns

4. **Telemetry is operationally noisy but functionally safe:**
   - Duplicate spans on retry are confusing for debugging but don't affect correctness
   - `step.attempt` attribute (Phase 4) would resolve the debugging UX issue
