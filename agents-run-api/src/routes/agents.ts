import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  createApiError,
  executeInBranch,
  getAgentWithDefaultSubAgent,
  getRequestExecutionContext,
  HeadersScopeSchema,
  type ResolvedRef,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { z } from 'zod';
import { a2aHandler } from '../a2a/handlers';
import { getRegisteredAgent } from '../data/agents';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  ref: ResolvedRef;
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
    const { tenantId, projectId, agentId, subAgentId, ref } = executionContext;

    logger.info({ executionContext }, 'executionContext');
    logger.info(
      {
        message: 'getRegisteredAgent (agent-level)',
        tenantId,
        projectId,
        agentId,
        subAgentId,
      },
      'agent-level well-known agent.json'
    );

    const credentialStores = c.get('credentialStores');
    const sandboxConfig = c.get('sandboxConfig');
    const agent = await getRegisteredAgent({
      executionContext,
      credentialStoreRegistry: credentialStores,
      sandboxConfig,
      ref,
    });
    logger.info({ agent }, 'agent registered: well-known agent.json');
    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    return c.json(agent.agentCard);
  }
);

// A2A Protocol Handler (supports both agent-level and agent-level)
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
  const { tenantId, projectId, agentId, subAgentId, ref } = executionContext;

  // If subAgentId is defined in execution context, run agent-level logic
  if (subAgentId) {
    logger.info(
      {
        message: 'a2a (agent-level)',
        tenantId,
        projectId,
        agentId,
        subAgentId,
      },
      'agent-level a2a endpoint'
    );

    // Ensure agent is registered (lazy loading)
    const credentialStores = c.get('credentialStores');
    const sandboxConfig = c.get('sandboxConfig');
    const agent = await getRegisteredAgent({
      executionContext,
      credentialStoreRegistry: credentialStores,
      sandboxConfig,
      ref,
    });

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
  }
  // Run agent-level logic
  logger.info(
    {
      message: 'a2a (agent-level)',
      tenantId,
      projectId,
      agentId,
    },
    'agent-level a2a endpoint'
  );

  // fetch the agent and the default agent
  const agent = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getAgentWithDefaultSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
    });
  });

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
  if (!agent.defaultSubAgentId) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: { code: -32004, message: 'Agent does not have a default agent configured' },
        id: null,
      },
      400
    );
  }
  executionContext.subAgentId = agent.defaultSubAgentId;
  // fetch the default agent and use it as entry point for the agent
  const credentialStores = c.get('credentialStores');
  const sandboxConfig = c.get('sandboxConfig');
  const defaultSubAgent = await getRegisteredAgent({
    executionContext,
    credentialStoreRegistry: credentialStores,
    sandboxConfig,
    ref,
  });

  if (!defaultSubAgent) {
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
  return a2aHandler(c, defaultSubAgent);
});

export default app;
