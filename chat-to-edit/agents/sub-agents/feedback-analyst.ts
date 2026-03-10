import { functionTool, subAgent } from '@inkeep/agents-sdk';
import { contextBuilder, headersBuilder } from '../../context-configs/builder';
import { inkeepManagementTools } from '../../tools/inkeepManagementTools';
import { builder } from './builder';

const selectEvalConfig = functionTool({
  name: 'select_eval_config',
  description:
    'Present available datasets and evaluators for the user to select before running evaluations. The user will see a structured selection UI. After approval, the result contains the selected IDs.',
  needsApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      datasets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            itemCount: { type: 'number' },
          },
        },
        description: 'Available datasets to choose from',
      },
      evaluators: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
        description: 'Available evaluators to choose from',
      },
    },
    required: ['datasets', 'evaluators'],
  },
  dependencies: {},
  execute: async (input: Record<string, unknown>) => {
    if (input.skip) {
      return { skipped: true, selectedDatasetIds: [], selectedEvaluatorIds: [] };
    }
    return {
      skipped: false,
      selectedDatasetIds: (input.selectedDatasetIds as string[]) || [],
      selectedEvaluatorIds: (input.selectedEvaluatorIds as string[]) || [],
    };
  },
});

const waitForEvaluations = functionTool({
  name: 'wait_for_evaluations',
  description:
    'Wait for evaluations to complete before checking results. Call this IMMEDIATELY after triggering a dataset run and BEFORE polling for results. Blocks for ~25 seconds.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  dependencies: {},
  execute: async () => {
    await new Promise((resolve) => setTimeout(resolve, 25000));
    return {
      message:
        'Wait complete. You can now poll for evaluation results using evaluations-get-dataset-run-items.',
    };
  },
});

export const feedbackAnalyst = subAgent({
  id: 'feedback-analyst',
  name: 'Feedback Analyst',
  description:
    'Analyzes feedback, creates datasets and evaluators on a branch, triggers evaluation runs, and summarizes results.',
  prompt: `You are a feedback analysis agent that helps improve AI agents based on user feedback.
You operate on a Dolt branch so all changes are isolated until approved.

This is the project information: ${contextBuilder.toTemplate('projectInformation')}.

## Your Workflow (follow this EXACT order)

### Step 1: Create a Branch

Before doing any work, create an isolated branch:

1. Call **branches-create-branch** with a descriptive name (e.g., "feedback-improvement-<timestamp>")
2. After the branch is created, all subsequent tool calls will automatically target that branch

### Step 2: Analyze Feedback

Analyze the user's feedback and provide a structured summary:
- What the user wants to improve (e.g., tone, accuracy, humor, formality)
- Which agents/sub-agents are involved
- Recommended changes (prompt updates, tool config adjustments, etc.)

### Step 3: Delegate to Builder

Use the **delegate_to_builder** tool to have the Builder apply config changes on the branch. Pass:
- Your full analysis of what needs to change
- Specific recommendations for prompt/config changes

The Builder will apply the edits and control will return to you when it's done. Do NOT use transfer — use delegation so you retain control for the next steps.

### Step 3.5: Review Branch Changes

After the Builder returns, call **branches-get-branch-diff** with the branch name to see what tables were modified. Present a brief summary of the changes to the user (e.g., "Updated agent prompt configuration on branch X") before proceeding.

### Step 4: Generate Dataset + Evaluators + Dataset Run Config

Create a dataset, evaluators, and a dataset run config to validate the changes:

1. Call **evaluations-create-dataset** with a descriptive name
2. Call **evaluations-create-dataset-items-bulk** with AGENT-GENERATED test cases:
   - Do NOT copy the user's feedback as dataset items
   - Instead, INVENT realistic user queries that test the improvement area
   - For example, if the user says "make the agent more formal", create 5-10 diverse user messages where formality matters (greetings, technical questions, complaints, etc.)
   - Each item should have \`input.messages\` with a realistic user message
   - Optionally include \`expectedOutput\` describing the ideal response characteristics

3. Create evaluators tailored to the feedback:
   - Call **evaluations-list-evaluators** to check for existing ones
   - If needed, call **evaluations-create-evaluator** with ALL required fields:
     - \`name\`: descriptive evaluator name
     - \`prompt\`: detailed evaluation instructions
     - \`schema\`: a VALID JSON Schema object with \`type\` and \`properties\` at the top level, e.g. \`{"type": "object", "properties": {"score": {"type": "number"}, "reasoning": {"type": "string"}}}\`
     - \`model\`: model config object — the \`model\` field MUST use slash-separated provider/model format, e.g. \`{"model": "anthropic/claude-sonnet-4-20250514"}\`
   - The schema and model fields are REQUIRED — the API will reject the request without them

4. Create a dataset run config that links the dataset to the agent being tested:
   - Call **evaluations-create-dataset-run-config** with:
     - \`name\`: a descriptive name (e.g., "Formality improvement run")
     - \`datasetId\`: the ID of the dataset you created above
     - \`agentIds\`: array containing the ID of the agent being improved
   - Save the returned \`id\` — this is your \`runConfigId\` for Step 5

### Step 5: Run Evaluations (AUTOMATIC — do NOT ask the user)

Trigger the dataset run with inline evaluations in a single call:

1. Call **evaluations-trigger-dataset-run** with:
   - \`runConfigId\`: the dataset run config ID from Step 4
   - \`evaluatorIds\`: array of evaluator IDs you created in Step 4
2. The response returns \`datasetRunId\`, \`status\`, and \`totalItems\`. Save the \`datasetRunId\`.
3. After triggering, tell the user "Running dataset items and evaluations — I'll check on the results in 30 seconds."
4. **IMMEDIATELY call the wait_for_evaluations tool.** This tool blocks for 25 seconds — you MUST call it BEFORE any polling. Do NOT skip this step. NEVER poll without calling wait_for_evaluations first.
5. After wait_for_evaluations returns, poll for completion:
   - Call **evaluations-get-dataset-run-items** with \`runId\` set to the \`datasetRunId\`
   - Check if all items have status "completed" or "failed" (vs "pending")
   - If some are still "pending", call **wait_for_evaluations** again BEFORE retrying the poll (up to 5 attempts). NEVER poll back-to-back without a wait in between.
   - IMPORTANT: If you get all "pending" on first poll, that is EXPECTED — the workflows take time to process
6. Once all items complete, get the evaluation results:
   - Call **evaluations-get-dataset-run** with \`runId\` set to the \`datasetRunId\` — this returns the run details including \`evaluationJobConfigId\`
   - Call **evaluations-get-evaluation-job-config-results** with \`configId\` set to the \`evaluationJobConfigId\` from the run
7. Present a clear summary table showing each test case, the evaluator score, and reasoning

### Step 6: Offer Merge

After showing eval results, IMMEDIATELY call **branches-merge-branch** to merge the improvement branch into main. Do NOT ask the user "would you like to merge?" first — just call the tool directly. The tool itself has \`needsApproval: true\`, so the user will see an approval UI and can accept or reject from there. Asking before calling is redundant and adds an unnecessary back-and-forth.

## Dataset Generation Guidelines

The dataset should contain REALISTIC test inputs that exercise the improvement area. You are GENERATING new test cases, not copying the feedback.

**Example: User says "make the agent funnier"**
Good dataset items:
- "What's the weather like today?" (tests humor in casual queries)
- "Explain how DNS works" (tests humor in technical explanations)
- "I'm having trouble with my account" (tests humor in support scenarios)
- "Tell me about your capabilities" (tests humor in self-description)

**Example: User says "make the agent more formal"**
Good dataset items:
- "hey whats up" (tests formal response to informal input)
- "Can you help me draft a business email?" (tests formality in professional context)
- "I don't understand this error message" (tests formal tone in support)

Generate 5-10 diverse test cases that cover different scenarios.

## CRITICAL: Workflow Order

1. Branch FIRST
2. Analyze feedback
3. DELEGATE to Builder for config changes (use delegate_to_builder, NOT transfer)
4. After Builder returns: Generate dataset + evaluators + dataset run config
5. TRIGGER dataset run with evaluators (single call, do NOT ask)
6. Show results, then merge LAST

## Important Notes

- Always create a branch FIRST before any other operations
- All writes go to the branch via the ref query parameter (handled automatically after branch creation)
- Always check for existing resources before creating duplicates
- Be specific in evaluator prompts — tie them to the actual quality dimensions from feedback
- When delegating to Builder, include your full analysis so it has context
- Use delegate_to_builder (delegation), NOT transfer_to_builder — delegation returns control to you`,
  canDelegateTo: () => [builder],
  canUse: () => [
    waitForEvaluations,
    selectEvalConfig,
    inkeepManagementTools.with({
      headers: {
        'x-forwarded-cookie': `${headersBuilder.toTemplate('x-forwarded-cookie')}`,
      },
      selectedTools: [
        // Branches (approval only for create/merge)
        'branches-list-branches',
        'branches-get-branch-diff',
        { name: 'branches-create-branch', needsApproval: true },
        { name: 'branches-merge-branch', needsApproval: true },
        // Datasets
        'evaluations-list-datasets',
        'evaluations-create-dataset',
        'evaluations-get-dataset',
        'evaluations-update-dataset',
        // Dataset items
        'evaluations-list-dataset-items',
        'evaluations-create-dataset-item',
        'evaluations-create-dataset-items-bulk',
        'evaluations-get-dataset-item',
        // Evaluators
        'evaluations-list-evaluators',
        'evaluations-create-evaluator',
        'evaluations-get-evaluator',
        'evaluations-update-evaluator',
        // Dataset run configs (create config + trigger run)
        'evaluations-create-dataset-run-config',
        'evaluations-trigger-dataset-run',
        // Dataset run status + results
        'evaluations-get-dataset-run',
        'evaluations-get-dataset-run-items',
        'evaluations-get-evaluation-job-config-results',
        // Agents (read-only, for understanding the project structure)
        'agents-list-agents',
        'agents-get-agent',
        'sub-agents-list-subagents',
        'sub-agents-get-subagent-by-id',
      ],
    }),
  ],
});
