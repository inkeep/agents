# Evaluation Scripts

This directory contains utility scripts for running and testing evaluations.

## Available Scripts

### `run-conversation-evaluation.ts`

A script that demonstrates how to run conversation evaluations on an existing conversation.

**What it does:**

1. Connects to your existing database (no migrations needed)
2. Verifies an existing conversation exists in the database
3. Creates an evaluator using the `createEvaluator` API
4. Creates a conversation evaluation config using `createConversationEvaluationConfig` API
5. Links the evaluator to the config using `linkEvaluatorToConfig` API
6. Runs the evaluation using the EvaluationService
7. Displays the results with scores and reasoning

**Configuration:**

Edit the script to set your conversation ID and tenant/project:

```typescript
const EXISTING_CONVERSATION_ID = 'ukegsy5b0e02tc9fsbr0p';
const TENANT_ID = 'inkeep'; // Update with your tenant ID
const PROJECT_ID = 'default'; // Update with your project ID
```

**How to run:**

```bash
cd agents-manage-api
pnpm tsx scripts/run-conversation-evaluation.ts
```

**Environment Requirements:**

The script uses the environment variables from your `.env` file. Make sure you have:

- `ANTHROPIC_API_KEY` - Required for running evaluations with Claude
- `DB_FILE_NAME` - SQLite database file path (optional, uses in-memory by default)

**Output:**

The script will output:
- Tenant, project, and conversation IDs created
- Evaluation results including:
  - Status (done/failed)
  - Reasoning from the LLM
  - Structured evaluation scores:
    - Response Quality (1-5)
    - Professionalism (1-5)
    - Resolution Progress (1-5)
    - Empathy (1-5)
    - Overall Score
    - Strengths identified
    - Areas for improvement

**Example Output:**

```
================================================================================
EVALUATION RESULTS
================================================================================

Tenant ID: test-tenant-abc123
Project ID: default
Conversation ID: conv-xyz789
Evaluation Config ID: eval-config-def456

Total Results: 1
Duration: 3245ms

--------------------------------------------------------------------------------
Result ID: eval-result-001
Status: done

Reasoning:
The agent provided helpful, professional responses with good empathy...

Evaluation Scores:
{
  "responseQuality": 4,
  "professionalism": 5,
  "resolution": 4,
  "empathy": 4,
  "overallScore": 4.25,
  "strengths": [
    "Polite and professional tone",
    "Proactive in providing tracking information"
  ],
  "areasForImprovement": [
    "Could have offered additional assistance"
  ]
}
================================================================================
```

## Adding New Scripts

When adding new evaluation scripts:

1. Use TypeScript for type safety
2. Import from `@inkeep/agents-core` for database operations
3. Use the logger for structured logging
4. Include comprehensive error handling
5. Provide clear output formatting
6. Document environment requirements
7. Add usage instructions to this README

