import {
  createMessage,
  createTask,
  getRequestExecutionContext,
  type Message,
  type MessageSendParams,
  type Task,
  TaskState,
  updateTask,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import type { A2ATask, JsonRpcRequest, JsonRpcResponse, RegisteredAgent } from './types';

const logger = getLogger('a2aHandler');

export async function a2aHandler(c: Context, agent: RegisteredAgent): Promise<Response> {
  try {
    const rpcRequest: JsonRpcRequest = c.get('requestBody');

    // Validate JSON-RPC format
    if (rpcRequest.jsonrpc !== '2.0') {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request - must be JSON-RPC 2.0',
        },
        id: rpcRequest.id,
      } satisfies JsonRpcResponse);
    }

    // Handle different A2A methods (including Google's protocol methods)
    switch (rpcRequest.method) {
      // Google A2A Protocol Methods
      case 'message/send':
        return await handleMessageSend(c, agent, rpcRequest);

      case 'message/stream':
        return await handleMessageStream(c, agent, rpcRequest);

      case 'tasks/get':
        return await handleTasksGet(c, agent, rpcRequest);

      case 'tasks/cancel':
        return await handleTasksCancel(c, agent, rpcRequest);

      case 'tasks/resubscribe':
        return await handleTasksResubscribe(c, agent, rpcRequest);

      // Legacy/simplified methods
      case 'agent.invoke':
        return await handleAgentInvoke(c, agent, rpcRequest);

      case 'agent.getCapabilities':
        return await handleGetCapabilities(c, agent, rpcRequest);

      case 'agent.getStatus':
        return await handleGetStatus(c, agent, rpcRequest);

      default:
        return c.json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${rpcRequest.method}`,
          },
          id: rpcRequest.id,
        } satisfies JsonRpcResponse);
    }
  } catch (error) {
    console.error('A2A Handler Error:', error);
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
      },
      id: null,
    } satisfies JsonRpcResponse);
  }
}

async function handleMessageSend(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const params = request.params as MessageSendParams;
    const executionContext = getRequestExecutionContext(c);
    const { graphId } = executionContext;

    // Convert to our internal task format
    const task: A2ATask = {
      id: nanoid(),
      input: {
        parts: params.message.parts.map((part) => ({
          kind: part.kind,
          text: part.kind === 'text' ? part.text : undefined,
          data: part.kind === 'data' ? part.data : undefined,
        })),
      },
      context: {
        conversationId: params.message.contextId,
        metadata: {
          blocking: params.configuration?.blocking ?? false,
          custom: { graph_id: graphId || '' },
          // Pass through streaming metadata from the original message
          ...params.message.metadata,
        },
      },
    };

    // Enhanced contextId resolution for delegation
    let effectiveContextId = params.message?.contextId;

    // If contextId is missing or 'default', try to get it from task.context
    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = task.context?.conversationId;
    }

    // If still missing, try to extract from metadata
    if (!effectiveContextId || effectiveContextId === 'default') {
      if (
        params.message?.metadata?.conversationId &&
        params.message.metadata.conversationId !== 'default'
      ) {
        effectiveContextId = params.message.metadata.conversationId;
      }
    }

    // Final fallback
    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = 'default';
    }

    // Enhanced message content handling
    let _messageContent = '';
    try {
      if (params.message && Object.keys(params.message).length > 0) {
        _messageContent = JSON.stringify(params.message);
      } else {
        // Fallback: create a minimal message structure
        _messageContent = JSON.stringify({
          role: 'agent',
          parts: [{ text: 'Delegation task', kind: 'text' }],
          contextId: effectiveContextId,
          messageId: task.id,
          kind: 'message',
        });
        logger.warn(
          {
            taskId: task.id,
            agentId: agent.agentId,
            originalMessage: params.message,
          },
          'Created fallback message content for empty delegation message'
        );
      }
    } catch (error) {
      logger.error({ error, taskId: task.id }, 'Failed to serialize message');
      _messageContent = JSON.stringify({
        error: 'Failed to serialize message',
        taskId: task.id,
        contextId: effectiveContextId,
        parts: [{ text: 'Error in delegation', kind: 'text' }],
      });
    }

    logger.info(
      {
        originalContextId: params.message.contextId,
        taskContextId: task.context?.conversationId,
        metadataContextId: params.message.metadata?.conversationId,
        finalContextId: effectiveContextId,
        agentId: agent.agentId,
      },
      'A2A contextId resolution for delegation'
    );

    // --- Persist the task in the DB ---
    await createTask(dbClient)({
      id: task.id,
      tenantId: agent.tenantId,
      projectId: agent.projectId,
      graphId: graphId || '',
      contextId: effectiveContextId,
      status: 'working',
      metadata: {
        conversation_id: effectiveContextId,
        message_id: params.message.messageId || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agent_id: agent.agentId,
        graph_id: graphId || '',
        stream_request_id: params.message.metadata?.stream_request_id,
      },
      agentId: agent.agentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    logger.info({ metadata: params.message.metadata }, 'message metadata');

    // --- Store A2A message in database if this is agent-to-agent communication ---
    // TODO: we need to identify external agent requests through propoer auth headers
    if (params.message.metadata?.fromAgentId || params.message.metadata?.fromExternalAgentId) {
      const messageText = params.message.parts
        .filter((part) => part.kind === 'text' && 'text' in part && part.text)
        .map((part) => (part as any).text)
        .join(' ');

      try {
        const messageData: any = {
          id: nanoid(),
          tenantId: agent.tenantId,
          projectId: agent.projectId,
          conversationId: effectiveContextId,
          role: 'agent',
          content: {
            text: messageText,
          },
          visibility: params.message.metadata?.fromExternalAgentId ? 'external' : 'internal',
          messageType: 'a2a-request',
          taskId: task.id,
        };

        // Set appropriate agent tracking fields
        if (params.message.metadata?.fromAgentId) {
          // Internal agent communication
          messageData.fromAgentId = params.message.metadata.fromAgentId;
          messageData.toAgentId = agent.agentId;
        } else if (params.message.metadata?.fromExternalAgentId) {
          // External agent communication
          messageData.fromExternalAgentId = params.message.metadata.fromExternalAgentId;
          messageData.toAgentId = agent.agentId;
        }

        await createMessage(dbClient)(messageData);

        logger.info(
          {
            fromAgentId: params.message.metadata.fromAgentId,
            fromExternalAgentId: params.message.metadata.fromExternalAgentId,
            toAgentId: agent.agentId,
            conversationId: effectiveContextId,
            messageType: 'a2a-request',
            taskId: task.id,
          },
          'A2A message stored in database'
        );
      } catch (error) {
        logger.error(
          {
            error,
            fromAgentId: params.message.metadata.fromAgentId,
            fromExternalAgentId: params.message.metadata.fromExternalAgentId,
            toAgentId: agent.agentId,
            conversationId: effectiveContextId,
          },
          'Failed to store A2A message in database'
        );
      }
    }

    // Execute the task
    const result = await agent.taskHandler(task);

    // --- Update the task in the DB with result ---
    await updateTask(dbClient)({
      taskId: task.id,
      data: {
        status: result.status.state.toLowerCase(),
        metadata: {
          conversation_id: params.message.contextId || '',
          message_id: params.message.messageId || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          agent_id: agent.agentId,
          graph_id: graphId || '',
        },
      },
    });

    // Check if the result contains a transfer indication
    const transferArtifact = result.artifacts?.find((artifact) =>
      artifact.parts?.some(
        (part) =>
          part.kind === 'data' &&
          part.data &&
          typeof part.data === 'object' &&
          part.data.type === 'transfer'
      )
    );

    if (transferArtifact) {
      const transferPart = transferArtifact.parts?.find(
        (part) =>
          part.kind === 'data' &&
          part.data &&
          typeof part.data === 'object' &&
          part.data.type === 'transfer'
      );

      if (transferPart && transferPart.kind === 'data' && transferPart.data) {
        logger.info({ transferPart }, 'transferPart');
        // Return a transfer response instead of normal task/message response
        return c.json({
          jsonrpc: '2.0',
          result: {
            kind: 'task',
            contextId: params.message.contextId,
            id: task.id,
            status: {
              state: TaskState.Completed,
              timestamp: new Date().toISOString(),
            },
            artifacts: [
              {
                artifactId: nanoid(),
                parts: [
                  {
                    kind: 'data',
                    data: {
                      type: 'transfer',
                      targetAgentId: transferPart.data.target,
                    },
                  },
                  {
                    kind: 'text',
                    text: transferPart.data.reason || 'Agent requested transfer',
                  },
                ],
              },
            ],
          },
          id: request.id,
        });
      }
    }

    // Convert A2ATaskResult status to schema TaskStatus
    const taskStatus = {
      state: result.status.state,
      timestamp: new Date().toISOString(),
      // Don't include message field since it expects Message object, not string
    };

    // Convert back to Google A2A format
    if (params.configuration?.blocking === false) {
      // Return a Task for non-blocking requests
      const taskResponse: Task = {
        id: task.id,
        contextId: params.message.contextId || nanoid(),
        status: taskStatus,
        artifacts: result.artifacts,
        kind: 'task',
      };

      return c.json({
        jsonrpc: '2.0',
        result: taskResponse,
        id: request.id,
      });
    }
    // Return a Message for blocking requests
    const messageResponse: Message = {
      messageId: nanoid(),
      parts: result.artifacts?.[0]?.parts || [
        {
          kind: 'text',
          text: 'Task completed successfully',
        },
      ],
      role: 'agent',
      taskId: task.id,
      contextId: params.message.contextId,
      kind: 'message',
    };

    return c.json({
      jsonrpc: '2.0',
      result: messageResponse,
      id: request.id,
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error during message send',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}

async function handleMessageStream(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const params = request.params as MessageSendParams;
    const executionContext = getRequestExecutionContext(c);
    const { graphId } = executionContext;

    // Check if agent supports streaming
    if (!agent.agentCard.capabilities.streaming) {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32604,
          message: 'Agent does not support streaming',
        },
        id: request.id,
      } satisfies JsonRpcResponse);
    }

    // Convert to our internal task format
    const task: A2ATask = {
      id: nanoid(),
      input: {
        parts: params.message.parts.map((part) => ({
          kind: part.kind,
          text: part.kind === 'text' ? part.text : undefined,
          data: part.kind === 'data' ? part.data : undefined,
        })),
      },
      context: {
        conversationId: params.message.contextId,
        metadata: {
          blocking: false, // Streaming is always non-blocking
          custom: { graph_id: graphId || '' },
        },
      },
    };

    // Return SSE stream
    return streamSSE(c, async (stream) => {
      try {
        // Initial task acknowledgment
        const initialTask: Task = {
          id: task.id,
          contextId: params.message.contextId || nanoid(),
          status: {
            state: TaskState.Working,
            timestamp: new Date().toISOString(),
          },
          artifacts: [],
          kind: 'task',
        };

        // Send initial task status
        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: initialTask,
            id: request.id,
          }),
        });

        // Execute the task with streaming
        const result = await agent.taskHandler(task);

        // Check for transfer first
        const transferArtifact = result.artifacts?.find((artifact) =>
          artifact.parts?.some(
            (part) =>
              part.kind === 'data' &&
              part.data &&
              typeof part.data === 'object' &&
              part.data.type === 'transfer'
          )
        );

        if (transferArtifact) {
          const transferPart = transferArtifact.parts?.find(
            (part) =>
              part.kind === 'data' &&
              part.data &&
              typeof part.data === 'object' &&
              part.data.type === 'transfer'
          );

          if (transferPart && transferPart.kind === 'data' && transferPart.data) {
            // Stream transfer response
            await stream.writeSSE({
              data: JSON.stringify({
                jsonrpc: '2.0',
                result: {
                  type: 'transfer',
                  target: transferPart.data.target,
                  task_id: task.id,
                  reason: transferPart.data.reason || 'Agent requested transfer',
                  original_message: transferPart.data.original_message,
                  context: {
                    conversationId: params.message.contextId,
                    tenantId: agent.tenantId,
                    transfer_context: result.artifacts,
                  },
                },
                id: request.id,
              }),
            });
            return;
          }
        }

        // Stream regular message response
        const messageResponse: Message = {
          messageId: nanoid(),
          parts: result.artifacts?.[0]?.parts || [
            {
              kind: 'text',
              text: 'Task completed successfully',
            },
          ],
          role: 'agent',
          taskId: task.id,
          contextId: params.message.contextId,
          kind: 'message',
        };

        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: messageResponse,
            id: request.id,
          }),
        });

        // Send final task completion status
        const completedTask: Task = {
          ...initialTask,
          status: {
            state: TaskState.Completed,
            timestamp: new Date().toISOString(),
          },
          artifacts: result.artifacts,
        };

        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: completedTask,
            id: request.id,
          }),
        });
      } catch (error) {
        console.error('Error in stream execution:', error);

        // Send error as SSE event
        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error during streaming execution',
              data: error instanceof Error ? error.message : 'Unknown error',
            },
            id: request.id,
          }),
        });
      }
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error during message stream setup',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}

async function handleTasksGet(
  c: Context,
  _agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const params = request.params as { id: string };

    // For now, return a mock task since we don't have persistent storage
    const task: Task = {
      id: params.id,
      contextId: nanoid(),
      status: {
        state: TaskState.Completed,
        timestamp: new Date().toISOString(),
      },
      artifacts: [
        {
          artifactId: nanoid(),
          parts: [
            {
              kind: 'text',
              text: `Task ${params.id} completed successfully`,
            },
          ],
        },
      ],
      kind: 'task',
    };

    return c.json({
      jsonrpc: '2.0',
      result: task,
      id: request.id,
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error getting task',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}

async function handleTasksCancel(
  c: Context,
  _agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const _params = request.params as { id: string };

    // For now, just return success
    return c.json({
      jsonrpc: '2.0',
      result: { success: true },
      id: request.id,
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error canceling task',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}

async function handleAgentInvoke(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const task: A2ATask = request.params;
    const result = await agent.taskHandler(task);

    return c.json({
      jsonrpc: '2.0',
      result,
      id: request.id,
    } satisfies JsonRpcResponse);
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error during agent invocation',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}

async function handleGetCapabilities(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  return c.json({
    jsonrpc: '2.0',
    result: agent.agentCard.capabilities,
    id: request.id,
  } satisfies JsonRpcResponse);
}

async function handleGetStatus(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  return c.json({
    jsonrpc: '2.0',
    result: { status: 'ready', agentId: agent.agentId },
    id: request.id,
  } satisfies JsonRpcResponse);
}

async function handleTasksResubscribe(
  c: Context,
  agent: RegisteredAgent,
  request: JsonRpcRequest
): Promise<Response> {
  try {
    const params = request.params as { taskId: string };

    // Check if agent supports streaming
    if (!agent.agentCard.capabilities.streaming) {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32604,
          message: 'Agent does not support streaming for resubscription',
        },
        id: request.id,
      } satisfies JsonRpcResponse);
    }

    // For now, return SSE stream that immediately provides task status
    // In a full implementation, this would reconnect to an existing task's stream
    return streamSSE(c, async (stream) => {
      try {
        // Mock task status for resubscription
        const task: Task = {
          id: params.taskId,
          contextId: nanoid(),
          status: {
            state: TaskState.Completed,
            timestamp: new Date().toISOString(),
          },
          artifacts: [],
          kind: 'task',
        };

        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: task,
            id: request.id,
          }),
        });
      } catch (error) {
        console.error('Error in task resubscription:', error);

        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error during task resubscription',
              data: error instanceof Error ? error.message : 'Unknown error',
            },
            id: request.id,
          }),
        });
      }
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error during task resubscription setup',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
      id: request.id,
    } satisfies JsonRpcResponse);
  }
}
