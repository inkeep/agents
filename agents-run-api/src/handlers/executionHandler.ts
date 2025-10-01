import {
  createMessage,
  createTask,
  type ExecutionContext,
  getActiveAgentForConversation,
  getFullGraph,
  getTask,
  type SendMessageResponse,
  setSpanWithError,
  updateTask,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { tracer } from 'src/utils/tracer.js';
import { A2AClient } from '../a2a/client.js';
import { executeTransfer, isTransferResponse } from '../a2a/transfer.js';
import dbClient from '../data/db/dbClient.js';
import { getLogger } from '../logger.js';
import { graphSessionManager } from '../services/GraphSession.js';
import { agentInitializingOp, completionOp, errorOp } from '../utils/agent-operations.js';
import type { StreamHelper } from '../utils/stream-helpers.js';
import { MCPStreamHelper } from '../utils/stream-helpers.js';
import { registerStreamHelper, unregisterStreamHelper } from '../utils/stream-registry.js';

const logger = getLogger('ExecutionHandler');

interface ExecutionHandlerParams {
  executionContext: ExecutionContext;
  conversationId: string;
  userMessage: string;
  initialAgentId: string;
  requestId: string;
  sseHelper: StreamHelper;
}

interface ExecutionResult {
  success: boolean;
  error?: string;
  iterations: number;
  response?: string; // Optional response for MCP contexts
}

export class ExecutionHandler {
  // Hardcoded error limit - separate from configurable stopWhen
  private readonly MAX_ERRORS = 3;

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
    const { executionContext, conversationId, userMessage, initialAgentId, requestId, sseHelper } =
      params;

    const { tenantId, projectId, graphId, apiKey, baseUrl } = executionContext;

    // Register streamHelper so agents can access it via requestId
    registerStreamHelper(requestId, sseHelper);

    // Create GraphSession for this entire message execution using requestId as the session ID

    graphSessionManager.createSession(requestId, graphId, tenantId, projectId, conversationId);
    logger.info(
      { sessionId: requestId, graphId, conversationId },
      'Created GraphSession for message execution'
    );

    // Initialize status updates if configured
    let graphConfig: any = null;
    try {
      graphConfig = await getFullGraph(dbClient)({ scopes: { tenantId, projectId, graphId } });

      if (graphConfig?.statusUpdates && graphConfig.statusUpdates.enabled !== false) {
        graphSessionManager.initializeStatusUpdates(
          requestId,
          graphConfig.statusUpdates,
          graphConfig.models?.summarizer
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
    let fromAgentId: string | undefined; // Track the agent that executed a transfer

    try {
      // Send agent initializing and ready operations immediately to ensure UI rendering
      await sseHelper.writeOperation(agentInitializingOp(requestId, graphId));

      // Use atomic upsert pattern to handle race conditions properly
      const taskId = `task_${conversationId}-${requestId}`;

      logger.info(
        { taskId, currentAgentId, conversationId, requestId },
        'Attempting to create or reuse existing task'
      );

      try {
        // Try to create the task atomically
        task = await createTask(dbClient)({
          id: taskId,
          tenantId,
          projectId,
          graphId,
          agentId: currentAgentId,
          contextId: conversationId,
          status: 'pending',
          metadata: {
            conversation_id: conversationId,
            message_id: requestId,
            stream_request_id: requestId, // This also serves as the GraphSession ID
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            root_agent_id: initialAgentId,
            agent_id: currentAgentId,
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
        // Handle race condition: if task already exists due to concurrent request,
        // fetch and reuse the existing task instead of failing
        if (
          error?.message?.includes('UNIQUE constraint failed') ||
          error?.message?.includes('PRIMARY KEY constraint failed') ||
          error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
        ) {
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
            // This should not happen, but handle gracefully
            logger.error({ taskId, error }, 'Task constraint failed but task not found');
            throw error;
          }
        } else {
          // Re-throw non-constraint errors
          logger.error({ taskId, error }, 'Failed to create task due to non-constraint error');
          throw error;
        }
      }

      // Debug logging for execution handler (structured logging only)
      logger.debug(
        {
          timestamp: new Date().toISOString(),
          executionType: 'create_initial_task',
          conversationId,
          requestId,
          currentAgentId,
          taskId: Array.isArray(task) ? task[0]?.id : task?.id,
          userMessage: userMessage.substring(0, 100), // Truncate for security
        },
        'ExecutionHandler: Initial task created'
      );
      // If createTask returns an array, get the first element
      if (Array.isArray(task)) task = task[0];

      let currentMessage = userMessage;

      // Get transfer limit from graph configuration
      const maxTransfers = graphConfig?.stopWhen?.transferCountIs ?? 10;

      // Start execution loop
      while (iterations < maxTransfers) {
        iterations++;

        // Stream iteration start
        // Iteration start (data operations removed)

        logger.info(
          { iterations, currentAgentId, graphId, conversationId, fromAgentId },
          `Execution loop iteration ${iterations} with agent ${currentAgentId}, transfer from: ${fromAgentId || 'none'}`
        );

        // Step 1: Determine which agent should handle the message
        const activeAgent = await getActiveAgentForConversation(dbClient)({
          scopes: { tenantId, projectId },
          conversationId,
        });
        logger.info({ activeAgent }, 'activeAgent');
        if (activeAgent && activeAgent.activeAgentId !== currentAgentId) {
          currentAgentId = activeAgent.activeAgentId;
          logger.info({ currentAgentId }, `Updated current agent to: ${currentAgentId}`);

          // Stream agent selection update
          // Agent selection (data operations removed)
        }

        // Step 2: Send A2A message to selected agent
        const agentBaseUrl = `${baseUrl}/agents`;
        const a2aClient = new A2AClient(agentBaseUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'x-inkeep-tenant-id': tenantId,
            'x-inkeep-project-id': projectId,
            'x-inkeep-graph-id': graphId,
            'x-inkeep-agent-id': currentAgentId,
          },
        });

        // Check if agent supports streaming
        // const agentCard = await a2aClient.getAgentCard();
        let messageResponse: SendMessageResponse | null = null;

        // Build message metadata - include fromAgentId only if this is a transfer
        const messageMetadata: any = {
          stream_request_id: requestId, // This also serves as the GraphSession ID
        };
        if (fromAgentId) {
          messageMetadata.fromAgentId = fromAgentId;
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

        // Step 3: Parse A2A message response
        if (!messageResponse?.result) {
          errorCount++;
          logger.error(
            { currentAgentId, iterations, errorCount },
            `No response from agent ${currentAgentId} on iteration ${iterations} (error ${errorCount}/${this.MAX_ERRORS})`
          );

          // Check if we've hit the error limit
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

            graphSessionManager.endSession(requestId);
            unregisterStreamHelper(requestId);
            return { success: false, error: errorMessage, iterations };
          }

          continue;
        }

        // Step 4: Handle transfer messages
        if (isTransferResponse(messageResponse.result)) {
          const transferResponse = messageResponse.result;

          // Extract targetAgentId from transfer response artifacts
          const targetAgentId = (transferResponse as any).artifacts?.[0]?.parts?.[0]?.data
            ?.targetAgentId;

          const transferReason = (transferResponse as any).artifacts?.[0]?.parts?.[1]?.text;

          // Transfer operation (data operations removed)

          logger.info({ targetAgentId, transferReason }, 'transfer response');

          // Update the current message to the transfer reason so as not to duplicate the user message on every transfer
          // including the xml because the fromAgent does not always directly adress the toAgent in its text
          currentMessage = `<transfer_context> ${transferReason} </transfer_context>`;

          const { success, targetAgentId: newAgentId } = await executeTransfer({
            projectId,
            tenantId,
            threadId: conversationId,
            targetAgentId,
          });
          if (success) {
            // Set fromAgentId to track which agent executed this transfer
            fromAgentId = currentAgentId;
            currentAgentId = newAgentId;

            logger.info(
              {
                transferFrom: fromAgentId,
                transferTo: currentAgentId,
                reason: transferReason,
              },
              'Transfer executed, tracking fromAgentId for next iteration'
            );
          }

          // Continue to next iteration with new agent
          continue;
        }

        const responseParts =
          (messageResponse.result as any).artifacts?.flatMap(
            (artifact: any) => artifact.parts || []
          ) || [];
        if (responseParts && responseParts.length > 0) {
          // Log graph session data after completion response
          const graphSessionData = graphSessionManager.getSession(requestId);
          if (graphSessionData) {
            const sessionSummary = graphSessionData.getSummary();
            logger.info(sessionSummary, 'GraphSession data after completion');
          }

          // Process response parts for database storage and A2A protocol
          // NOTE: Do NOT stream content here - agents handle their own streaming
          let textContent = '';
          for (const part of responseParts) {
            const isTextPart = (part.kind === 'text' || part.type === 'text') && part.text;

            if (isTextPart) {
              textContent += part.text;
            }
            // Data parts are already processed by the agent's streaming logic
          }

          // Stream completion operation
          // Completion operation (data operations removed)
          return tracer.startActiveSpan('execution_handler.execute', {}, async (span) => {
            try {
              span.setAttributes({
                'ai.response.content': textContent || 'No response content',
                'ai.response.timestamp': new Date().toISOString(),
                'ai.agent.name': currentAgentId,
              });

              // Store the agent response in the database with both text and parts
              await createMessage(dbClient)({
                id: nanoid(),
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
                agentId: currentAgentId,
                fromAgentId: currentAgentId,
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
                    completed_at: new Date().toISOString(),
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

              // End the GraphSession and clean up resources
              logger.info({}, 'Ending GraphSession and cleaning up');
              graphSessionManager.endSession(requestId);

              // Clean up streamHelper
              logger.info({}, 'Cleaning up streamHelper');
              unregisterStreamHelper(requestId);

              // Extract captured response if using MCPStreamHelper
              let response: string | undefined;
              if (sseHelper instanceof MCPStreamHelper) {
                const captured = sseHelper.getCapturedResponse();
                response = captured.text || 'No response content';
              }

              logger.info({}, 'ExecutionHandler returning success');
              return { success: true, iterations, response };
            } catch (error) {
              setSpanWithError(span, error);
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

        // Check if we've hit the error limit
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

          graphSessionManager.endSession(requestId);
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
              failed_at: new Date().toISOString(),
              error: errorMessage,
            },
          },
        });
      }
      // Clean up GraphSession and streamHelper on error
      graphSessionManager.endSession(requestId);
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
              failed_at: new Date().toISOString(),
              error: errorMessage,
            },
          },
        });
      }
      // Clean up GraphSession and streamHelper on exception
      graphSessionManager.endSession(requestId);
      unregisterStreamHelper(requestId);
      return { success: false, error: errorMessage, iterations };
    }
  }
}
