import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { contextValidationMiddleware, HeadersScopeSchema } from '@inkeep/agents-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v3';

// Type bridge for MCP SDK compatibility with Zod v4
function createMCPSchema<T>(schema: z.ZodType<T>): any {
  return schema;
}

import type { ExecutionContext } from '@inkeep/agents-core';
import {
  type CredentialStoreRegistry,
  createMessage,
  createOrGetConversation,
  getAgentById,
  getAgentGraphWithDefaultAgent,
  getConversation,
  getRequestExecutionContext,
  handleContextResolution,
  updateConversation,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { nanoid } from 'nanoid';
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
    // Create the mock response object once
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
    // Reset headers for each use to avoid state pollution
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
    // Send the spoof initialization to set internal state. The transport errors but it still sets the initialized flag.
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
  graphId: string
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
  } else if (Array.isArray(sessionId)) {
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

  // Get conversation (which stores our session data)
  const conversation = await getConversation(dbClient)({
    scopes: { tenantId, projectId },
    conversationId: sessionId,
  });

  // After line 342 - Add logging to debug conversation lookup
  logger.info(
    {
      sessionId,
      conversationFound: !!conversation,
      sessionType: conversation?.metadata?.sessionData?.sessionType,
      storedGraphId: conversation?.metadata?.sessionData?.graphId,
      requestGraphId: graphId,
    },
    'Conversation lookup result'
  );
  if (
    !conversation ||
    conversation.metadata?.sessionData?.sessionType !== 'mcp' ||
    conversation.metadata?.sessionData?.graphId !== graphId
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
const setupTracing = (conversationId: string, tenantId: string, graphId: string): void => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      'conversation.id': conversationId,
      'tenant.id': tenantId,
      'graph.id': graphId,
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
  query: string
): Promise<void> => {
  const messageSpan = trace.getActiveSpan();
  if (messageSpan) {
    messageSpan.setAttributes({
      'message.content': query,
      'message.timestamp': Date.now(),
    });
  }

  await createMessage(dbClient)({
    id: nanoid(),
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
};

/**
 * Executes the agent query and returns the result
 */
const executeAgentQuery = async (
  executionContext: ExecutionContext,
  conversationId: string,
  query: string,
  defaultAgentId: string
): Promise<CallToolResult> => {
  const requestId = `mcp-${Date.now()}`;
  const mcpStreamHelper = createMCPStreamHelper();

  const executionHandler = new ExecutionHandler();
  const result = await executionHandler.execute({
    executionContext,
    conversationId,
    userMessage: query,
    initialAgentId: defaultAgentId,
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
  requestContext: Record<string, unknown>,
  executionContext: ExecutionContext,
  conversationId: string,
  credentialStores?: CredentialStoreRegistry
) => {
  const { tenantId, projectId, graphId } = executionContext;
  setupTracing(conversationId, tenantId, graphId);

  const agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
    scopes: { tenantId, projectId, graphId },
  });

  if (!agentGraph) {
    throw new Error('Agent graph not found');
  }

  const server = new McpServer(
    {
      name: 'inkeep-chat-api-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } }
  );

  // Register tools and prompts
  server.tool(
    'send-query-to-agent',
    `Send a query to the ${agentGraph.name} agent. The agent has the following description: ${agentGraph.description}`,
    {
      query: createMCPSchema(z.string().describe('The query to send to the agent')),
    },
    async ({ query }): Promise<CallToolResult> => {
      try {
        if (!agentGraph.defaultAgentId) {
          return {
            content: [
              {
                type: 'text',
                text: `Graph does not have a default agent configured`,
              },
            ],
            isError: true,
          };
        }
        const defaultAgentId = agentGraph.defaultAgentId;

        const agentInfo = await getAgentById(dbClient)({
          scopes: { tenantId, projectId, graphId },
          agentId: defaultAgentId,
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

        const resolvedContext = await handleContextResolution({
          tenantId,
          projectId,
          graphId,
          conversationId,
          requestContext,
          dbClient,
          credentialStores,
        });

        logger.info(
          {
            tenantId,
            projectId,
            graphId,
            conversationId,
            hasContextConfig: !!agentGraph.contextConfigId,
            hasRequestContext: !!requestContext,
            hasValidatedContext: !!resolvedContext,
          },
          'parameters'
        );

        await processUserMessage(tenantId, projectId, conversationId, query);

        return executeAgentQuery(executionContext, conversationId, query, defaultAgentId);
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
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

// Only apply context validation to POST requests (GET requests are for SSE streams)
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
    const { tenantId, projectId, graphId } = executionContext;

    getLogger('mcp').debug({ tenantId, projectId, graphId }, 'Extracted MCP entity parameters');

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
  const { tenantId, projectId, graphId } = executionContext;
  logger.info({ body }, 'Received initialization request');
  const sessionId = nanoid();

  // Get the default agent for the graph
  const agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
    scopes: { tenantId, projectId, graphId },
  });
  if (!agentGraph) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Agent graph not found' },
        id: body.id || null,
      },
      { status: 404 }
    );
  }

  if (!agentGraph.defaultAgentId) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Graph does not have a default agent configured' },
        id: body.id || null,
      },
      { status: 400 }
    );
  }

  // Create/get conversation with MCP session metadata
  const conversation = await createOrGetConversation(dbClient)({
    id: sessionId,
    tenantId,
    projectId,
    activeAgentId: agentGraph.defaultAgentId,
    metadata: {
      sessionData: {
        graphId,
        sessionType: 'mcp',
        mcpProtocolVersion: c.req.header('mcp-protocol-version'),
        initialized: false, // Track initialization state
      },
    },
  });

  logger.info(
    { sessionId, conversationId: conversation.id },
    'Created MCP session as conversation'
  );

  // Create fresh transport and server for this request
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });

  const server = await getServer(validatedContext, executionContext, sessionId, credentialStores);
  await server.connect(transport);
  logger.info({ sessionId }, 'Server connected for initialization');

  // Tell client the session ID
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
  credentialStores?: CredentialStoreRegistry
) => {
  const { tenantId, projectId, graphId } = executionContext;
  // Validate the session id
  const conversation = await validateSession(req, res, body, tenantId, projectId, graphId);
  if (!conversation) {
    return toFetchResponse(res);
  }

  const sessionId = conversation.id;

  // Update last activity
  await updateConversation(dbClient)({
    scopes: { tenantId, projectId },
    conversationId: sessionId,
    data: {
      // Just updating the timestamp by calling update
    },
  });

  // Recreate transport and server from stored session data
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });

  const server = await getServer(validatedContext, executionContext, sessionId, credentialStores);
  await server.connect(transport);

  // Spoof initialization to set the transport's _initialized flag
  await spoofTransportInitialization(
    transport,
    req,
    sessionId,
    conversation.metadata?.session_data?.mcpProtocolVersion
  );

  logger.info({ sessionId }, 'Server connected and transport initialized');

  // Add debugging before transport.handleRequest()
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
        description: 'Not Found - Agent graph not found',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  }),
  async (c) => {
    try {
      // Validate parameters
      const paramValidation = validateRequestParameters(c);
      if (!paramValidation.valid) {
        return paramValidation.response;
      }

      const { executionContext } = paramValidation;

      // Get parsed body from middleware (shared across all handlers)
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
      } else {
        return await handleExistingSessionRequest(
          body,
          executionContext,
          validatedContext,
          req,
          res,
          credentialStores
        );
      }
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

// We want to maintain conversations in the database. (https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#session-management)
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
