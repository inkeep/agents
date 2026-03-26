# Evidence: Improvement Agent Workflow

**Dimension:** How the Feedback Analyst selects datasets/evaluators today
**Date:** 2026-03-11
**Sources:** chat-to-edit/agents/sub-agents/feedback-analyst.ts, chat-to-edit/agents/feedback-improver.ts, agents-manage-ui/src/lib/actions/feedback.ts, agents-manage-ui/src/components/feedback/feedback-table.tsx

---

## Key files referenced

- `chat-to-edit/agents/sub-agents/feedback-analyst.ts:52-59` — Dataset/evaluator selection logic
- `chat-to-edit/agents/sub-agents/feedback-analyst.ts:60-91` — Baseline eval workflow
- `chat-to-edit/agents/feedback-improver.ts:30` — `agentId` available via header template
- `agents-manage-ui/src/components/feedback/feedback-table.tsx:89-107` — UI does NOT pass targetAgentId
- `agents-manage-ui/src/lib/actions/feedback.ts:68-162` — Trigger invocation flow

---

## Findings

### Finding: Feedback Analyst uses ALL datasets and evaluators in the project
**Confidence:** CONFIRMED
**Evidence:** `chat-to-edit/agents/sub-agents/feedback-analyst.ts:52-59`

```
### Step 3: Gather Evaluation Resources
1. Fetch existing datasets: call **evaluations-list-datasets** to get all available datasets
2. Fetch existing evaluators: call **evaluations-list-evaluators** to get all available evaluators
3. If no datasets or evaluators exist, skip all evaluation steps
4. Use ALL available datasets and evaluators for the evaluation runs
```

No filtering by agent. `list-datasets` and `list-evaluators` return ALL project-scoped resources.

### Finding: The Feedback Improver has access to the target agentId via headers
**Confidence:** CONFIRMED
**Evidence:** `chat-to-edit/agents/feedback-improver.ts:30`

```
You are operating in the context of tenantId=[...x-target-tenant-id...] and
projectId=[...x-target-project-id...] and agentId=[...x-target-agent-id...].
```

The `x-target-agent-id` header is available. However, it's optional and the UI doesn't always pass it.

### Finding: The feedback table UI does NOT pass targetAgentId
**Confidence:** CONFIRMED
**Evidence:** `agents-manage-ui/src/components/feedback/feedback-table.tsx:89-107`

```
const result = await triggerFeedbackImprovementAction(
  PUBLIC_INKEEP_COPILOT_TENANT_ID,
  PUBLIC_INKEEP_COPILOT_PROJECT_ID,
  FEEDBACK_IMPROVER_AGENT_ID,
  {
    feedbackDetails,
    conversationId: item.conversationId,
    messageId: item.messageId ?? undefined,
    targetTenantId: tenantId,
    targetProjectId: projectId,
    // NOTE: no targetAgentId passed here
  }
);
```

`targetAgentId` is not passed. The agent must infer it from context or conversation.

### Finding: The trigger input schema does not include dataset/evaluator IDs
**Confidence:** CONFIRMED
**Evidence:** `chat-to-edit/agents/feedback-improver.ts:8-17`

```
const feedbackImproveTrigger = trigger({
  name: 'feedback-improve',
  inputSchema: z.object({
    feedbackDetails: z.string(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
  }),
  messageTemplate: '{{feedbackDetails}}',
});
```

Only `feedbackDetails`, `conversationId`, and `messageId`. No dataset or evaluator selection.

### Finding: Baseline eval creates new run configs each time
**Confidence:** CONFIRMED
**Evidence:** `chat-to-edit/agents/sub-agents/feedback-analyst.ts:64-67`

```
1. For each dataset, create a dataset run config (if one doesn't already exist):
   - Call evaluations-create-dataset-run-config with:
     - name: "Baseline - <dataset name>"
     - datasetId: the dataset ID
     - agentIds: array containing the ID of the agent being improved
```

The agent creates new run configs for each improvement run. It passes `agentIds` when creating these configs.

---

## Gaps / follow-ups

- The feedback table could be enhanced to pass `targetAgentId` — the conversation likely has an `agentId` in the runtime DB
- The trigger schema could be extended with dataset/evaluator selection fields
