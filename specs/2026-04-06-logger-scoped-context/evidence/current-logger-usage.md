---
title: Current logger usage patterns and repetition analysis
sources:
  - packages/agents-core/src/utils/logger.ts
  - agents-api/src/domains/run/services/TriggerService.ts
  - agents-api/src/domains/manage/routes/scheduledTriggers.ts
  - agents-api/src/domains/run/session/AgentSession.ts
  - agents-api/src/domains/run/handlers/executionHandler.ts
  - agents-api/src/domains/manage/routes/github.ts
  - agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts
---

## Current API

`PinoLogger` class wraps pino with `error/warn/info/debug(data: any, message: string)`.
`getLogger(name)` returns cached `PinoLogger` instances via `LoggerFactory` singleton.
No child logger support. No scoped context. No ALS integration.

## Repetition patterns

| File | Repeated core fields | Logger calls |
|---|---|---|
| TriggerService.ts | tenantId, projectId, agentId, triggerId, invocationId | 34 |
| scheduledTriggers.ts | tenantId, projectId, agentId, scheduledTriggerId | 32 |
| agentExecutionSteps.ts | requestId, currentSubAgentId, workflowRunId, taskId | 32 |
| AgentSession.ts | sessionId (this.sessionId), artifactId | 48 |
| executionHandler.ts | conversationId, requestId, agentId, taskId | 31 |
| github.ts | tenantId, installationId | 29 |
| evaluationClient.ts | tenantId, projectId (constructor-set) | 126 |
| projectFull.ts (data-access) | tenantId, projectId | 153 |
| agentFull.ts (data-access) | tenantId, projectId, agentId | 167 |

## Quantified impact

- Total logger calls: 2,278
- Calls with ambient (repeatable) fields: 1,207 (53%)
- Calls where entire data object could be removed: 475
- Calls that get shorter (mixed): 732
- Total repeated field instances: 2,081
- Most repeated: tenantId (362), projectId (340), agentId (181), sessionId (162)
