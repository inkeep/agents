---
name: Current Webhook Trigger System
description: How webhook triggers work today — schema, execution, auth, UI, differences from scheduled triggers
type: evidence
---

## Key Architectural Differences from Scheduled Triggers

| Aspect | Webhook Triggers | Scheduled Triggers |
|--------|-----------------|-------------------|
| Database | Manage (Doltgres) — versioned config | Runtime (Postgres) — persistent state |
| User FKs | None — plain varchar strings | FK to user.id with CASCADE |
| Execution | Inline async (fire-and-forget promise) | Workflow engine (durable, checkpointed) |
| Entry point | HTTP POST to webhook URL | Scheduler tick (60s interval) |
| Response | 202 Accepted with conversationId + invocationId | No response (background) |
| State tracking | `trigger_invocations` table in runtime DB (pending/success/failed, payload, conversationId) | `scheduled_trigger_invocations` table in runtime DB |
| Branch scoping | Yes — withRef() for Doltgres branches | No — runtime DB is branchless |
| Cleanup on user removal | App-driven via deleteTriggersByRunAsUserId within withRef() | FK CASCADE + app cleanup |

## Schema (manage-schema.ts)

```typescript
triggers = pgTable('triggers', {
  ...agentScoped,          // tenantId, projectId, agentId, id
  ...uiProperties,         // name, description
  enabled: boolean,
  inputSchema: jsonb,
  outputTransform: jsonb,
  messageTemplate: text,
  authentication: jsonb,
  signingSecretCredentialReferenceId: varchar,
  signatureVerification: jsonb,
  runAsUserId: varchar(256),   // plain string, no FK
  createdBy: varchar(256),     // plain string, no FK
  ...timestamps,
})
```

## Execution Flow

1. HTTP POST → `/run/.../triggers/{triggerId}` (noAuth — webhook is public)
2. `processWebhook()` in TriggerService: load trigger, verify auth/signature, validate/transform payload
3. `dispatchExecution()`: create conversation, build message, call `executeAgentAsync()`
4. Return 202 with `{ conversationId, invocationId }`
5. Background: executeAgentAsync runs with `invocationType: 'trigger'`

## User Cleanup

`cleanupUserTriggers()` in triggerCleanup.ts:
1. For each project, resolve main branch ref
2. Use `withRef()` to enter branch context
3. Call `deleteTriggersByRunAsUserId()` — deletes all triggers where runAsUserId = departing user
4. Auto-commits the change to the branch

No cleanup on project member removal (same gap as scheduled triggers had before our fix).

## UI

Same pattern as scheduled triggers pre-multi-user:
- Admin create mode: multi-select → bulk creates N separate triggers
- Edit mode: single-select dropdown for runAsUserId
- `bulkCreateTriggersAction()` creates N triggers with different names
