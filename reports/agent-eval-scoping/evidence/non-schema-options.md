# Evidence: Non-Schema Options Analysis

**Dimension:** Options 5-10 (runtime/behavioral approaches)
**Date:** 2026-03-11
**Sources:** chat-to-edit/agents/sub-agents/feedback-analyst.ts, chat-to-edit/agents/feedback-improver.ts, agents-manage-ui/src/lib/actions/feedback.ts, agents-manage-ui/src/components/feedback/feedback-table.tsx, packages/agents-core/src/db/manage/manage-schema.ts

---

## Key files referenced

- `chat-to-edit/agents/sub-agents/feedback-analyst.ts:52-59` — current "use all" selection logic
- `chat-to-edit/agents/feedback-improver.ts:8-17` — trigger input schema
- `agents-manage-ui/src/lib/actions/feedback.ts:68-162` — trigger invocation
- `agents-manage-ui/src/components/feedback/feedback-table.tsx:89-107` — UI trigger point
- `chat-to-edit/context-configs/builder.ts:4-14` — header schema with x-target-agent-id
- `packages/agents-core/src/db/manage/manage-schema.ts:84-106` — agents table

---

## Findings

### Finding: Option 5 (Interactive selection / ask user) — zero schema change, adds friction
**Confidence:** INFERRED

The Feedback Analyst could be modified to:
1. Call `evaluations-list-datasets` and `evaluations-list-evaluators`
2. Present the list to the user: "I found 3 datasets and 2 evaluators. Which ones should I use for baseline eval of agent X?"
3. Wait for user response before proceeding

**Implications:**
- Zero schema change, zero API change
- Only requires a prompt change in the Feedback Analyst
- Adds a conversational round-trip to what's meant to be an automated workflow
- User may not know which datasets/evaluators are relevant (they created them at different times)
- Works well for ad-hoc improvement runs where user has context
- Breaks autonomous/trigger-based improvement loops (no user present to answer)
- In single-agent projects, still asks a question with an obvious answer ("use all of them")

### Finding: Option 6 (Agent-side eval config) — feasible, agent owns references
**Confidence:** INFERRED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:84-106`

The agents table already has jsonb fields (`models`, `statusUpdates`, `stopWhen`). A new field could be added:

```typescript
export const agents = pgTable('agent', {
  ...projectScoped,
  ...uiProperties,
  // existing fields...
  evalConfig: jsonb('eval_config').$type<{
    datasetIds?: string[];
    evaluatorIds?: string[];
  }>(),
  ...timestamps,
});
```

**Implications:**
- Agent "knows" its own eval suite — natural ownership model
- Single jsonb column addition (additive migration)
- No join tables needed — simple array of IDs in json
- Feedback Analyst reads agent config → extracts eval config → uses those IDs
- Risk: referential integrity not enforced (deleted dataset ID stays in jsonb until cleaned up)
- Follows existing pattern of jsonb config fields on agents
- UI: add eval config section to agent edit page
- SDK: extend agent builder with `evalConfig` option

### Finding: Option 7 (Infer from historical runs) — zero change, cold start problem
**Confidence:** INFERRED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:946-976`, runtime schema

The system records:
- `datasetRunConfigAgentRelations` (which agents were used in which run configs)
- `datasetRun` (runtime, which dataset was run)
- `conversations.agentId` (which agent handled a conversation)

The Feedback Analyst could:
1. Query `datasetRunConfigAgentRelations` WHERE agentId = target
2. Get `datasetRunConfigId` → get `datasetId` from config
3. For evaluators: query `evaluationJobConfig` linked to those dataset runs → get evaluator relations

**Implications:**
- Zero schema change
- Fails completely for agents that have never been evaluated (cold start)
- Requires complex cross-table queries not currently implemented
- Historical associations may be stale (datasets/evaluators may have been deleted or become irrelevant)
- Best as a fallback heuristic, not a primary mechanism

### Finding: Option 8 (Trigger-level input) — UI-driven, explicit selection at invocation
**Confidence:** INFERRED
**Evidence:** `chat-to-edit/agents/feedback-improver.ts:8-17`, `agents-manage-ui/src/lib/actions/feedback.ts:68-162`

The trigger schema could be extended:

```typescript
const feedbackImproveTrigger = trigger({
  name: 'feedback-improve',
  inputSchema: z.object({
    feedbackDetails: z.string(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    datasetIds: z.array(z.string()).optional(),
    evaluatorIds: z.array(z.string()).optional(),
    targetAgentId: z.string().optional(),
  }),
  messageTemplate: '{{feedbackDetails}}',
});
```

And the feedback UI would show dataset/evaluator pickers before triggering.

**Implications:**
- Zero schema change to core entities
- Selection happens in the UI before the agent starts — no conversational friction
- Requires UI work: dataset/evaluator multi-select in feedback improvement dialog
- Explicit: user sees exactly what will be evaluated
- Optional: if not provided, agent falls back to current behavior (use all)
- Works well with existing trigger/invocation infrastructure
- Does NOT solve the "which datasets belong to this agent" question persistently — it's per-invocation

### Finding: Option 9 (Hybrid infer + confirm) — combines 7 + 5
**Confidence:** INFERRED

The Feedback Analyst could:
1. Check historical runs for the target agent
2. If found: "Based on previous runs, I'd use datasets [X, Y] and evaluators [A, B]. Sound right?"
3. If not found: "I found 3 datasets in this project. Which ones should I use?"
4. Proceed after confirmation

**Implications:**
- Zero schema change
- Smart first impression — learns from history
- Degrades gracefully (asks when no history)
- Adds conversational round-trip (same as Option 5)
- Doesn't solve persistent association — just a smarter prompt

### Finding: Option 10 (Convention/naming) — fragile, no enforcement
**Confidence:** INFERRED

Datasets/evaluators could follow naming conventions like:
- `qa-agent-dataset-1`
- `qa-agent-eval-tone`

The Feedback Analyst would match by parsing names against agent IDs.

**Implications:**
- Zero schema change
- Extremely fragile — breaks if naming convention not followed
- No enforcement mechanism
- Doesn't scale to renamed agents
- Only viable as a last-resort heuristic, not a design choice

---

## Gaps / follow-ups

- For Option 6, need to assess how SDK `agent()` builder would expose `evalConfig`
- For Option 8, need to assess feedback dialog UI complexity for multi-select pickers
