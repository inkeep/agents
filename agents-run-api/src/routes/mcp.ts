import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@alcyone-labs/modelcontextprotocol-sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@alcyone-labs/modelcontextprotocol-sdk/server/streamableHttp.js';
import type { CallToolResult } from '@alcyone-labs/modelcontextprotocol-sdk/types.js';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { DatabaseClient, ExecutionContext } from '@inkeep/agents-core';
import {
  type CredentialStoreRegistry,
  contextValidationMiddleware,
  createMessage,
  createOrGetConversation,
  executeInBranch,
  generateId,
  getAgentWithDefaultSubAgent,
  getConversation,
  getConversationId,
  getRequestExecutionContext,
  getSubAgentById,
  HeadersScopeSchema,
  handleContextResolution,
  type ResolvedRef,
  updateConversation,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { ExecutionHandler } from '../handlers/executionHandler';
import { getLogger } from '../logger';
import { createMCPStreamHelper } from '../utils/stream-helpers';

const logger = getLogger('mcp');

/**
 * Singleton mock response object for spoof initialization
 */
class MockResponseSingleton {
  private static instance: MockResponseSingleton;
  private mockRes: any;

  private constructor() {
    this.mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: function (name: string, value: string) {
        this.headers[name] = value;
      },
      getHeaders: function () {
        return this.headers;
      },
      end: () => {},
      write: () => {},
      writeHead: () => {},
    };
  }

  static getInstance(): MockResponseSingleton {
    if (!MockResponseSingleton.instance) {
      MockResponseSingleton.instance = new MockResponseSingleton();
    }
    return MockResponseSingleton.instance;
  }

  getMockResponse(): any {
    this.mockRes.headers = {};
    this.mockRes.statusCode = 200;
    return this.mockRes;
  }
}

/**
 * Creates a spoof initialization message with the given protocol version
 * Extracted as a pure function for better testability and reuse
 */
const createSpoofInitMessage = (mcpProtocolVersion?: string) => ({
  method: 'initialize',
  params: {
    protocolVersion: mcpProtocolVersion || '2025-06-18',
    capabilities: {
      tools: true,
      prompts: true,
      resources: false,
      logging: false,
      roots: { listChanged: false },
    },
    clientInfo: {
      name: 'inkeep-mcp-server',
      version: '1.0.0',
    },
  },
  jsonrpc: '2.0',
  id: 0,
});

/**
 * Spoofs an initialization message to set the transport's initialized flag
 * This is necessary when recreating transports for existing sessions because the transport expects to have received an initialization message from the client.
 */
const spoofTransportInitialization = async (
  transport: StreamableHTTPServerTransport,
  req: any,
  sessionId: string,
  mcpProtocolVersion?: string
): Promise<void> => {
  logger.info({ sessionId }, 'Spoofing initialization message to set transport state');

  const spoofInitMessage = createSpoofInitMessage(mcpProtocolVersion);
  const mockRes = MockResponseSingleton.getInstance().getMockResponse();

  try {
    await transport.handleRequest(req, mockRes, spoofInitMessage);
    logger.info({ sessionId }, 'Successfully spoofed initialization');
  } catch (spoofError) {
    logger.warn({ sessionId, error: spoofError }, 'Spoof initialization failed, continuing anyway');
  }
};

const validateSession = async (
  req: IncomingMessage,
  res: ServerResponse,
  body: any,
  tenantId: string,
  projectId: string,
  agentId: string,
  ref: ResolvedRef
): Promise<any | null> => {
  const sessionId = req.headers['mcp-session-id'];
  logger.info({ sessionId }, 'Received MCP session ID');

  if (!sessionId) {
    logger.info({ body }, 'Missing session ID');
    res.writeHead(400).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Bad Request: Mcp-Session-Id header is required' },
        id: null,
      })
    );
    return false;
  }
  if (Array.isArray(sessionId)) {
    res.writeHead(400).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Mcp-Session-Id header must be a single value',
        },
        id: null,
      })
    );
    return false;
  }

  const conversation = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getConversation(db)({
      scopes: { tenantId, projectId },
      conversationId: sessionId,
    });
  });

  logger.info(
    {
      sessionId,
      conversationFound: !!conversation,
      sessionType: conversation?.metadata?.sessionData?.sessionType,
      storedAgentId: conversation?.metadata?.sessionData?.agentId,
      requestAgentId: agentId,
    },
    'Conversation lookup result'
  );
  if (
    !conversation ||
    conversation.metadata?.sessionData?.sessionType !== 'mcp' ||
    conversation.metadata?.sessionData?.agentId !== agentId
  ) {
    logger.info(
      { sessionId, conversationId: conversation?.id },
      'MCP session not found or invalid'
    );
    res.writeHead(404).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found',
        },
        id: null,
      })
    );
    return false;
  }
  return conversation;
};

/**
 * Sets up tracing attributes for the active span
 */
const setupTracing = (conversationId: string, tenantId: string, agentId: string): void => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      'conversation.id': conversationId,
      'tenant.id': tenantId,
      'agent.id': agentId,
    });
  }
};

/**
 * Processes and stores the user message
 */
const processUserMessage = async (
  tenantId: string,
  projectId: string,
  conversationId: string,
  query: string,
  ref: ResolvedRef
): Promise<void> => {
  const messageSpan = trace.getActiveSpan();
  if (messageSpan) {
    messageSpan.setAttributes({
      'message.content': query,
      'message.timestamp': Date.now(),
    });
  }
  await executeInBranch({ dbClient, ref }, async (db) => {
    return await createMessage(db)({
      id: generateId(),
      tenantId,
      projectId,
      conversationId,
      role: 'user',
      content: {
        text: query,
      },
      visibility: 'user-facing',
      messageType: 'chat',
    });
  });
};

/**
 * Executes the agent query and returns the result
 */
const executeAgentQuery = async (
  executionContext: ExecutionContext,
  conversationId: string,
  query: string,
  defaultSubAgentId: string
): Promise<CallToolResult> => {
  const requestId = `mcp-${Date.now()}`;
  const mcpStreamHelper = createMCPStreamHelper();

  const executionHandler = new ExecutionHandler();
  const result = await executionHandler.execute({
    executionContext,
    conversationId,
    userMessage: query,
    initialAgentId: defaultSubAgentId,
    requestId,
    sseHelper: mcpStreamHelper,
  });

  logger.info(
    { result },
    `Execution completed: ${result.success ? 'success' : 'failed'} after ${result.iterations} iterations`
  );

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text:
            result.error ||
            `Sorry, I was unable to process your request at this time. Please try again.`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: result.response || 'No response generated',
      },
    ],
  };
};

/**
 * Creates and configures an MCP server for the given context
 */
const getServer = async (
  headers: Record<string, unknown>,
  executionContext: ExecutionContext,
  conversationId: string,
  credentialStores?: CredentialStoreRegistry
) => {
  const { tenantId, projectId, agentId, ref } = executionContext;
  setupTracing(conversationId, tenantId, agentId);

  const agent = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getAgentWithDefaultSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
    });
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  const server = new McpServer(
    {
      name: 'inkeep-chat-api-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } }
  );

  server.tool(
    'send-query-to-agent',
    `Send a query to the ${agent.name} agent. The agent has the following description: ${agent.description}`,
    {
      query: z.string().describe('The query to send to the agent'),
    },
    async ({ query }): Promise<CallToolResult> => {
      try {
        if (!agent.defaultSubAgentId) {
          return {
            content: [
              {
                type: 'text',
                text: `Agent does not have a default agent configured`,
              },
            ],
            isError: true,
          };
        }
        const defaultSubAgentId = agent.defaultSubAgentId;

        const agentInfo = await executeInBranch({ dbClient, ref }, async (db) => {
          return await getSubAgentById(db)({
            scopes: { tenantId, projectId, agentId },
            subAgentId: defaultSubAgentId,
          });
        });

        if (!agentInfo) {
          return {
            content: [
              {
                type: 'text',
                text: `Agent not found`,
              },
            ],
            isError: true,
          };
        }

        const resolvedContext = await executeInBranch(
          { dbClient, ref, autoCommit: true, commitMessage: 'Handle context resolution' },
          async (db) => {
            return await handleContextResolution({
              tenantId,
              projectId,
              agentId,
              conversationId,
              headers,
              dbClient: db,
              credentialStores,
            });
          }
        );

        logger.info(
          {
            tenantId,
            projectId,
            agentId,
            conversationId,
            hasContextConfig: !!agent.contextConfigId,
            hasHeaders: !!headers,
            hasValidatedContext: !!resolvedContext,
          },
          'parameters'
        );

        await processUserMessage(tenantId, projectId, conversationId, query, ref);

        return executeAgentQuery(executionContext, conversationId, query, defaultSubAgentId);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error sending query: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
};

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
  db: DatabaseClient;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return contextValidationMiddleware(dbClient)(c, next);
  }
  return next();
});

/**
 * Validates request parameters and returns execution context if valid
 */
const validateRequestParameters = (
  c: any
): { valid: true; executionContext: ExecutionContext } | { valid: false; response: Response } => {
  try {
    const executionContext = getRequestExecutionContext(c);
    const { tenantId, projectId, agentId } = executionContext;

    getLogger('mcp').debug({ tenantId, projectId, agentId }, 'Extracted MCP entity parameters');

    return { valid: true, executionContext };
  } catch (error) {
    getLogger('chat').warn(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to get execution context'
    );
    return {
      valid: false,
      response: c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'API key authentication required' },
          id: null,
        },
        { status: 401 }
      ),
    };
  }
};

/**
 * Creates a new MCP session and handles initialization
 */
const handleInitializationRequest = async (
  body: any,
  executionContext: ExecutionContext,
  validatedContext: Record<string, unknown>,
  req: any,
  res: any,
  c: any,
  credentialStores?: CredentialStoreRegistry
) => {
  const { tenantId, projectId, agentId, ref } = executionContext;
  logger.info({ body }, 'Received initialization request');
  const sessionId = getConversationId();

  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      'conversation.id': sessionId,
      'tenant.id': tenantId,
      'agent.id': agentId,
      'project.id': projectId,
    });
  }

  let currentBag = propagation.getBaggage(otelContext.active());
  if (!currentBag) {
    currentBag = propagation.createBaggage();
  }
  currentBag = currentBag.setEntry('conversation.id', { value: sessionId });
  const ctxWithBaggage = propagation.setBaggage(otelContext.active(), currentBag);
  return await otelContext.with(ctxWithBaggage, async () => {
    const agent = await executeInBranch({ dbClient, ref }, async (db) => {
      return await getAgentWithDefaultSubAgent(db)({
        scopes: { tenantId, projectId, agentId },
      });
    });
    if (!agent) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Agent not found' },
          id: body.id || null,
        },
        { status: 404 }
      );
    }

    if (!agent.defaultSubAgentId) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Agent does not have a default agent configured' },
          id: body.id || null,
        },
        { status: 400 }
      );
    }

    const activeSubAgentId = agent.defaultSubAgentId;
    const conversation = await executeInBranch({ dbClient, ref }, async (db) => {
      return await createOrGetConversation(db)({
        id: sessionId,
        tenantId,
        projectId,
        activeSubAgentId,
        metadata: {
          sessionData: {
            agentId,
            sessionType: 'mcp',
            mcpProtocolVersion: c.req.header('mcp-protocol-version'),
            initialized: false, // Track initialization state
          },
        },
      });
    });

    logger.info(
      { sessionId, conversationId: conversation.id },
      'Created MCP session as conversation'
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });

    const server = await getServer(validatedContext, executionContext, sessionId, credentialStores);
    await server.connect(transport);
    logger.info({ sessionId }, 'Server connected for initialization');

    res.setHeader('Mcp-Session-Id', sessionId);

    logger.info(
      {
        sessionId,
        bodyMethod: body?.method,
        bodyId: body?.id,
      },
      'About to handle initialization request'
    );

    await transport.handleRequest(req, res, body);
    logger.info({ sessionId }, 'Successfully handled initialization request');

    return toFetchResponse(res);
  });
};

/**
 * Handles requests for existing MCP sessions
 */
const handleExistingSessionRequest = async (
  body: any,
  executionContext: ExecutionContext,
  validatedContext: Record<string, unknown>,
  req: any,
  res: any,
  dbClient: DatabaseClient,
  credentialStores?: CredentialStoreRegistry
) => {
  const { tenantId, projectId, agentId, ref } = executionContext;
  const conversation = await validateSession(req, res, body, tenantId, projectId, agentId, ref);
  if (!conversation) {
    return toFetchResponse(res);
  }

  const sessionId = conversation.id;

  await executeInBranch({ dbClient, ref }, async (db) => {
    return await updateConversation(db)({
      scopes: { tenantId, projectId },
      conversationId: sessionId,
      data: {},
    });
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });

  const server = await getServer(validatedContext, executionContext, sessionId, credentialStores);
  await server.connect(transport);

  await spoofTransportInitialization(
    transport,
    req,
    sessionId,
    conversation.metadata?.session_data?.mcpProtocolVersion
  );

  logger.info({ sessionId }, 'Server connected and transport initialized');

  logger.info(
    {
      sessionId,
      bodyKeys: Object.keys(body || {}),
      bodyMethod: body?.method,
      bodyId: body?.id,
      requestHeaders: Object.fromEntries(
        Object.entries(req.headers || {}).filter(([k]) => k.startsWith('mcp-'))
      ),
    },
    'About to handle MCP request with existing session'
  );

  try {
    await transport.handleRequest(req, res, body);
    logger.info({ sessionId }, 'Successfully handled MCP request');
  } catch (transportError) {
    logger.error(
      {
        sessionId,
        error: transportError,
        errorMessage: transportError instanceof Error ? transportError.message : 'Unknown error',
      },
      'Transport handleRequest failed'
    );
    throw transportError; // Re-throw to be caught by outer catch
  }

  return toFetchResponse(res);
};

/**
 * Creates a JSON-RPC error response
 */
const createErrorResponse = (code: number, message: string, id: any = null) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id,
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['MCP'],
    summary: 'MCP Protocol',
    description: 'Handles Model Context Protocol (MCP) JSON-RPC requests',
    security: [{ bearerAuth: [] }],
    request: {
      headers: HeadersScopeSchema,
    },
    responses: {
      200: {
        description: 'MCP response',
      },
      401: {
        description: 'Unauthorized - API key authentication required',
      },
      404: {
        description: 'Not Found - Agent not found',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  }),
  async (c) => {
    try {
      const paramValidation = validateRequestParameters(c);
      if (!paramValidation.valid) {
        return paramValidation.response;
      }

      const { executionContext } = paramValidation;

      const body = c.get('requestBody') || {};
      logger.info({ body, bodyKeys: Object.keys(body || {}) }, 'Parsed request body');

      const isInitRequest = body.method === 'initialize';
      const { req, res } = toReqRes(c.req.raw);
      const validatedContext = (c as any).get('validatedContext') || {};
      const credentialStores = c.get('credentialStores');
      logger.info({ validatedContext }, 'Validated context');
      logger.info({ req }, 'request');
      if (isInitRequest) {
        return await handleInitializationRequest(
          body,
          executionContext,
          validatedContext,
          req,
          res,
          c,
          credentialStores
        );
      }
      return await handleExistingSessionRequest(
        body,
        executionContext,
        validatedContext,
        req,
        res,
        dbClient,
        credentialStores
      );
    } catch (e) {
      logger.error(
        {
          error: e instanceof Error ? e.message : e,
          stack: e instanceof Error ? e.stack : undefined,
        },
        'MCP request error'
      );
      return c.json(createErrorResponse(-32603, 'Internal server error'), { status: 500 });
    }
  }
);

app.get('/', async (c) => {
  logger.info({}, 'Received GET MCP request');
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    },
    { status: 405 }
  );
});

app.delete('/', async (c) => {
  logger.info({}, 'Received DELETE MCP request');

  return c.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Method Not Allowed' },
      id: null,
    },
    { status: 405 }
  );
});

export default app;
