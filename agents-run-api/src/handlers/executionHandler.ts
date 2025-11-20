import {
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT,
  createMessage,
  createTask,
  type ExecutionContext,
  generateId,
  getActiveAgentForConversation,
  getFullAgent,
  getTask,
  type SendMessageResponse,
  setSpanWithError,
  updateTask,
} from '@inkeep/agents-core';
import { tracer } from 'src/utils/tracer.js';
import { A2AClient } from '../a2a/client.js';
import { executeTransfer } from '../a2a/transfer.js';
import { extractTransferData, isTransferTask } from '../a2a/types.js';
import { AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS } from '../constants/execution-limits';
import dbClient from '../data/db/dbClient.js';
import { getLogger } from '../logger.js';
import { agentSessionManager } from '../services/AgentSession.js';
import { conversationEvaluationTrigger } from '../services/ConversationEvaluationTrigger.js';
import { agentInitializingOp, completionOp, errorOp } from '../utils/agent-operations.js';
import type { StreamHelper } from '../utils/stream-helpers.js';
import { BufferingStreamHelper } from '../utils/stream-helpers.js';
import { registerStreamHelper, unregisterStreamHelper } from '../utils/stream-registry.js';

const logger = getLogger('ExecutionHandler');

interface ExecutionHandlerParams {
  executionContext: ExecutionContext;
  conversationId: string;
  userMessage: string;
  initialAgentId: string;
  requestId: string;
  sseHelper: StreamHelper;
  emitOperations?: boolean;
  datasetRunConfigId?: string; // Optional flag to indicate this is a dataset run conversation
}

interface ExecutionResult {
  success: boolean;
  error?: string;
  iterations: number;
  response?: string; // Optional response for MCP contexts
}

export class ExecutionHandler {
  private readonly MAX_ERRORS = AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS;

  /**
   * performs exeuction loop
   *
   * Do up to limit of MAX_ITERATIONS
   *
   * 1. lookup active agent for thread
   * 2. Send A2A message to selected agent
   * 3. Parse A2A message response
   * 4. Handle transfer messages (if any)
   * 5. Handle completion messages (if any)
   * 6. If no valid response or transfer, return error
   * @param params
   * @returns
   */
  async execute(params: ExecutionHandlerParams): Promise<ExecutionResult> {
    const {
      executionContext,
      conversationId,
      userMessage,
      initialAgentId,
      requestId,
      sseHelper,
      emitOperations,
    } = params;

    const { tenantId, projectId, agentId, apiKey, baseUrl } = executionContext;

    registerStreamHelper(requestId, sseHelper);

    agentSessionManager.createSession(requestId, agentId, tenantId, projectId, conversationId);

    if (emitOperations) {
      agentSessionManager.enableEmitOperations(requestId);
    }

    logger.info(
      { sessionId: requestId, agentId, conversationId, emitOperations },
      'Created AgentSession for message execution'
    );

    let agentConfig: any = null;
    try {
      agentConfig = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId },
      });

      if (agentConfig?.statusUpdates && agentConfig.statusUpdates.enabled !== false) {
        agentSessionManager.initializeStatusUpdates(
          requestId,
          agentConfig.statusUpdates,
          agentConfig.models?.summarizer
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        '❌ Failed to initialize status updates, continuing without them'
      );
    }

    let currentAgentId = initialAgentId;
    let iterations = 0;
    let errorCount = 0;
    let task: any = null;
    let fromSubAgentId: string | undefined; // Track the agent that executed a transfer

    try {
      await sseHelper.writeOperation(agentInitializingOp(requestId, agentId));

      const taskId = `task_${conversationId}-${requestId}`;

      logger.info(
        { taskId, currentAgentId, conversationId, requestId },
        'Attempting to create or reuse existing task'
      );

      try {
        task = await createTask(dbClient)({
          id: taskId,
          tenantId,
          projectId,
          agentId,
          subAgentId: currentAgentId,
          contextId: conversationId,
          status: 'pending',
          metadata: {
            conversation_id: conversationId,
            message_id: requestId,
            stream_request_id: requestId, // This also serves as the AgentSession ID
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            root_sub_agent_id: initialAgentId,
            sub_agent_id: currentAgentId,
          },
        });

        logger.info(
          {
            taskId,
            createdTaskMetadata: Array.isArray(task) ? task[0]?.metadata : task?.metadata,
          },
          'Task created with metadata'
        );
      } catch (error: any) {
        // Handle duplicate task (PostgreSQL unique constraint violation)
        if (error?.cause?.code === '23505') {
          logger.info(
            { taskId, error: error.message },
            'Task already exists, fetching existing task'
          );

          const existingTask = await getTask(dbClient)({ id: taskId });
          if (existingTask) {
            task = existingTask;
            logger.info(
              { taskId, existingTask },
              'Successfully reused existing task from race condition'
            );
          } else {
            logger.error({ taskId, error }, 'Task constraint failed but task not found');
            throw error;
          }
        } else {
          logger.error({ taskId, error }, 'Failed to create task due to non-constraint error');
          throw error;
        }
      }

      logger.debug(
        {
          timestamp: new Date(),
          executionType: 'create_initial_task',
          conversationId,
          agentId,
          requestId,
          currentAgentId,
          taskId: Array.isArray(task) ? task[0]?.id : task?.id,
          userMessage: userMessage.substring(0, 100), // Truncate for security
        },
        'ExecutionHandler: Initial task created'
      );
      if (Array.isArray(task)) task = task[0];

      let currentMessage = userMessage;

      const maxTransfers =
        agentConfig?.stopWhen?.transferCountIs ?? AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT;

      while (iterations < maxTransfers) {
        iterations++;

        logger.info(
          { iterations, currentAgentId, agentId, conversationId, fromSubAgentId },
          `Execution loop iteration ${iterations} with agent ${currentAgentId}, transfer from: ${fromSubAgentId || 'none'}`
        );

        const activeAgent = await getActiveAgentForConversation(dbClient)({
          scopes: { tenantId, projectId },
          conversationId,
        });
        logger.info({ activeAgent }, 'activeAgent');
        if (activeAgent && activeAgent.activeSubAgentId !== currentAgentId) {
          currentAgentId = activeAgent.activeSubAgentId;
          logger.info({ currentAgentId }, `Updated current agent to: ${currentAgentId}`);
        }

        const agentBaseUrl = `${baseUrl}/agents`;
        const a2aClient = new A2AClient(agentBaseUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'x-inkeep-tenant-id': tenantId,
            'x-inkeep-project-id': projectId,
            'x-inkeep-agent-id': agentId,
            'x-inkeep-sub-agent-id': currentAgentId,
          },
        });

        let messageResponse: SendMessageResponse | null = null;

        const messageMetadata: any = {
          stream_request_id: requestId, // This also serves as the AgentSession ID
        };
        if (fromSubAgentId) {
          messageMetadata.fromSubAgentId = fromSubAgentId;
        }

        messageResponse = await a2aClient.sendMessage({
          message: {
            role: 'user',
            parts: [
              {
                kind: 'text',
                text: currentMessage,
              },
            ],
            messageId: `${requestId}-iter-${iterations}`,
            kind: 'message',
            contextId: conversationId,
            metadata: messageMetadata,
          },
          configuration: {
            acceptedOutputModes: ['text', 'text/plain'],
            blocking: false,
          },
        });

        if (!messageResponse?.result) {
          errorCount++;
          logger.error(
            { currentAgentId, iterations, errorCount },
            `No response from agent ${currentAgentId} on iteration ${iterations} (error ${errorCount}/${this.MAX_ERRORS})`
          );

          if (errorCount >= this.MAX_ERRORS) {
            const errorMessage = `Maximum error limit (${this.MAX_ERRORS}) reached`;
            logger.error({ maxErrors: this.MAX_ERRORS, errorCount }, errorMessage);

            await sseHelper.writeOperation(errorOp(errorMessage, currentAgentId || 'system'));

            if (task) {
              await updateTask(dbClient)({
                taskId: task.id,
                data: {
                  status: 'failed',
                  metadata: {
                    ...task.metadata,
                    failed_at: new Date().toISOString(),
                    error: errorMessage,
                  },
                },
              });
            }

            agentSessionManager.endSession(requestId);
            unregisterStreamHelper(requestId);
            return { success: false, error: errorMessage, iterations };
          }

          continue;
        }

        if (isTransferTask(messageResponse.result)) {
          const transferData = extractTransferData(messageResponse.result);

          if (!transferData) {
            logger.error(
              { result: messageResponse.result },
              'Transfer detected but no transfer data found'
            );
            continue;
          }

          const { targetSubAgentId, fromSubAgentId: transferFromAgent } = transferData;

          const firstArtifact = messageResponse.result.artifacts[0];
          const transferReason =
            firstArtifact?.parts[1]?.kind === 'text'
              ? firstArtifact.parts[1].text
              : 'Transfer initiated';

          logger.info({ targetSubAgentId, transferReason, transferFromAgent }, 'Transfer response');

          // Store the transfer response as an assistant message in conversation history
          await createMessage(dbClient)({
            id: generateId(),
            tenantId,
            projectId,
            conversationId,
            role: 'agent',
            content: {
              text: transferReason,
              parts: [
                {
                  kind: 'text',
                  text: transferReason,
                },
              ],
            },
            visibility: 'user-facing',
            messageType: 'chat',
            fromSubAgentId: currentAgentId,
            taskId: task.id,
          });

          // Keep the original user message and add a continuation prompt
          currentMessage =
            currentMessage +
            '\n\nPlease continue this conversation seamlessly. The previous response in conversation history was from another internal agent, but you must continue as if YOU made that response. All responses must appear as one unified agent - do not repeat what was already communicated.';

          const { success, targetSubAgentId: newAgentId } = await executeTransfer({
            projectId,
            tenantId,
            threadId: conversationId,
            targetSubAgentId,
          });

          if (success) {
            fromSubAgentId = currentAgentId;
            currentAgentId = newAgentId;

            logger.info(
              {
                transferFrom: fromSubAgentId,
                transferTo: currentAgentId,
                reason: transferReason,
              },
              'Transfer executed, tracking fromSubAgentId for next iteration'
            );
          }

          continue;
        }

        let responseParts = [];

        if ((messageResponse.result as any).streamedContent?.parts) {
          responseParts = (messageResponse.result as any).streamedContent.parts;
          logger.info(
            { partsCount: responseParts.length },
            'Using streamed content for conversation history'
          );
        } else {
          responseParts =
            (messageResponse.result as any).artifacts?.flatMap(
              (artifact: any) => artifact.parts || []
            ) || [];
          logger.info(
            { partsCount: responseParts.length },
            'Using artifacts for conversation history (fallback)'
          );
        }

        if (responseParts && responseParts.length > 0) {
          const agentSessionData = agentSessionManager.getSession(requestId);
          if (agentSessionData) {
            const sessionSummary = agentSessionData.getSummary();
            logger.info(sessionSummary, 'AgentSession data after completion');
          }

          let textContent = '';
          for (const part of responseParts) {
            const isTextPart = (part.kind === 'text' || part.type === 'text') && part.text;

            if (isTextPart) {
              textContent += part.text;
            }
          }

          // Stream completion operation
          // Completion operation (data operations removed)
          return tracer.startActiveSpan('execution_handler.execute', {}, async (span) => {
            try {
              span.setAttributes({
                'ai.response.content': textContent || 'No response content',
                'ai.response.timestamp': new Date().toISOString(),
                'subAgent.name': agentConfig?.subAgents[currentAgentId]?.name,
                'subAgent.id': currentAgentId,
              });

              // Store the agent response in the database with both text and parts
              await createMessage(dbClient)({
                id: generateId(),
                tenantId,
                projectId,
                conversationId,
                role: 'agent',
                content: {
                  text: textContent || undefined,
                  parts: responseParts.map((part: any) => ({
                    type: part.kind === 'text' ? 'text' : 'data',
                    text: part.kind === 'text' ? part.text : undefined,
                    data: part.kind === 'data' ? JSON.stringify(part.data) : undefined,
                  })),
                },
                visibility: 'user-facing',
                messageType: 'chat',
                fromSubAgentId: currentAgentId,
                taskId: task.id,
              });

              // Mark task as completed
              const updateTaskStart = Date.now();
              await updateTask(dbClient)({
                taskId: task.id,
                data: {
                  status: 'completed',
                  metadata: {
                    ...task.metadata,
                    completed_at: new Date(),
                    response: {
                      text: textContent,
                      parts: responseParts,
                      hasText: !!textContent,
                      hasData: responseParts.some((p: any) => p.kind === 'data'),
                    },
                  },
                },
              });
              const updateTaskEnd = Date.now();
              logger.info(
                { duration: updateTaskEnd - updateTaskStart },
                'Completed updateTask operation'
              );

              // Send completion data operation before ending session
              await sseHelper.writeOperation(completionOp(currentAgentId, iterations));

              // Complete the stream to flush any queued operations
              await sseHelper.complete();

              // End the AgentSession and clean up resources
              logger.info({}, 'Ending AgentSession and cleaning up');
              agentSessionManager.endSession(requestId);

              // Clean up streamHelper
              logger.info({}, 'Cleaning up streamHelper');
              unregisterStreamHelper(requestId);

              // Extract captured response if using BufferingStreamHelper
              let response: string | undefined;
              if (sseHelper instanceof BufferingStreamHelper) {
                const captured = sseHelper.getCapturedResponse();
                response = captured.text || 'No response content';
              }

              logger.info({}, 'ExecutionHandler returning success');

              // Check if this conversation is from a dataset run
              // If it is, skip automatic evaluation trigger - dataset runs trigger evaluations explicitly
              // Check if this is a dataset run conversation via header flag only
              const isDatasetRunConversation = !!params.datasetRunConfigId;

              if (isDatasetRunConversation) {
                logger.debug(
                  {
                    conversationId,
                    tenantId,
                    projectId,
                    hasHeaderFlag: !!params.datasetRunConfigId,
                  },
                  'Skipping automatic evaluation trigger - conversation is from dataset run (will be triggered explicitly)'
                );
              } else {
                // Trigger evaluations asynchronously (fire-and-forget) only for non-dataset-run conversations
                conversationEvaluationTrigger
                  .triggerEvaluationsForConversation({
                    tenantId,
                    projectId,
                    conversationId,
                  })
                  .catch((error) => {
                    logger.error(
                      {
                        error: error instanceof Error ? error.message : String(error),
                        conversationId,
                        tenantId,
                        projectId,
                      },
                      'Failed to trigger evaluations for conversation (non-blocking)'
                    );
                  });
              }

              return { success: true, iterations, response };
            } catch (error) {
              setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
              throw error;
            } finally {
              span.end();
            }
          });
        }

        // If we get here, we didn't get a valid response or transfer
        errorCount++;
        logger.warn(
          { iterations, errorCount },
          `No valid response or transfer on iteration ${iterations} (error ${errorCount}/${this.MAX_ERRORS})`
        );

        if (errorCount >= this.MAX_ERRORS) {
          const errorMessage = `Maximum error limit (${this.MAX_ERRORS}) reached`;
          logger.error({ maxErrors: this.MAX_ERRORS, errorCount }, errorMessage);

          await sseHelper.writeOperation(errorOp(errorMessage, currentAgentId || 'system'));

          if (task) {
            await updateTask(dbClient)({
              taskId: task.id,
              data: {
                status: 'failed',
                metadata: {
                  ...task.metadata,
                  failed_at: new Date(),
                  error: errorMessage,
                },
              },
            });
          }

          agentSessionManager.endSession(requestId);
          unregisterStreamHelper(requestId);
          return { success: false, error: errorMessage, iterations };
        }
      }

      // Max transfers reached
      const errorMessage = `Maximum transfer limit (${maxTransfers}) reached without completion`;
      logger.error({ maxTransfers, iterations }, errorMessage);

      // Send error operation for max iterations reached
      await sseHelper.writeOperation(errorOp(errorMessage, currentAgentId || 'system'));

      // Mark task as failed
      if (task) {
        await updateTask(dbClient)({
          taskId: task.id,
          data: {
            status: 'failed',
            metadata: {
              ...task.metadata,
              failed_at: new Date(),
              error: errorMessage,
            },
          },
        });
      }
      // Clean up AgentSession and streamHelper on error
      agentSessionManager.endSession(requestId);
      unregisterStreamHelper(requestId);
      return { success: false, error: errorMessage, iterations };
    } catch (error) {
      logger.error({ error }, 'Error in execution handler');
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';

      // Stream error operation
      // Send error operation for execution exception
      await sseHelper.writeOperation(
        errorOp(`Execution error: ${errorMessage}`, currentAgentId || 'system')
      );

      // Mark task as failed
      if (task) {
        await updateTask(dbClient)({
          taskId: task.id,
          data: {
            status: 'failed',
            metadata: {
              ...task.metadata,
              failed_at: new Date(),
              error: errorMessage,
            },
          },
        });
      }
      // Clean up AgentSession and streamHelper on exception
      agentSessionManager.endSession(requestId);
      unregisterStreamHelper(requestId);
      return { success: false, error: errorMessage, iterations };
    }
  }
}
