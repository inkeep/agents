import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  createApiError,
  getAgentGraphWithDefaultAgent,
  getRequestExecutionContext,
  HeadersScopeSchema,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { z } from 'zod';
import { a2aHandler } from '../a2a/handlers';
import { getRegisteredGraph } from '../data/agentGraph';
import { getRegisteredAgent } from '../data/agents';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('agents');

// A2A Agent Card Discovery (REST with OpenAPI)
app.openapi(
  createRoute({
    method: 'get',
    path: '/.well-known/agent.json',
    request: {
      headers: HeadersScopeSchema,
    },
    tags: ['a2a'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Agent Card for A2A discovery',
        content: {
          'application/json': {
            schema: z.object({
              name: z.string(),
              description: z.string().optional(),
              url: z.string(),
              version: z.string(),
              defaultInputModes: z.array(z.string()),
              defaultOutputModes: z.array(z.string()),
              skills: z.array(z.any()),
            }),
          },
        },
      },
      404: {
        description: 'Agent not found',
      },
    },
  }),
  async (c: Context) => {
    const otelHeaders = {
      traceparent: c.req.header('traceparent'),
      tracestate: c.req.header('tracestate'),
      baggage: c.req.header('baggage'),
    };

    logger.info(
      {
        otelHeaders,
        path: c.req.path,
        method: c.req.method,
      },
      'OpenTelemetry headers: well-known agent.json'
    );

    // Get execution context from API key authentication
    const executionContext = getRequestExecutionContext(c);
    const { tenantId, projectId, graphId, agentId } = executionContext;

    console.dir('executionContext', executionContext);
    // If agentId is defined in execution context, run agent-level logic
    if (agentId) {
      logger.info(
        {
          message: 'getRegisteredAgent (agent-level)',
          tenantId,
          projectId,
          graphId,
          agentId,
        },
        'agent-level well-known agent.json'
      );

      const credentialStores = c.get('credentialStores');
      const agent = await getRegisteredAgent(executionContext, credentialStores);
      logger.info({ agent }, 'agent registered: well-known agent.json');
      if (!agent) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      return c.json(agent.agentCard);
    } else {
      // Run graph-level logic
      logger.info(
        {
          message: 'getRegisteredGraph (graph-level)',
          tenantId,
          projectId,
          graphId,
        },
        'graph-level well-known agent.json'
      );

      const graph = await getRegisteredGraph(executionContext);
      if (!graph) {
        throw createApiError({
          code: 'not_found',
          message: 'Graph not found',
        });
      }

      return c.json(graph.agentCard);
    }
  }
);

// A2A Protocol Handler (supports both agent-level and graph-level)
app.post('/a2a', async (c: Context) => {
  const otelHeaders = {
    traceparent: c.req.header('traceparent'),
    tracestate: c.req.header('tracestate'),
    baggage: c.req.header('baggage'),
  };

  logger.info(
    {
      otelHeaders,
      path: c.req.path,
      method: c.req.method,
    },
    'OpenTelemetry headers: a2a'
  );

  // Get execution context from API key authentication
  const executionContext = getRequestExecutionContext(c);
  const { tenantId, projectId, graphId, agentId } = executionContext;

  // If agentId is defined in execution context, run agent-level logic
  if (agentId) {
    logger.info(
      {
        message: 'a2a (agent-level)',
        tenantId,
        projectId,
        graphId,
        agentId,
      },
      'agent-level a2a endpoint'
    );

    // Ensure agent is registered (lazy loading)
    const credentialStores = c.get('credentialStores');
    const agent = await getRegisteredAgent(executionContext, credentialStores);

    if (!agent) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32004, message: 'Agent not found' },
          id: null,
        },
        404
      );
    }

    return a2aHandler(c, agent);
  } else {
    // Run graph-level logic
    logger.info(
      {
        message: 'a2a (graph-level)',
        tenantId,
        projectId,
        graphId,
      },
      'graph-level a2a endpoint'
    );

    // fetch the graph and the default agent
    const graph = await getAgentGraphWithDefaultAgent(dbClient)({
      scopes: { tenantId, projectId, graphId },
    });

    if (!graph) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32004, message: 'Agent not found' },
          id: null,
        },
        404
      );
    }
    if (!graph.defaultAgentId) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32004, message: 'Graph does not have a default agent configured' },
          id: null,
        },
        400
      );
    }
    executionContext.agentId = graph.defaultAgentId;
    // fetch the default agent and use it as entry point for the graph
    const credentialStores = c.get('credentialStores');
    const defaultAgent = await getRegisteredAgent(executionContext, credentialStores);

    if (!defaultAgent) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32004, message: 'Agent not found' },
          id: null,
        },
        404
      );
    }

    // Use the existing a2aHandler with the default agent as a registered agent
    return a2aHandler(c, defaultAgent);
  }
});

export default app;
