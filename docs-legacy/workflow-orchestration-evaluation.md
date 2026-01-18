# Workflow Orchestration: Inngest vs Vercel Workflow SDK with Postgres

## Executive Summary

This document evaluates two workflow orchestration solutions for the Inkeep Agent Framework evaluation system:
- **Current**: Inngest (SaaS-based workflow orchestration)
- **Alternative**: Vercel Workflow SDK with Postgres (self-hosted with database state management)

## Current State Analysis

### Current Inngest Implementation

**Location**: `agents-eval-api/src/inngest/`

**Key Usage**:
1. **Event-driven evaluation jobs**: Fans out evaluation tasks to process multiple conversations in parallel
2. **Retry logic**: 3 automatic retries for failed evaluations
3. **Concurrency control**: Limit of 20 concurrent evaluation executions
4. **Step-based workflows**: Multiple `step.run()` calls for atomicity

**Example Workflow**:
```typescript
inngest.createFunction(
  {
    id: 'evaluate-conversation',
    retries: 3,
    concurrency: { limit: 20 },
  },
  { event: 'evaluation/conversation.execute' },
  async ({ event, step }) => {
    const conversation = await step.run('get-conversation', async () => {...});
    const evaluators = await step.run('get-evaluators', async () => {...});
    for (const evaluator of evaluators) {
      await step.run(`evaluate-with-${evaluator.id}`, async () => {...});
    }
  }
);
```

**Trigger Pattern**:
```typescript
await inngest.send(
  conversationIds.map((conversationId) => ({
    name: 'evaluation/conversation.execute',
    data: { tenantId, projectId, conversationId, evaluatorIds, evaluationRunId }
  }))
);
```

### Architecture Context

- **Database**: PostgreSQL (Drizzle ORM)
- **Framework**: Node.js, TypeScript, Hono
- **Multi-tenancy**: Tenant/project scoped operations
- **Scale**: Handles bulk evaluation jobs with 100s-1000s of conversations
- **Execution pattern**: Fan-out from API endpoints, concurrent processing

## Comparison Matrix

| **Criteria** | **Inngest** | **Vercel Workflow SDK + Postgres** |
|-------------|-------------|-----------------------------------|
| **Architecture** | SaaS + managed infrastructure | Self-hosted + database state management |
| **State Management** | Managed by Inngest cloud | PostgreSQL tables (you manage) |
| **Pricing** | Usage-based (steps, function runs) | Compute + database storage costs |
| **Vendor Lock-in** | High (proprietary SDK) | Low (OSS SDK, standard Postgres) |
| **Local Development** | Dev server available (`isDev` mode) | Full local execution |
| **Infrastructure** | External dependency | Runs in your existing infrastructure |
| **Retry Mechanism** | Built-in with configurable retries | Manual implementation required |
| **Concurrency Control** | Built-in (`concurrency.limit`) | Manual semaphore/queue implementation |
| **Step Atomicity** | Automatic checkpointing | Manual state management |
| **Observability** | Inngest dashboard + logs | Custom (integrate with existing) |
| **Deployment** | Deploy anywhere + Inngest cloud | Deploy anywhere (Vercel/self-hosted) |
| **Cold Start** | Minimal (event-driven) | Depends on deployment (Vercel serverless) |
| **Multi-region** | Automatic with Inngest | Manual setup required |
| **Learning Curve** | Low (simple SDK) | Medium (more setup required) |

## Detailed Analysis

### 1. State Management

#### Inngest
- **Pros**:
  - Automatic state persistence across steps
  - No manual database schema needed
  - Built-in step memoization (failed steps don't re-execute)
  - State visible in Inngest dashboard
- **Cons**:
  - State stored externally (not in your database)
  - Limited querying capabilities
  - Vendor-dependent state access

#### Vercel Workflow SDK + Postgres
- **Pros**:
  - Complete control over state schema
  - Can query workflow state directly in SQL
  - State co-located with application data
  - Can build custom admin UIs
- **Cons**:
  - Must design and maintain workflow state tables
  - Manual checkpointing logic
  - More complex recovery logic

**Schema Example for Vercel Workflow**:
```typescript
// Would need to add to schema.ts
export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  workflowType: text('workflow_type').notNull(),
  status: text('status').notNull(), // 'pending', 'running', 'success', 'failed'
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const workflowSteps = pgTable('workflow_steps', {
  id: text('id').primaryKey(),
  workflowRunId: text('workflow_run_id').references(() => workflowRuns.id),
  stepName: text('step_name').notNull(),
  status: text('status').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});
```

### 2. Retry & Error Handling

#### Inngest
```typescript
inngest.createFunction(
  { retries: 3 },
  { event: 'my-event' },
  async ({ event, step, attempt }) => {
    // Automatic retries with exponential backoff
    // attempt = 0, 1, 2, 3
  }
);
```
- **Pros**: Automatic, configurable, exponential backoff built-in
- **Cons**: Less control over retry logic

#### Vercel Workflow + Postgres
```typescript
async function runWorkflowWithRetry(workflowId: string, maxRetries = 3) {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      await executeWorkflow(workflowId);
      await updateWorkflowStatus(workflowId, 'success');
      return;
    } catch (error) {
      retryCount++;
      await updateWorkflowRetryCount(workflowId, retryCount);
      if (retryCount >= maxRetries) {
        await updateWorkflowStatus(workflowId, 'failed');
        throw error;
      }
      await sleep(Math.pow(2, retryCount) * 1000);
    }
  }
}
```
- **Pros**: Full control, custom retry strategies
- **Cons**: More code to write and maintain

### 3. Concurrency Control

#### Inngest
```typescript
inngest.createFunction(
  { concurrency: { limit: 20 } },
  { event: 'my-event' },
  async ({ event }) => {
    // Inngest automatically queues and limits concurrent executions
  }
);
```
- **Pros**: Built-in, distributed, no additional infrastructure
- **Cons**: Less granular control

#### Vercel Workflow + Postgres
```typescript
// Option 1: Database semaphore
async function acquireLock(lockName: string, maxConcurrent: number) {
  const result = await db.execute(sql`
    UPDATE workflow_locks 
    SET current_count = current_count + 1 
    WHERE name = ${lockName} AND current_count < ${maxConcurrent}
    RETURNING current_count
  `);
  return result.rows.length > 0;
}

// Option 2: Job queue (pg-boss, BullMQ)
const queue = new Queue('evaluations', { connection: postgresConfig });
await queue.add('evaluate', { conversationId }, { 
  concurrency: 20 
});
```
- **Pros**: Can use battle-tested libraries (pg-boss, BullMQ)
- **Cons**: Additional dependencies, more setup

### 4. Observability & Debugging

#### Inngest
- **Dashboard**: Visual workflow execution, step details, logs
- **Replay**: Can replay failed functions from dashboard
- **Metrics**: Built-in execution time, success rates
- **Events**: Event history and inspection

#### Vercel Workflow + Postgres
- **Custom**: Must build your own dashboard
- **Queries**: Direct SQL access to workflow state
- **Integration**: Can integrate with existing monitoring (OpenTelemetry, Jaeger)
- **Flexibility**: Full control over what you track

### 5. Cost Analysis

#### Inngest Pricing (as of 2024)
- **Free Tier**: 
  - 50,000 steps/month
  - 2,000 function runs/month
- **Pro**: Starts at ~$150/month for 1M steps
- **Costs scale with**:
  - Number of function executions
  - Number of steps per function
  - Retention period

**Your Usage Pattern**:
```
Scenario: 1000 conversations, 3 evaluators each, 5 steps per evaluation
= 1000 conversations × 3 evaluators × 5 steps = 15,000 steps per run
= ~3.3 evaluation runs before hitting free tier limit
= Need Pro plan at scale
```

#### Vercel Workflow + Postgres
- **Infrastructure**:
  - Database: Existing Postgres (marginal storage cost)
  - Compute: Same as current API servers
  - No per-execution fees
- **Costs scale with**:
  - Database size (workflow state tables)
  - Compute time (same as current)

**Cost Comparison**:
- **Low volume** (< 50k steps/month): Inngest free tier wins
- **High volume** (> 1M steps/month): Vercel Workflow likely cheaper
- **Break-even**: ~500k-1M steps/month

### 6. Implementation Complexity

#### Inngest (Current)
```typescript
// 1. Define function (low complexity)
export const evaluateConversation = inngest.createFunction(
  { id: 'evaluate-conversation', retries: 3, concurrency: { limit: 20 } },
  { event: 'evaluation/conversation.execute' },
  async ({ event, step }) => {
    const conversation = await step.run('get-conversation', async () => {...});
    const evaluators = await step.run('get-evaluators', async () => {...});
    for (const evaluator of evaluators) {
      await step.run(`evaluate-with-${evaluator.id}`, async () => {...});
    }
  }
);

// 2. Trigger (simple)
await inngest.send([{ name: 'evaluation/conversation.execute', data }]);

// 3. Serve (one endpoint)
serve({ client: inngest, functions: [evaluateConversation] });
```
**LOC**: ~150 lines for full implementation

#### Vercel Workflow + Postgres
```typescript
// 1. Define workflow schema (medium complexity)
export const workflowRuns = pgTable(...);
export const workflowSteps = pgTable(...);

// 2. Implement workflow executor (high complexity)
class WorkflowExecutor {
  async execute(workflowId: string) {
    const run = await this.getWorkflowRun(workflowId);
    await this.executeStep('get-conversation', async () => {...});
    await this.executeStep('get-evaluators', async () => {...});
    for (const evaluator of evaluators) {
      await this.executeStep(`evaluate-${evaluator.id}`, async () => {...});
    }
  }
  
  private async executeStep(name: string, fn: () => Promise<any>) {
    // Check if step already completed (checkpoint)
    // Execute and save result
    // Handle errors and retries
  }
}

// 3. Queue management (medium complexity)
class WorkflowQueue {
  async enqueue(workflow: WorkflowConfig) {...}
  async dequeue() {...}
  async processConcurrent(maxConcurrent: number) {...}
}

// 4. Trigger (similar)
await workflowQueue.enqueue({ type: 'evaluate-conversation', data });

// 5. Worker (new service)
const worker = new WorkflowWorker(workflowQueue);
await worker.start();
```
**LOC**: ~500-800 lines for equivalent functionality

### 7. Vendor Lock-in & Portability

#### Inngest
- **Lock-in Level**: **High**
  - Proprietary SDK and API
  - Event format specific to Inngest
  - Dashboard and tooling vendor-specific
- **Migration Path**:
  - Would need to rewrite workflow logic
  - Event replay history lost
  - Observability starts fresh

#### Vercel Workflow + Postgres
- **Lock-in Level**: **Low**
  - Open-source SDK
  - Standard Postgres (portable)
  - Can move to any cloud provider
- **Migration Path**:
  - Change workflow SDK (minimal changes)
  - Keep all workflow state data
  - Observability unchanged

### 8. Local Development Experience

#### Inngest
```bash
# Local dev mode
inngest-cli dev
# or use isDev flag
export INNGEST_DEV=true
pnpm dev
```
- **Pros**: Simple dev server, localhost events
- **Cons**: Still calls Inngest cloud for some features

#### Vercel Workflow + Postgres
```bash
# Just run your API
pnpm dev
```
- **Pros**: Fully local, no external dependencies
- **Cons**: Must set up local Postgres

## Use Case Fit Analysis

### When Inngest is Better

1. **Early stage / prototyping**
   - Get workflow orchestration quickly
   - Focus on business logic, not infrastructure
   - Free tier covers MVP usage

2. **Variable workload**
   - Don't want to provision for peak capacity
   - Serverless-style scaling
   - Unpredictable traffic patterns

3. **Small team**
   - Don't want to maintain workflow infrastructure
   - Prefer managed solution
   - Value built-in observability

4. **Event-driven architecture**
   - Already using event-driven patterns
   - Multiple systems triggering workflows
   - Need fan-out/fan-in patterns

### When Vercel Workflow + Postgres is Better

1. **High volume / predictable load**
   - Processing millions of steps/month
   - Cost optimization important
   - Consistent workload patterns

2. **Data sovereignty / compliance**
   - All data must stay in your infrastructure
   - Regulatory requirements (HIPAA, GDPR)
   - No external service dependencies

3. **Complex state queries**
   - Need to query workflow state with SQL
   - Join workflow data with application data
   - Build custom reporting/analytics

4. **Full control**
   - Custom retry strategies
   - Specific concurrency patterns
   - Integration with existing systems

5. **Long-term cost optimization**
   - Break-even at ~1M steps/month
   - Predictable infrastructure costs
   - Can optimize database performance

## Recommendation

### Short-term (0-6 months): **Stick with Inngest**

**Rationale**:
- Already implemented and working
- Team familiar with the SDK
- Free tier sufficient for current volume
- Migration cost not justified yet

**Action items**:
- Monitor monthly usage (steps, functions)
- Set up cost alerts at 80% of free tier
- Document Inngest-specific patterns

### Medium-term (6-12 months): **Evaluate migration threshold**

**Trigger points for migration**:
1. Consistently exceeding 500k steps/month
2. Inngest costs > $200/month
3. Compliance requirements change
4. Need complex workflow state queries

**Action items**:
- Design Postgres workflow schema
- Prototype Vercel Workflow implementation
- Cost model for projected growth
- Load test comparison

### Long-term (12+ months): **Consider Vercel Workflow + Postgres**

**If you hit these conditions**:
- Processing > 1M steps/month
- Inngest costs > $500/month
- Multi-region requirements
- Need workflow data in analytics

**Migration strategy**:
1. Implement Vercel Workflow alongside Inngest
2. Migrate low-priority workflows first
3. Run dual-write period for testing
4. Fully migrate and decommission Inngest

## Implementation Guide: Vercel Workflow + Postgres

If you decide to migrate, here's a high-level implementation plan:

### Phase 1: Schema Design

```typescript
// packages/agents-core/src/db/schema.ts
export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey().default(sql`generate_id()`),
  tenantId: text('tenant_id').notNull().references(() => tenant.id),
  projectId: text('project_id').notNull().references(() => project.id),
  workflowType: text('workflow_type').notNull(),
  status: text('status').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  concurrencyGroup: text('concurrency_group'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  nextRetryAt: timestamp('next_retry_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workflowSteps = pgTable('workflow_steps', {
  id: text('id').primaryKey().default(sql`generate_id()`),
  workflowRunId: text('workflow_run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepName: text('step_name').notNull(),
  status: text('status').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Indexes for performance
workflowRuns.index('idx_workflow_status').on(workflowRuns.status, workflowRuns.nextRetryAt);
workflowRuns.index('idx_workflow_tenant').on(workflowRuns.tenantId, workflowRuns.projectId);
workflowSteps.index('idx_step_workflow').on(workflowSteps.workflowRunId);
```

### Phase 2: Workflow Engine

```typescript
// agents-eval-api/src/workflow/engine.ts
export class WorkflowEngine {
  constructor(private db: DbClient) {}

  async executeWorkflow<T>(
    workflowType: string,
    input: T,
    options: WorkflowOptions
  ): Promise<string> {
    const workflowId = generateId();
    
    await this.db.insert(workflowRuns).values({
      id: workflowId,
      workflowType,
      status: 'pending',
      input: input as any,
      maxRetries: options.retries ?? 3,
      concurrencyGroup: options.concurrencyGroup,
      tenantId: input.tenantId,
      projectId: input.projectId,
    });

    // Enqueue for processing
    await this.enqueue(workflowId);
    
    return workflowId;
  }

  async executeStep(
    workflowRunId: string,
    stepName: string,
    fn: () => Promise<any>
  ): Promise<any> {
    // Check if step already completed (idempotency)
    const existing = await this.db.query.workflowSteps.findFirst({
      where: (steps, { eq, and }) =>
        and(
          eq(steps.workflowRunId, workflowRunId),
          eq(steps.stepName, stepName),
          eq(steps.status, 'completed')
        ),
    });

    if (existing) {
      return existing.output;
    }

    // Create step record
    const stepId = generateId();
    await this.db.insert(workflowSteps).values({
      id: stepId,
      workflowRunId,
      stepName,
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const output = await fn();
      
      await this.db.update(workflowSteps)
        .set({
          status: 'completed',
          output,
          completedAt: new Date(),
        })
        .where(eq(workflowSteps.id, stepId));

      return output;
    } catch (error) {
      await this.db.update(workflowSteps)
        .set({
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        })
        .where(eq(workflowSteps.id, stepId));

      throw error;
    }
  }
}
```

### Phase 3: Worker Implementation

```typescript
// agents-eval-api/src/workflow/worker.ts
export class WorkflowWorker {
  private isRunning = false;
  private concurrencyMap = new Map<string, number>();

  async start() {
    this.isRunning = true;
    
    while (this.isRunning) {
      try {
        // Get next workflow to process
        const workflow = await this.dequeue();
        
        if (workflow) {
          // Check concurrency limits
          if (this.canProcess(workflow)) {
            this.processWorkflow(workflow);
          } else {
            // Re-queue if at concurrency limit
            await this.requeueLater(workflow);
          }
        } else {
          // No work available, sleep briefly
          await sleep(1000);
        }
      } catch (error) {
        logger.error({ error }, 'Worker error');
        await sleep(5000);
      }
    }
  }

  private async processWorkflow(workflow: WorkflowRun) {
    try {
      // Execute workflow based on type
      if (workflow.workflowType === 'evaluate-conversation') {
        await this.executeEvaluationWorkflow(workflow);
      }
      
      await this.markComplete(workflow.id);
    } catch (error) {
      await this.handleWorkflowError(workflow.id, error);
    }
  }

  private async executeEvaluationWorkflow(workflow: WorkflowRun) {
    const engine = new WorkflowEngine(this.db);
    const input = workflow.input as EvaluationInput;

    const conversation = await engine.executeStep(
      workflow.id,
      'get-conversation',
      async () => getConversation(this.db)({ scopes: input, conversationId: input.conversationId })
    );

    const evaluators = await engine.executeStep(
      workflow.id,
      'get-evaluators',
      async () => Promise.all(
        input.evaluatorIds.map(id => getEvaluatorById(this.db)({ scopes: input, evaluatorId: id }))
      )
    );

    for (const evaluator of evaluators) {
      await engine.executeStep(
        workflow.id,
        `evaluate-with-${evaluator.id}`,
        async () => {
          const evaluationService = new EvaluationService();
          return evaluationService.executeEvaluation({
            conversation,
            evaluator,
            tenantId: input.tenantId,
            projectId: input.projectId,
          });
        }
      );
    }
  }
}
```

### Phase 4: API Integration

```typescript
// agents-eval-api/src/routes/evaluations.ts
// Replace this:
await inngest.send(
  conversationIds.map((conversationId) => ({
    name: 'evaluation/conversation.execute',
    data: { tenantId, projectId, conversationId, evaluatorIds, evaluationRunId }
  }))
);

// With this:
const workflowEngine = new WorkflowEngine(dbClient);
await Promise.all(
  conversationIds.map((conversationId) =>
    workflowEngine.executeWorkflow(
      'evaluate-conversation',
      { tenantId, projectId, conversationId, evaluatorIds, evaluationRunId },
      { retries: 3, concurrencyGroup: 'evaluations' }
    )
  )
);
```

### Phase 5: Observability

```typescript
// agents-manage-ui/src/app/workflows/[workflowId]/page.tsx
export default async function WorkflowDetailPage({ params }) {
  const workflow = await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, params.workflowId),
    with: { steps: true },
  });

  return (
    <div>
      <WorkflowTimeline workflow={workflow} />
      <WorkflowSteps steps={workflow.steps} />
      <WorkflowLogs workflowId={workflow.id} />
    </div>
  );
}
```

## Testing Strategy

### Inngest Testing
```typescript
// Already have this pattern
import { evaluateConversation } from '../functions/evaluateConversation';

test('evaluation workflow completes successfully', async () => {
  const result = await evaluateConversation.invoke({
    event: {
      name: 'evaluation/conversation.execute',
      data: { conversationId: 'test-id', ... }
    }
  });
  
  expect(result.success).toBe(true);
});
```

### Vercel Workflow Testing
```typescript
// New test approach
import { WorkflowEngine } from '../workflow/engine';

test('evaluation workflow with Postgres', async () => {
  const engine = new WorkflowEngine(testDb);
  
  const workflowId = await engine.executeWorkflow(
    'evaluate-conversation',
    { conversationId: 'test-id', ... },
    { retries: 1 }
  );

  const workflow = await testDb.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, workflowId)
  });

  expect(workflow.status).toBe('completed');
});
```

## Performance Considerations

### Inngest
- **Latency**: 50-200ms for event ingestion
- **Cold starts**: Minimal (event-driven)
- **Throughput**: Scales automatically
- **Bottleneck**: API rate limits (rare)

### Vercel Workflow + Postgres
- **Latency**: < 10ms for database writes
- **Cold starts**: Depends on deployment
- **Throughput**: Limited by database connections
- **Bottleneck**: Database query performance

**Optimization strategies**:
1. Connection pooling (pg-pool)
2. Indexes on status + timestamps
3. Partition workflow_steps by date
4. Archive completed workflows (> 30 days)

## Decision Framework

Use this decision tree:

```
Are you processing > 500k steps/month?
├─ YES: Consider Vercel Workflow + Postgres
│   └─ Cost savings likely
└─ NO: Stick with Inngest
    └─ Free tier sufficient

Do you have compliance requirements?
├─ YES: Use Vercel Workflow + Postgres
│   └─ Data sovereignty important
└─ NO: Continue with decision tree

Do you need complex workflow state queries?
├─ YES: Vercel Workflow + Postgres is better
│   └─ SQL flexibility valuable
└─ NO: Inngest is simpler

Is your team experienced with workflow orchestration?
├─ YES: Vercel Workflow + Postgres is feasible
│   └─ Can build and maintain
└─ NO: Stick with Inngest
    └─ Lower operational burden
```

## Conclusion

**For the Inkeep Agent Framework evaluation system:**

1. **Current state**: Inngest is the right choice
   - Low current volume
   - Working implementation
   - Team velocity maintained

2. **Future consideration**: Migration makes sense when:
   - Monthly Inngest costs exceed $200
   - Processing > 1M steps/month
   - Compliance requirements emerge

3. **Action**: Monitor usage and costs quarterly

**Final recommendation**: **Continue with Inngest** for now, but prepare for potential migration in 6-12 months as scale increases.

