import type { FullExecutionContext, McpTool, Part, ResolvedRef } from '@inkeep/agents-core';
import { SPAN_NAMES } from '@inkeep/agents-core';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { getWritable } from 'workflow';
import { env } from '../../../../env';
import { getLogger, runWithLogContext } from '../../../../logger';
import { setSpanWithError, tracer } from '../../utils/tracer';

const logger = getLogger('agentExecutionSteps');

export type AgentExecutionStepPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  userMessage: string;
  messageParts?: Part[];
  requestId: string;
  resolvedRef: ResolvedRef;
  forwardedHeaders?: Record<string, string>;
  outputFormat?: 'sse' | 'vercel';
  emitOperations?: boolean;
  /** User ID for user-scoped credential lookups (from authenticated user session) */
  userId?: string;
};

export type CallLlmStepParams = {
  payload: AgentExecutionStepPayload;
  currentSubAgentId: string;
  isFirstMessage: boolean;
  workflowRunId: string;
  streamNamespace?: string;
  taskId: string;
  isPostApproval?: boolean;
  denialRedirects?: DenialRedirect[];
};

export type DelegatedApprovalContext = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  subAgentId: string;
};

export type CallLlmResult =
  | { type: 'completion' }
  | { type: 'transfer'; targetSubAgentId: string }
  | {
      type: 'tool_calls';
      toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }>;
      delegatedApproval?: DelegatedApprovalContext;
    };

export type ExecuteToolStepParams = {
  payload: AgentExecutionStepPayload;
  currentSubAgentId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  workflowRunId: string;
  streamNamespace?: string;
  preApproved?: boolean;
  approvalReason?: string;
  taskId: string;
  delegatedApproval?: DelegatedApprovalContext;
  delegatedApprovalDecision?: { approved: boolean; reason?: string };
};

export type DenialRedirect = { toolName: string; toolCallId: string; reason: string };

export type ExecuteToolResult =
  | { type: 'completed'; denial?: DenialRedirect }
  | { type: 'needs_approval' };

async function buildAgentForStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  currentSubAgentId: string;
  resolvedRef: ResolvedRef;
  forwardedHeaders?: Record<string, string>;
  userId?: string;
}): Promise<{
  agent: InstanceType<typeof import('../../agents/Agent').Agent>;
  executionContext: FullExecutionContext;
  defaultSubAgentId: string;
}> {
  const { tenantId, projectId, agentId, currentSubAgentId, resolvedRef, forwardedHeaders, userId } =
    params;

  const {
    CredentialStoreRegistry,
    createDefaultCredentialStores,
    getFullProjectWithRelationIds,
    getMcpToolById,
    withRef,
  } = await import('@inkeep/agents-core');
  const { default: manageDbPool } = await import('../../../../data/db/manageDbPool');
  const { Agent } = await import('../../agents/Agent');
  const { createTaskHandlerConfig } = await import('../../agents/generateTaskHandler');
  const { buildTransferRelationConfig } = await import('../../agents/relationTools');

  const credentialStoreRegistry = new CredentialStoreRegistry(createDefaultCredentialStores());
  const {
    enhanceInternalRelation,
    enhanceTeamRelation,
    getArtifactComponentsForSubAgent,
    getDataComponentsForSubAgent,
    getSkillsForSubAgent,
    getSubAgentRelations,
    getToolsForSubAgent,
  } = await import('../../utils/project');

  const project = await withRef(manageDbPool, resolvedRef, (db) =>
    getFullProjectWithRelationIds(db)({ scopes: { tenantId, projectId } })
  );
  if (!project) throw new Error(`Project ${projectId} not found`);

  const agentEntry = project.agents?.[agentId];
  if (!agentEntry) throw new Error(`Agent ${agentId} not found in project`);

  const defaultSubAgentId = agentEntry.defaultSubAgentId;
  if (!defaultSubAgentId) throw new Error(`Agent ${agentId} has no default sub-agent`);

  const currentSubAgent = agentEntry.subAgents?.[currentSubAgentId];
  if (!currentSubAgent) throw new Error(`Sub-agent ${currentSubAgentId} not found`);

  const apiBaseUrl = env.INKEEP_AGENTS_API_URL;
  // Durable mode bakes `/run/agents` into baseUrl because buildAgentForStep passes
  // executionContext.baseUrl directly to AgentConfig and A2AClient configs. The non-durable
  // executionHandler keeps the bare root and appends `/run/agents` locally, but here we
  // set it once to avoid repeating the suffix in every config builder below.
  const agentBaseUrl = `${apiBaseUrl}/run/agents`;

  const executionContext: FullExecutionContext = {
    tenantId,
    projectId,
    agentId,
    baseUrl: agentBaseUrl,
    apiKey: env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '',
    apiKeyId: 'durable-execution',
    resolvedRef,
    project,
    metadata: {},
  };

  const taskHandlerConfig = await createTaskHandlerConfig({
    executionContext,
    subAgentId: currentSubAgentId,
    baseUrl: executionContext.baseUrl,
    apiKey: executionContext.apiKey,
  });

  const { externalRelations, teamRelations, transferRelations, internalDelegateRelations } =
    getSubAgentRelations({ agent: agentEntry, project, subAgent: currentSubAgent });

  const allInternalRelations = [...transferRelations, ...internalDelegateRelations];

  const toolsForAgent = getToolsForSubAgent({
    agent: agentEntry,
    project,
    subAgent: currentSubAgent,
  });
  const dataComponents = getDataComponentsForSubAgent({ project, subAgent: currentSubAgent });
  const artifactComponents = getArtifactComponentsForSubAgent({
    project,
    subAgent: currentSubAgent,
  });

  const enhancedInternalRelations = allInternalRelations.map((relation) => {
    try {
      return enhanceInternalRelation({ relation, agent: agentEntry, project });
    } catch {
      return relation;
    }
  });

  const enhancedTeamRelations = teamRelations.map((relation) => {
    try {
      return enhanceTeamRelation({ relation, project });
    } catch {
      return relation;
    }
  });

  const toolsForAgentResult: McpTool[] =
    (await withRef(manageDbPool, resolvedRef, async (db) => {
      return await Promise.all(
        toolsForAgent.map(async (item) => {
          const mcpTool = await getMcpToolById(db)({
            scopes: { tenantId, projectId },
            toolId: item.tool.id,
            credentialStoreRegistry,
            userId,
          });
          if (!mcpTool) throw new Error(`Tool not found: ${item.tool.id}`);
          if (item.relationshipId) mcpTool.relationshipId = item.relationshipId;
          if (item.selectedTools && item.selectedTools.length > 0) {
            const selectedToolsSet = new Set(item.selectedTools);
            mcpTool.availableTools =
              mcpTool.availableTools?.filter((t) => selectedToolsSet.has(t.name)) || [];
          }
          return mcpTool;
        })
      );
    })) ?? [];

  const skills = getSkillsForSubAgent({ project, subAgent: currentSubAgent });

  const { agentSchema } = taskHandlerConfig;
  const prompt = 'prompt' in agentSchema ? agentSchema.prompt || undefined : '';
  const models = 'models' in agentSchema ? agentSchema.models : undefined;
  const stopWhen = 'stopWhen' in agentSchema ? agentSchema.stopWhen : undefined;

  const agent = new Agent(
    {
      id: currentSubAgentId,
      tenantId,
      projectId,
      agentId,
      agentName: agentEntry.name,
      baseUrl: executionContext.baseUrl,
      apiKey: executionContext.apiKey,
      userId,
      name: currentSubAgent.name,
      description: currentSubAgent.description || '',
      prompt,
      models: models || undefined,
      stopWhen: stopWhen || undefined,
      skills,
      subAgentRelations: enhancedInternalRelations.map((relation) => ({
        id: relation.id,
        tenantId,
        projectId,
        agentId,
        baseUrl: executionContext.baseUrl,
        apiKey: executionContext.apiKey,
        name: relation.name,
        description: relation.description || undefined,
        prompt: '',
        delegateRelations: [],
        subAgentRelations: [],
        transferRelations: [],
        relationId: relation.relationId,
      })),
      transferRelations: await Promise.all(
        enhancedInternalRelations
          .filter((r) => r.relationType === 'transfer')
          .map((r) =>
            buildTransferRelationConfig(
              {
                relation: r,
                executionContext,
                baseUrl: executionContext.baseUrl,
                apiKey: executionContext.apiKey,
              },
              credentialStoreRegistry
            )
          )
      ),
      delegateRelations: [
        ...enhancedInternalRelations
          .filter((r) => r.relationType === 'delegate')
          .map((r) => ({
            type: 'internal' as const,
            config: {
              id: r.id,
              relationId: r.relationId,
              tenantId,
              projectId,
              agentId,
              baseUrl: executionContext.baseUrl,
              apiKey: executionContext.apiKey,
              name: r.name,
              description: r.description || undefined,
              prompt: '',
              delegateRelations: [],
              subAgentRelations: [],
              transferRelations: [],
              tools: [],
              project,
            },
          })),
        ...externalRelations.map((r) => ({
          type: 'external' as const,
          config: {
            id: r.externalAgent.id,
            name: r.externalAgent.name,
            description: r.externalAgent.description || '',
            ref: resolvedRef,
            baseUrl: r.externalAgent.baseUrl,
            headers: r.headers,
            credentialReferenceId: r.externalAgent.credentialReferenceId,
            relationId: r.relationId,
            relationType: 'delegate',
          },
        })),
        ...enhancedTeamRelations.map((r) => ({
          type: 'team' as const,
          config: {
            id: r.targetAgent.id,
            ref: resolvedRef,
            name: r.targetAgent.name,
            description: r.targetAgent.description || '',
            baseUrl: executionContext.baseUrl,
            headers: r.headers,
            relationId: r.relationId,
          },
        })),
      ],
      tools: toolsForAgentResult,
      functionTools: [],
      dataComponents,
      artifactComponents,
      contextConfigId: taskHandlerConfig.contextConfigId,
      conversationHistoryConfig: taskHandlerConfig.conversationHistoryConfig,
      forwardedHeaders,
    },
    executionContext,
    credentialStoreRegistry
  );

  return { agent, executionContext, defaultSubAgentId };
}

export async function markWorkflowRunningStep(params: {
  payload: AgentExecutionStepPayload;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { payload, workflowRunId } = params;

  const { createWorkflowExecution } = await import('@inkeep/agents-core');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  await createWorkflowExecution(runDbClient)({
    id: workflowRunId,
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    agentId: payload.agentId,
    conversationId: payload.conversationId,
    requestId: payload.requestId,
    status: 'running',
  });

  logger.info(
    { workflowRunId, conversationId: payload.conversationId },
    'Workflow execution marked as running'
  );
}

export async function initializeTaskStep(params: {
  payload: AgentExecutionStepPayload;
}): Promise<{ taskId: string; defaultSubAgentId: string; maxTransfers: number }> {
  'use step';
  const { payload } = params;
  const { tenantId, projectId, agentId, conversationId, requestId } = payload;

  const {
    AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT,
    createTask,
    getFullProjectWithRelationIds,
    isUniqueConstraintError,
    withRef,
  } = await import('@inkeep/agents-core');
  const { default: manageDbPool } = await import('../../../../data/db/manageDbPool');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  const project = await withRef(manageDbPool, payload.resolvedRef, (db) =>
    getFullProjectWithRelationIds(db)({ scopes: { tenantId, projectId } })
  );
  if (!project) throw new Error(`Project ${projectId} not found`);

  const agentEntry = project.agents?.[agentId];
  if (!agentEntry) throw new Error(`Agent ${agentId} not found in project`);

  const defaultSubAgentId = agentEntry.defaultSubAgentId;
  if (!defaultSubAgentId) throw new Error(`Agent ${agentId} has no default sub-agent`);

  const maxTransfers =
    agentEntry.stopWhen?.transferCountIs ?? AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT;

  const taskId = `task_${conversationId}-${requestId}`;

  try {
    await createTask(runDbClient)({
      id: taskId,
      tenantId,
      projectId,
      agentId,
      subAgentId: defaultSubAgentId,
      contextId: conversationId,
      status: 'pending',
      ref: payload.resolvedRef,
      metadata: {
        conversation_id: conversationId,
        message_id: requestId,
        stream_request_id: requestId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        root_sub_agent_id: defaultSubAgentId,
        sub_agent_id: defaultSubAgentId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.info({ taskId }, 'Task already exists, reusing');
    } else {
      throw error;
    }
  }

  logger.info({ taskId, defaultSubAgentId, maxTransfers }, 'Task initialized');
  return { taskId, defaultSubAgentId, maxTransfers };
}

export async function callLlmStep(params: CallLlmStepParams): Promise<CallLlmResult> {
  'use step';

  const {
    payload,
    currentSubAgentId,
    isFirstMessage,
    workflowRunId,
    streamNamespace,
    taskId,
    isPostApproval,
    denialRedirects,
  } = params;
  const {
    tenantId,
    projectId,
    agentId,
    conversationId,
    userMessage,
    messageParts,
    requestId,
    forwardedHeaders,
    emitOperations,
    outputFormat,
  } = payload;

  return runWithLogContext(
    { requestId, currentSubAgentId, workflowRunId, conversationId },
    async () => {
      logger.info(
        {
          isFirstMessage,
          streamNamespace,
          taskId,
          isPostApproval,
          denialRedirectCount: denialRedirects?.length,
        },
        'callLlmStep starting'
      );

      const { createMessage, generateId, updateTask } = await import('@inkeep/agents-core');
      const { default: runDbClient } = await import('../../../../data/db/runDbClient');
      const { WritableBackedHonoSSEStream, WritableBackedVercelWriter } = await import(
        '../../stream/durable-stream-helper'
      );
      const { createSSEStreamHelper, createVercelStreamHelper } = await import(
        '../../stream/stream-helpers'
      );
      const { registerStreamHelper, unregisterStreamHelper } = await import(
        '../../stream/stream-registry'
      );
      const { agentSessionManager } = await import('../../session/AgentSession');
      const { agentInitializingOp, completionOp, errorOp } = await import(
        '../../utils/agent-operations'
      );
      const { executeTransfer } = await import('../../a2a/transfer');
      const { triggerConversationEvaluation } = await import(
        '../../../evals/services/conversationEvaluation'
      );
      const { hasToolCallWithPrefix } = await import('../../agents/agent-types');

      const { agent, executionContext } = await buildAgentForStep({
        tenantId,
        projectId,
        agentId,
        currentSubAgentId,
        resolvedRef: payload.resolvedRef,
        forwardedHeaders,
        userId: payload.userId,
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const writable = getWritable<Uint8Array>(
        streamNamespace ? { namespace: streamNamespace } : {}
      );
      let closeable:
        | InstanceType<typeof WritableBackedHonoSSEStream>
        | InstanceType<typeof WritableBackedVercelWriter>;
      let sseHelper:
        | ReturnType<typeof createSSEStreamHelper>
        | ReturnType<typeof createVercelStreamHelper>;

      if (outputFormat === 'vercel') {
        const vercelWriter = new WritableBackedVercelWriter(writable);
        closeable = vercelWriter;
        sseHelper = createVercelStreamHelper(vercelWriter);
        logger.debug('callLlmStep: using Vercel stream writer');
      } else {
        const writableStream = new WritableBackedHonoSSEStream(writable);
        closeable = writableStream;
        sseHelper = createSSEStreamHelper(writableStream, requestId, timestamp);
        logger.debug('callLlmStep: using SSE stream writer');
      }

      agent.streamRequestId = requestId;
      agent.runContext.streamHelper = sseHelper;
      agent.setConversationId(conversationId);
      agent.setDurableWorkflowRunId(workflowRunId);

      if (denialRedirects && denialRedirects.length > 0) {
        agent.runContext.taskDenialRedirects.push(...denialRedirects);
      }

      registerStreamHelper(requestId, sseHelper);
      agentSessionManager.createSession(requestId, executionContext, conversationId);
      if (emitOperations) {
        agentSessionManager.enableEmitOperations(requestId);
      }

      logger.debug({ conversationId }, 'callLlmStep: session and stream registered');

      let isTerminal = false;

      const bag = (propagation.getBaggage(otelContext.active()) ?? propagation.createBaggage())
        .setEntry('conversation.id', { value: conversationId })
        .setEntry('tenant.id', { value: tenantId })
        .setEntry('project.id', { value: projectId })
        .setEntry('agent.id', { value: agentId });
      const ctxWithBaggage = propagation.setBaggage(otelContext.active(), bag);

      return otelContext.with(ctxWithBaggage, async () => {
        try {
          if (isFirstMessage && emitOperations) {
            await sseHelper.writeOperation(agentInitializingOp(requestId, agentId));
          }

          let postApprovalText: string | undefined;
          if (isPostApproval) {
            if (denialRedirects && denialRedirects.length > 0) {
              const sanitize = (s: string) => s.replace(/\n/g, ' ').slice(0, 200);
              const redirectSummary = denialRedirects
                .map((d) => `- ${d.toolName}: ${sanitize(d.reason)}`)
                .join('\n');
              postApprovalText = `The user denied one or more tool calls. Here is what was denied and why:\n${redirectSummary}\nThe tool results above reflect the denial. Respond to the user acknowledging their redirect.`;
            } else {
              postApprovalText =
                'Continue the conversation. The tool results above contain the information needed to respond to the user.';
            }
          }

          const userParts: Part[] = postApprovalText
            ? [{ kind: 'text', text: postApprovalText }]
            : isFirstMessage && messageParts && messageParts.length > 0
              ? messageParts
              : [{ kind: 'text', text: userMessage }];

          const runtimeContext = {
            contextId: conversationId,
            metadata: {
              conversationId,
              threadId: conversationId,
              taskId,
              streamRequestId: requestId,
              apiKey: executionContext.apiKey,
            },
          };

          logger.debug({ userPartsCount: userParts.length }, 'callLlmStep: calling agent.generate');

          let response: Awaited<ReturnType<typeof agent.generate>> | undefined;
          try {
            response = await agent.generate(userParts, runtimeContext);
          } catch (generateError: unknown) {
            if (!agent.runContext.pendingDurableApproval) {
              throw generateError;
            }
            logger.info(
              {
                error:
                  generateError instanceof Error ? generateError.message : String(generateError),
                errorName: generateError instanceof Error ? generateError.name : undefined,
              },
              'callLlmStep: agent.generate threw during durable approval flow, continuing with pending approval'
            );
          }

          if (response) {
            logger.info(
              {
                finishReason: response.finishReason,
                stepCount: response.steps?.length,
                hasText: !!response.text,
                hasPendingApproval: !!agent.runContext.pendingDurableApproval,
              },
              'callLlmStep: agent.generate completed'
            );
          }

          const pendingApproval = agent.runContext.pendingDurableApproval;
          if (pendingApproval) {
            logger.info(
              {
                toolName: pendingApproval.toolName,
                toolCallId: pendingApproval.toolCallId,
                isDelegated: !!pendingApproval.delegatedApproval,
              },
              'callLlmStep: tool needs approval, suspending'
            );

            if (pendingApproval.delegatedApproval) {
              const da = pendingApproval.delegatedApproval;
              try {
                await sseHelper.writeToolInputStart({
                  toolCallId: da.toolCallId,
                  toolName: da.toolName,
                });
                const inputText = JSON.stringify(da.args ?? {});
                for (let i = 0; i < inputText.length; i += 16) {
                  await sseHelper.writeToolInputDelta({
                    toolCallId: da.toolCallId,
                    inputTextDelta: inputText.slice(i, i + 16),
                  });
                }
                await sseHelper.writeToolInputAvailable({
                  toolCallId: da.toolCallId,
                  toolName: da.toolName,
                  input: (da.args ?? {}) as Record<string, unknown>,
                });
                await sseHelper.writeToolApprovalRequest({
                  approvalId: `aitxt-${da.toolCallId}`,
                  toolCallId: da.toolCallId,
                  toolName: da.toolName,
                  input: (da.args ?? {}) as Record<string, unknown>,
                });
              } catch (sseError) {
                logger.error(
                  { error: sseError, toolCallId: da.toolCallId, toolName: da.toolName },
                  'Failed to stream delegated approval request — workflow will suspend but client may not see approval UI'
                );
                throw new Error(
                  `Failed to deliver delegated approval request for ${da.toolName}: ${sseError instanceof Error ? sseError.message : String(sseError)}`
                );
              }
            }

            isTerminal = true;
            return {
              type: 'tool_calls' as const,
              toolCalls: [
                {
                  toolCallId: pendingApproval.toolCallId,
                  toolName: pendingApproval.toolName,
                  args: pendingApproval.args,
                },
              ],
              ...(pendingApproval.delegatedApproval
                ? { delegatedApproval: pendingApproval.delegatedApproval }
                : {}),
            };
          }

          if (!response) {
            throw new Error(
              'agent.generate() produced no response and no pending approval was found'
            );
          }

          if (hasToolCallWithPrefix('transfer_to_')(response)) {
            const transferReason =
              response.steps?.[response.steps.length - 1]?.text || response.text || '';

            const lastStepToolCallsForTransfer =
              (
                response.steps?.at(-1) as
                  | { toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }> }
                  | undefined
              )?.toolCalls ?? [];

            const transferToolCall = lastStepToolCallsForTransfer.find((tc) =>
              tc.toolName.startsWith('transfer_to_')
            );
            const targetSubAgentId = transferToolCall?.toolName.slice('transfer_to_'.length);

            logger.info(
              { targetSubAgentId, transferToolName: transferToolCall?.toolName },
              'callLlmStep: transfer detected'
            );

            if (targetSubAgentId) {
              await createMessage(runDbClient)({
                scopes: { tenantId, projectId },
                data: {
                  id: generateId(),
                  conversationId,
                  role: 'agent',
                  content: {
                    text: transferReason,
                    parts: [{ kind: 'text', text: transferReason }],
                  },
                  visibility: 'user-facing',
                  messageType: 'chat',
                  fromSubAgentId: currentSubAgentId,
                  taskId,
                },
              });

              await executeTransfer({
                projectId,
                tenantId,
                threadId: conversationId,
                agentId,
                targetSubAgentId,
                ref: payload.resolvedRef,
              });

              return { type: 'transfer' as const, targetSubAgentId };
            }
          }

          const textContent =
            response.steps?.[response.steps.length - 1]?.text || response.text || '';

          return await tracer.startActiveSpan(
            SPAN_NAMES.EXECUTION_HANDLER_EXECUTE,
            {},
            async (span) => {
              try {
                span.setAttributes({
                  'ai.response.content': textContent || 'No response content',
                  'ai.response.timestamp': new Date().toISOString(),
                  'subAgent.name': agent.runContext.config.name,
                  'subAgent.id': currentSubAgentId,
                });

                await createMessage(runDbClient)({
                  scopes: { tenantId, projectId },
                  data: {
                    id: generateId(),
                    conversationId,
                    role: 'agent',
                    content: {
                      text: textContent,
                      parts: response.formattedContent?.parts?.map(
                        (part: { kind: string; text?: string; data?: unknown }) => ({
                          kind: part.kind,
                          text: part.kind === 'text' ? part.text : undefined,
                          data:
                            part.kind === 'data'
                              ? (part.data as Record<string, unknown>)
                              : undefined,
                        })
                      ) || [{ kind: 'text', text: textContent }],
                    },
                    visibility: 'user-facing',
                    messageType: 'chat',
                    fromSubAgentId: currentSubAgentId,
                    taskId,
                  },
                });

                await updateTask(runDbClient)({
                  taskId,
                  scopes: { tenantId, projectId },
                  data: {
                    status: 'completed',
                    metadata: {
                      completed_at: new Date().toISOString(),
                      response: { text: textContent, hasText: !!textContent },
                    },
                  },
                });

                if (emitOperations) {
                  await sseHelper.writeOperation(completionOp(currentSubAgentId, 1));
                }
                await sseHelper.complete();

                triggerConversationEvaluation({
                  tenantId,
                  projectId,
                  conversationId,
                  resolvedRef: payload.resolvedRef,
                }).catch((evalError) => {
                  logger.error(
                    { error: evalError, conversationId },
                    'Failed to trigger conversation evaluation (non-blocking)'
                  );
                });

                logger.info('callLlmStep: completion');
                isTerminal = true;
                return { type: 'completion' as const };
              } finally {
                span.end();
              }
            }
          );
        } catch (error) {
          const rootCause = error instanceof Error ? error : new Error(String(error));
          logger.error(
            { error: rootCause.message, stack: rootCause.stack },
            'callLlmStep: error during execution'
          );

          isTerminal = true;
          return await tracer.startActiveSpan(
            SPAN_NAMES.EXECUTION_HANDLER_EXECUTE,
            {},
            async (span) => {
              try {
                span.setAttributes({
                  'ai.response.content':
                    'Hmm.. It seems I might be having some issues right now. Please clear the chat and try again.',
                  'ai.response.timestamp': new Date().toISOString(),
                  'subAgent.name': agent.runContext.config.name,
                  'subAgent.id': currentSubAgentId,
                });
                setSpanWithError(span, rootCause);

                try {
                  await sseHelper.writeOperation(
                    errorOp(`Execution error: ${rootCause.message}`, currentSubAgentId || 'system')
                  );
                  await sseHelper.complete();
                } catch (streamErr) {
                  logger.warn({ error: streamErr }, 'Failed to write error to SSE stream');
                }

                try {
                  await updateTask(runDbClient)({
                    taskId,
                    scopes: { tenantId, projectId },
                    data: {
                      status: 'failed',
                      metadata: {
                        failed_at: new Date().toISOString(),
                        error: rootCause.message,
                      },
                    },
                  });
                } catch (taskErr) {
                  logger.warn({ error: taskErr, taskId }, 'Failed to update task status to failed');
                }

                throw error;
              } finally {
                span.end();
              }
            }
          );
        } finally {
          await agentSessionManager.endSession(requestId);
          unregisterStreamHelper(requestId);
          await agent.cleanup();
          if (isTerminal) {
            await closeable.close();
            logger.debug('callLlmStep: stream closed (terminal)');
          } else {
            closeable.releaseLock();
            logger.debug('callLlmStep: stream lock released (non-terminal)');
          }
        }
      });
    }
  );
}

export async function executeToolStep(params: ExecuteToolStepParams): Promise<ExecuteToolResult> {
  'use step';

  const {
    payload,
    currentSubAgentId,
    toolCallId,
    toolName,
    args,
    workflowRunId,
    streamNamespace,
    preApproved,
    approvalReason,
  } = params;
  const {
    tenantId,
    projectId,
    agentId,
    conversationId,
    requestId,
    forwardedHeaders,
    emitOperations,
    outputFormat,
  } = payload;

  return runWithLogContext(
    { requestId, currentSubAgentId, toolName, toolCallId, workflowRunId, conversationId },
    async () => {
      logger.info({ streamNamespace }, 'executeToolStep starting');

      const { WritableBackedHonoSSEStream, WritableBackedVercelWriter } = await import(
        '../../stream/durable-stream-helper'
      );
      const { createSSEStreamHelper, createVercelStreamHelper } = await import(
        '../../stream/stream-helpers'
      );
      const { registerStreamHelper, unregisterStreamHelper } = await import(
        '../../stream/stream-registry'
      );
      const { agentSessionManager } = await import('../../session/AgentSession');
      const { loadToolsAndPrompts } = await import('../../agents/generation/tool-loading');
      const { errorOp } = await import('../../utils/agent-operations');

      const { agent, executionContext } = await buildAgentForStep({
        tenantId,
        projectId,
        agentId,
        currentSubAgentId,
        resolvedRef: payload.resolvedRef,
        forwardedHeaders,
        userId: payload.userId,
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const writable = getWritable<Uint8Array>(
        streamNamespace ? { namespace: streamNamespace } : {}
      );
      let closeable:
        | InstanceType<typeof WritableBackedHonoSSEStream>
        | InstanceType<typeof WritableBackedVercelWriter>;
      let sseHelper:
        | ReturnType<typeof createSSEStreamHelper>
        | ReturnType<typeof createVercelStreamHelper>;

      if (outputFormat === 'vercel') {
        const vercelWriter = new WritableBackedVercelWriter(writable);
        closeable = vercelWriter;
        sseHelper = createVercelStreamHelper(vercelWriter);
        logger.debug('executeToolStep: using Vercel stream writer');
      } else {
        const writableStream = new WritableBackedHonoSSEStream(writable);
        closeable = writableStream;
        sseHelper = createSSEStreamHelper(writableStream, requestId, timestamp);
        logger.debug('executeToolStep: using SSE stream writer');
      }

      registerStreamHelper(requestId, sseHelper);
      agentSessionManager.createSession(requestId, executionContext, conversationId);
      if (emitOperations) {
        agentSessionManager.enableEmitOperations(requestId);
      }

      const bag = (propagation.getBaggage(otelContext.active()) ?? propagation.createBaggage())
        .setEntry('conversation.id', { value: conversationId })
        .setEntry('tenant.id', { value: tenantId })
        .setEntry('project.id', { value: projectId })
        .setEntry('agent.id', { value: agentId });
      const ctxWithBaggage = propagation.setBaggage(otelContext.active(), bag);

      return otelContext.with(ctxWithBaggage, async () => {
        try {
          agent.streamRequestId = requestId;
          agent.runContext.streamHelper = sseHelper;
          agent.setConversationId(conversationId);
          agent.setDurableWorkflowRunId(workflowRunId);

          if (preApproved !== undefined) {
            agent.setApprovedToolCalls({
              [toolCallId]: { approved: preApproved, reason: approvalReason },
            });
          }

          if (params.delegatedApproval && params.delegatedApprovalDecision) {
            agent.runContext.delegatedToolApproval = {
              toolCallId: params.delegatedApproval.toolCallId,
              toolName: params.delegatedApproval.toolName,
              approved: params.delegatedApprovalDecision.approved,
              reason: params.delegatedApprovalDecision.reason,
            };
          }

          const sessionId = requestId;
          const runtimeContext = {
            contextId: conversationId,
            metadata: {
              conversationId,
              threadId: conversationId,
              taskId: params.taskId,
              streamRequestId: requestId,
              apiKey: executionContext.apiKey,
            },
          };

          logger.debug({ sessionId }, 'executeToolStep: loading tools and executing');

          const { sanitizedTools } = await loadToolsAndPrompts(
            agent.runContext,
            sessionId,
            requestId,
            runtimeContext
          );

          const toolDef = sanitizedTools[toolName];
          if (!toolDef) {
            throw new Error(`Tool '${toolName}' not found in agent tool set`);
          }

          return await tracer.startActiveSpan(
            SPAN_NAMES.DURABLE_TOOL_EXECUTION,
            {},
            async (span) => {
              try {
                span.setAttributes({
                  'subAgent.id': currentSubAgentId,
                  'tool.name': toolName,
                  'tool.callId': toolCallId,
                  'tool.response.timestamp': new Date().toISOString(),
                });

                await (
                  toolDef as { execute?: (args: unknown, context?: unknown) => Promise<unknown> }
                ).execute?.(args, { toolCallId });

                if (agent.runContext.pendingDurableApproval) {
                  logger.info('executeToolStep: tool requires approval');
                  return { type: 'needs_approval' as const };
                }

                const denials = agent.getTaskDenialRedirects();
                const denial = denials.length > 0 ? denials[denials.length - 1] : undefined;

                logger.info({ denied: !!denial }, 'executeToolStep: tool executed');
                return { type: 'completed' as const, denial };
              } finally {
                span.end();
              }
            }
          );
        } catch (error) {
          const rootCause = error instanceof Error ? error : new Error(String(error));
          logger.error(
            { error: rootCause.message, stack: rootCause.stack },
            'executeToolStep: error during tool execution'
          );

          return await tracer.startActiveSpan(
            SPAN_NAMES.DURABLE_TOOL_EXECUTION,
            {},
            async (span) => {
              try {
                span.setAttributes({
                  'tool.response.content': `Tool execution error: ${rootCause.message}`,
                  'tool.response.timestamp': new Date().toISOString(),
                  'subAgent.id': currentSubAgentId,
                  'tool.name': toolName,
                  'tool.callId': toolCallId,
                });
                setSpanWithError(span, rootCause);

                try {
                  await sseHelper.writeOperation(
                    errorOp(
                      `Tool execution error: ${rootCause.message}`,
                      currentSubAgentId || 'system'
                    )
                  );
                } catch (streamErr) {
                  logger.warn({ error: streamErr }, 'Failed to write error to SSE stream');
                }

                const { updateTask } = await import('@inkeep/agents-core');
                const { default: runDbClient } = await import('../../../../data/db/runDbClient');
                try {
                  await updateTask(runDbClient)({
                    taskId: params.taskId,
                    scopes: { tenantId, projectId },
                    data: {
                      status: 'failed',
                      metadata: {
                        failed_at: new Date().toISOString(),
                        error: rootCause.message,
                      },
                    },
                  });
                } catch (taskErr) {
                  logger.warn(
                    { error: taskErr, taskId: params.taskId },
                    'Failed to update task status to failed'
                  );
                }

                throw error;
              } finally {
                span.end();
              }
            }
          );
        } finally {
          await agentSessionManager.endSession(requestId);
          unregisterStreamHelper(requestId);
          await agent.cleanup();
          closeable.releaseLock();
          logger.debug('executeToolStep: stream lock released');
        }
      });
    }
  );
}

export async function markWorkflowSuspendedStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
  continuationStreamNamespace: string;
  pendingToolApproval?: {
    toolCallId: string;
    toolName: string;
    args: unknown;
    isDelegated: boolean;
  };
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId, continuationStreamNamespace, pendingToolApproval } =
    params;

  const { updateWorkflowExecutionStatus } = await import('@inkeep/agents-core');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'suspended',
    metadata: {
      continuationStreamNamespace,
      ...(pendingToolApproval ? { pendingToolApproval } : {}),
    },
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as suspended (awaiting tool approval)');
}

export async function markWorkflowResumingStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId } = params;

  const { updateWorkflowExecutionStatus } = await import('@inkeep/agents-core');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'running',
    metadata: { pendingToolApproval: null },
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as running (resuming after approval)');
}

export async function markWorkflowCompleteStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId } = params;

  const { updateWorkflowExecutionStatus } = await import('@inkeep/agents-core');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'completed',
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as completed');
}

export async function markWorkflowFailedStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
  error: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId, error } = params;

  const { updateWorkflowExecutionStatus } = await import('@inkeep/agents-core');
  const { default: runDbClient } = await import('../../../../data/db/runDbClient');

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'failed',
    metadata: { error },
  });

  logger.info({ workflowRunId, error }, 'Workflow execution marked as failed');
}
