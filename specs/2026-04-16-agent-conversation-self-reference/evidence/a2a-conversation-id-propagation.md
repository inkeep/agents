---
name: A2A delegation conversationId propagation — already wired today
description: Trace showing that the parent's conversationId propagates to child sub-agent's runtimeContext through existing delegation code. G3 (ambient ID is user's overarching conversation ID) is met without new mechanism.
type: factual
sources:
  - Worldmodel + A2A subagent investigation 2026-04-16 (agents a17319c1018e52c44, a0b70b4db7c38a870)
  - public/agents/agents-api/src/domains/run/agents/relationTools.ts
  - public/agents/agents-api/src/domains/run/a2a/handlers.ts
  - public/agents/agents-api/src/domains/run/agents/generateTaskHandler.ts
  - public/agents/agents-api/src/domains/run/handlers/executionHandler.ts
captured: 2026-04-16
baseline: 2abfdf44e
---

# Parent → child conversationId flow (delegation)

## Step-by-step

1. **Parent task creation** — `executionHandler.ts:181`. Parent's `contextId = conversationId` (user's ID). Parent's task ID encoded as `task_${conversationId}-${requestId}`.
2. **Parent's runtimeContext** — `generateTaskHandler.ts:370–458`. Reads `contextId = task.context?.conversationId`, passes into `runtimeContext.metadata.conversationId`.
3. **Delegation-tool closure** — `relationTools.ts:288–306`. `createDelegateToAgentTool()` receives `contextId` + `metadata` (including `conversationId`) as parameters. The `execute()` handler at line 312 closes over these.
4. **Delegation A2A call** — `relationTools.ts:459–491`. The `execute()` handler constructs `messageToSend` explicitly including `contextId` (line 464 — the parent's contextId, from closure):
   ```ts
   a2aClient.sendMessage({
     message: {
       role: 'agent',
       parts: [...],
       messageId: generateId(),
       contextId,           // ← parent's contextId
       metadata: delegationMeta,
     },
     configuration: { blocking: false },
   });
   ```
5. **A2A handler receives** — `a2a/handlers.ts:116–151`. Extracts `params.message.contextId`. At line 122: `conversationId: params.message.contextId` — becomes `task.context.conversationId` on the new child task.
6. **Handler fallback chain** — lines 134–151 only activate when `contextId` is missing from the request OR literally `'default'`. In the normal delegation flow from step 4, contextId IS present and IS the parent's value, so fallback never fires.
7. **Child's runtimeContext** — `generateTaskHandler.ts:370–452`. Reads `contextId = task.context?.conversationId` (which is parent's conversationId). At line 452: `conversationId: contextId` — child's `runtimeContext.metadata.conversationId` = parent's conversationId.
8. **Child's `buildSystemPrompt`** — receives the propagated `conversationId` via its `runtimeContext` parameter. When the child's prompt contains `{{$conversation.id}}`, it will resolve to the parent's (user-initiated) conversationId via `runtimeBuiltins`.

## `generateId()` sites are fallbacks, not primary paths

Four sites in `a2a/handlers.ts` contain `contextId: generateId()` (lines 383, 492, 650, 791). These are **fallback generation** for edge cases — missing contextId in request, `'default'` sentinel, or direct A2A calls not going through the delegation tool. None fire in the normal parent → delegate → child path described above.

## Transfer semantics

`transfer` tools (`relationTools.ts:230–286`) don't invoke A2A at all — the transfer artifact is returned to the parent agent's execution loop, which changes `currentAgentId` but stays within the same execution context. The conversationId is preserved implicitly (same loop, same runtimeContext). Transfers are automatically G3-compliant.

## One remaining edge case — defensive only

Child task IDs are generated as `generateId()` alone (`handlers.ts:117`), not encoded as `task_${conversationId}-${requestId}`. This means the fallback regex extraction in `generateTaskHandler.ts:373–375` (which parses conversationId out of the task ID pattern) can't recover if `task.context.conversationId` is somehow lost.

**Blast-radius assessment:** Low. Normal flow populates `task.context.conversationId` correctly (step 5); the regex fallback is belt-and-suspenders. A defensive enhancement would encode conversationId in child task IDs too — subagent's proposal at `handlers.ts:117`:

```ts
const taskId = `task_${effectiveContextId || 'default'}-${generateId()}`;
```

This is a small optional hardening, unrelated to the core feature. Bundle with the spec or defer as adjacent cleanup — user decision.

## Conclusion

**Q2 resolves positively.** The conversationId propagation path we need for G3 already exists in the code. No new propagation work required for the primary use case. The delegated child sub-agent's `buildSystemPrompt` will receive the parent's conversationId in its `runtimeContext.metadata.conversationId` via existing code, and the rendered `{{$conversation.id}}` in the child's prompt will render the correct (user-facing) ID.

**Remaining risk:** Direct A2A JSON-RPC calls from third-party integrations that bypass the inkeep delegation tool and don't pass `contextId` in the message body. These would hit the `generateId()` fallback and yield a synthetic ID. This is a "custom integration" scenario and out of scope for v1 — note in release documentation that the ambient conversationId depends on A2A callers passing `contextId`.
