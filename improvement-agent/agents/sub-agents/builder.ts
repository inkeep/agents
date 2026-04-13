import { subAgent } from '@inkeep/agents-sdk';
import { contextBuilder, headersBuilder } from '../../context-configs/improvement';
import { inkeepManagementTools } from '../../tools/inkeepManagementTools';
import { evaluator, setEvaluatorBuilderRef } from './evaluator';
import { mcpManager, setBuilderRef } from './mcp-manager';

export const builder = subAgent({
  id: 'improvement-builder',
  name: 'Improvement Builder',
  description: 'Makes configuration changes to improve an agent based on the improvement plan',
  prompt: `You are the primary agent in the improvement workflow. You receive improvement instructions, coordinate the full cycle (baseline eval → changes → post-change eval), and make targeted configuration changes.

## Target Project

You are making changes to:
- **tenantId:** ${headersBuilder.toTemplate('x-target-tenant-id')}
- **projectId:** ${headersBuilder.toTemplate('x-target-project-id')}
- **agentId (being improved):** ${headersBuilder.toTemplate('x-target-agent-id')}

**CRITICAL:** When calling ANY MCP tool, you MUST pass these tenantId and projectId values as parameters.

This is the project information: ${contextBuilder.toTemplate('projectInformation')}.
Here is a brief overview of the core concepts: ${contextBuilder.toTemplate('coreConcepts')}

All changes are made on the improvement branch specified in the instructions — never on main.

## Workflow — Follow These Steps IN ORDER

### Step 1: Fetch and Analyze Feedback
- Use \`feedback-get-feedback-by-id\` or \`feedback-list-feedback\` to fetch the feedback items
- Group recurring issues (e.g., "respond in all caps" × 3 = strong signal)
- Separate positive feedback (preserve) from negative feedback (address)
- Plan specific changes

### Step 2: Run Baseline Evals (transfer to Evaluator)
Transfer to the Evaluator with a message containing:
1. **Phase: BASELINE** — this tells the Evaluator to ONLY run existing datasets, nothing else
2. tenantId, projectId, agentId, and branch name
3. Instructions: discover existing datasets and evaluators, trigger runs on the branch (identical to main at this point), poll for results, report baseline scores, transfer back

**CRITICAL:** The transfer message MUST include the literal text "Phase: BASELINE". Do NOT include feedback details in this transfer — the Evaluator must NOT create any new datasets or evaluators during baseline.

### Step 3: Make Changes on the Branch
After the Evaluator returns with baseline results (or reports no existing datasets):
- Use YOUR OWN MCP tools directly
- Read current state on the branch first:
  - Call \`agents-get-agent\` to see agent config
  - Call \`sub-agents-list-subagents\` to see all sub-agents and their prompts
  - Call \`sub-agents-get-subagent-by-id\` for specific sub-agent config
- Make surgical changes on the branch:
  - Call \`sub-agents-update-subagent\` to update prompts/settings
  - Call \`agents-update-agent\` for agent-level config

### Step 4: Post-Change Evals (transfer to Evaluator)
**Only transfer AFTER all config changes are committed on the branch.**

Transfer to the Evaluator with a message containing:
1. **Phase: POST_CHANGE** — this tells the Evaluator to create feedback datasets AND re-run everything
2. tenantId, projectId, agentId, and branch name
3. The feedback details (conversationIds, messageIds, type, details) for creating feedback-derived datasets
4. The baseline scores from Step 2 (so the Evaluator can compare)
5. Instructions to:
   a. Create a new feedback-derived dataset from the feedback conversations
   b. Create an evaluator (LLM judge) that validates the feedback issues are addressed
   c. Trigger ALL dataset runs on the branch — both original datasets (regression check) AND new feedback-derived dataset (improvement validation)
   d. Poll until all runs complete
   e. Fetch results and compare against baseline scores
   f. Report all results back

**CRITICAL:** The transfer message MUST include the literal text "Phase: POST_CHANGE". Include ALL feedback details and baseline scores in this transfer.

### Step 5: Summary (ONLY output here)
After the Evaluator reports back, produce your ONLY response to the user:
- ALL changes made and why
- The improvement branch name
- Baseline vs post-change scores (regressions?)
- Feedback-derived eval results (improvements validated?)
- Any feedback intentionally NOT addressed

## Output Rules
- Do NOT send intermediate messages during Steps 1-4. Work silently — call tools, make changes, transfer to evaluator without explaining each step.
- Your ONLY text output should be the final summary in Step 5.

## Core Rules

### Preserve Agent Intent
- **Only change what the feedback requires.** Do not "improve" adjacent config.
- **Preserve tone, personality, scope, and behavioral constraints** unless a change was specifically requested.
- **Preserve routing and delegation logic** unless the feedback directly requires it.
- **Preserve prompt assertiveness levels.** Do not convert "typically" into "always" or vice versa unless instructed.

### Avoid Overfitting
Before making any change, ask:
1. Does this address the feedback pattern, or overfit to one conversation?
2. Would this degrade behavior in other common scenarios?
3. Am I adding a rule that only makes sense for one edge case?

If 2 or 3 is "yes," find a more targeted fix or skip it.

### Already-Addressed Feedback
Read the current config carefully. If the concern is already addressed, do NOT make redundant changes.

### Change Classification
**A) Safe** — Wording clarity, fixing typos. Low risk.
**B) Behavioral** — Prompt modifications that alter responses. Medium risk.
**C) Structural** — Adding/removing sub-agents, tool relations. High risk — only when explicitly instructed.

Prefer A over B, B over C. Prefer the smallest diff that addresses the feedback.

### Execution Rules
- Read the agent's full current configuration FIRST.
- Make changes one at a time, not in bulk rewrites.
- Surgically add/modify only what's needed.
- Do not add new sub-agents, tools, or components unless instructed.
- Only transfer to MCP Manager if you need to connect a NEW external tool that doesn't exist.`,
  canTransferTo: () => [mcpManager, evaluator],
  canUse: () => [
    inkeepManagementTools.with({
      headers: {
        authorization: `${headersBuilder.toTemplate('authorization')}`,
        'x-inkeep-ref': `${headersBuilder.toTemplate('x-target-branch-name')}`,
      },
      selectedTools: [
        'feedback-list-feedback',
        'feedback-get-feedback-by-id',

        'projects-list-projects',
        { name: 'projects-update-project', needsApproval: false },
        'projects-get-project-by-id',
        'sub-agents-list-subagents',
        { name: 'sub-agents-create-subagent', needsApproval: false },
        'sub-agents-get-subagent-by-id',
        { name: 'sub-agents-update-subagent', needsApproval: false },
        { name: 'sub-agents-delete-subagent', needsApproval: false },
        'sub-agents-list-sub-agent-relations',
        { name: 'sub-agents-create-sub-agent-relation', needsApproval: false },
        { name: 'sub-agents-update-sub-agent-relation', needsApproval: false },
        { name: 'sub-agents-delete-sub-agent-relation', needsApproval: false },
        'agents-list-agents',
        { name: 'agents-create-agent', needsApproval: false },
        'agents-get-agent',
        { name: 'agents-update-agent', needsApproval: false },
        { name: 'agents-delete-agent', needsApproval: false },
        'agents-get-related-agent-infos',
        'sub-agents-list-subagent-tool-relations',
        { name: 'sub-agents-create-subagent-tool-relation', needsApproval: false },
        { name: 'sub-agents-update-subagent-tool-relation', needsApproval: false },
        { name: 'sub-agents-delete-subagent-tool-relation', needsApproval: false },
        'sub-agents-get-subagents-for-tool',
        'artifact-components-list-artifact-components',
        { name: 'artifact-components-create-artifact-component', needsApproval: false },
        'artifact-components-get-artifact-component-by-id',
        { name: 'artifact-components-update-artifact-component', needsApproval: false },
        { name: 'artifact-components-delete-artifact-component', needsApproval: false },
        'agents-get-artifact-components-for-agent',
        { name: 'agents-associate-artifact-component-with-agent', needsApproval: false },
        { name: 'agents-remove-artifact-component-from-agent', needsApproval: false },
        'data-components-list-data-components',
        { name: 'data-components-create-data-component', needsApproval: false },
        'data-components-get-data-component-by-id',
        { name: 'data-components-update-data-component', needsApproval: false },
        { name: 'data-components-delete-data-component', needsApproval: false },
        'agents-get-data-components-for-agent',
        { name: 'agents-associate-data-component-with-agent', needsApproval: false },
        { name: 'agents-remove-data-component-from-agent', needsApproval: false },
        'context-configs-list-context-configs',
        { name: 'context-configs-create-context-config', needsApproval: false },
        'context-configs-get-context-config-by-id',
        { name: 'context-configs-update-context-config', needsApproval: false },
        { name: 'context-configs-delete-context-config', needsApproval: false },
        'tools-list-tools',
        { name: 'tools-create-tool', needsApproval: false },
        'tools-get-tool',
        { name: 'tools-update-tool', needsApproval: false },
        { name: 'tools-delete-tool', needsApproval: false },
        'MCP-catalog-list-mcp-catalog',

        'branches-list-branches',
        { name: 'branches-create-branch', needsApproval: false },
        'branches-get-branch',
        { name: 'branches-delete-branch', needsApproval: false },
        'branches-list-branches-for-agent',

        'functions-list-functions',
        'functions-get-function',
        { name: 'functions-create-function', needsApproval: false },
        { name: 'functions-update-function', needsApproval: false },
        { name: 'functions-delete-function', needsApproval: false },

        'conversations-list-conversations',
        'conversations-get-conversation',
      ],
    }),
  ],
});

setBuilderRef(builder);
setEvaluatorBuilderRef(builder);
