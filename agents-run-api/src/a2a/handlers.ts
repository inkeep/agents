import {
  createMessage,
  createTask,
  executeInBranch,
  generateId,
  getRequestExecutionContext,
  type Message,
  type MessageSendParams,
  type Task,
  TaskState,
  updateTask,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import type { A2ATask, JsonRpcRequest, JsonRpcResponse, RegisteredAgent } from './types';

const logger = getLogger('a2aHandler');

export async function a2aHandler(c: Context, agent: RegisteredAgent): Promise<Response> {
  try {
    const rpcRequest: JsonRpcRequest = c.get('requestBody');

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

    switch (rpcRequest.method) {
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
    const { agentId } = executionContext;
    const ref = executionContext.ref;

    const task: A2ATask = {
      id: generateId(),
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
          custom: { agent_id: agentId || '' },
          ...params.message.metadata,
        },
      },
    };

    let effectiveContextId = params.message?.contextId;

    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = task.context?.conversationId;
    }

    if (!effectiveContextId || effectiveContextId === 'default') {
      if (
        params.message?.metadata?.conversationId &&
        params.message.metadata.conversationId !== 'default'
      ) {
        effectiveContextId = params.message.metadata.conversationId;
      }
    }

    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = 'default';
    }

    let _messageContent = '';
    try {
      if (params.message && Object.keys(params.message).length > 0) {
        _messageContent = JSON.stringify(params.message);
      } else {
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
            subAgentId: agent.subAgentId,
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
        subAgentId: agent.subAgentId,
      },
      'A2A contextId resolution for delegation'
    );
    await executeInBranch(
      {
        dbClient,
        ref,
        autoCommit: true,
        commitMessage: 'Create task for A2A',
      },
      async (db) => {
        await createTask(db)({
          id: task.id,
          tenantId: agent.tenantId,
          projectId: agent.projectId,
          agentId: agentId || '',
          contextId: effectiveContextId,
          status: 'working',
          metadata: {
            conversation_id: effectiveContextId,
            message_id: params.message.messageId || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sub_agent_id: agent.subAgentId,
            agent_id: agentId || '',
            stream_request_id: params.message.metadata?.stream_request_id,
          },
          subAgentId: agent.subAgentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    );

    logger.info({ metadata: params.message.metadata }, 'message metadata');

    if (
      params.message.metadata?.fromSubAgentId ||
      params.message.metadata?.fromExternalAgentId ||
      params.message.metadata?.fromTeamAgentId
    ) {
      const messageText = params.message.parts
        .filter((part) => part.kind === 'text' && 'text' in part && part.text)
        .map((part) => (part as any).text)
        .join(' ');

      try {
        const messageData: any = {
          id: generateId(),
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

        if (params.message.metadata?.fromSubAgentId) {
          messageData.fromSubAgentId = params.message.metadata.fromSubAgentId;
          messageData.toSubAgentId = agent.subAgentId;
        } else if (params.message.metadata?.fromExternalAgentId) {
          messageData.fromExternalAgentId = params.message.metadata.fromExternalAgentId;
          messageData.toSubAgentId = agent.subAgentId;
        } else if (params.message.metadata?.fromTeamAgentId) {
          messageData.fromTeamAgentId = params.message.metadata.fromTeamAgentId;
          messageData.toTeamAgentId = agent.subAgentId;
        }

        await executeInBranch(
          {
            dbClient,
            ref,
            autoCommit: true,
            commitMessage: 'Create A2A message',
          },
          async (db) => {
            await createMessage(db)(messageData);
          }
        );

        logger.info(
          {
            fromSubAgentId: params.message.metadata.fromSubAgentId,
            fromExternalAgentId: params.message.metadata.fromExternalAgentId,
            fromTeamAgentId: params.message.metadata.fromTeamAgentId,
            toSubAgentId: agent.subAgentId,
            toTeamAgentId: params.message.metadata.fromTeamAgentId ? agent.subAgentId : undefined,
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
            fromSubAgentId: params.message.metadata.fromSubAgentId,
            fromExternalAgentId: params.message.metadata.fromExternalAgentId,
            fromTeamAgentId: params.message.metadata.fromTeamAgentId,
            toSubAgentId: agent.subAgentId,
            conversationId: effectiveContextId,
          },
          'Failed to store A2A message in database'
        );
      }
    }

    const result = await agent.taskHandler(task);

    await executeInBranch(
      {
        dbClient,
        ref,
        autoCommit: true,
        commitMessage: 'Update task for A2A',
      },
      async (db) => {
        await updateTask(db)({
          taskId: task.id,
          data: {
            status: result.status.state.toLowerCase(),
            metadata: {
              conversation_id: params.message.contextId || '',
              message_id: params.message.messageId || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              sub_agent_id: agent.subAgentId,
              agent_id: agentId || '',
            },
          },
        });
      }
    );

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
                artifactId: generateId(),
                parts: [
                  {
                    kind: 'data',
                    data: {
                      type: 'transfer',
                      targetSubAgentId: transferPart.data.targetSubAgentId,
                      fromSubAgentId: transferPart.data.fromSubAgentId,
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

    const taskStatus = {
      state: result.status.state,
      timestamp: new Date().toISOString(),
    };

    if (params.configuration?.blocking === false) {
      const taskResponse: Task = {
        id: task.id,
        contextId: params.message.contextId || generateId(),
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
    const messageResponse: Message = {
      messageId: generateId(),
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
    const { agentId } = executionContext;

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

    const task: A2ATask = {
      id: generateId(),
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
          custom: { agent_id: agentId || '' },
        },
      },
    };

    return streamSSE(c, async (stream) => {
      try {
        const initialTask: Task = {
          id: task.id,
          contextId: params.message.contextId || generateId(),
          status: {
            state: TaskState.Working,
            timestamp: new Date().toISOString(),
          },
          artifacts: [],
          kind: 'task',
        };

        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: initialTask,
            id: request.id,
          }),
        });

        const result = await agent.taskHandler(task);

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
            await stream.writeSSE({
              data: JSON.stringify({
                jsonrpc: '2.0',
                result: {
                  type: 'transfer',
                  target: transferPart.data.targetSubAgentId,
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

        const messageResponse: Message = {
          messageId: generateId(),
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

    const task: Task = {
      id: params.id,
      contextId: generateId(),
      status: {
        state: TaskState.Completed,
        timestamp: new Date().toISOString(),
      },
      artifacts: [
        {
          artifactId: generateId(),
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
    result: { status: 'ready', subAgentId: agent.subAgentId },
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
          contextId: generateId(),
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
