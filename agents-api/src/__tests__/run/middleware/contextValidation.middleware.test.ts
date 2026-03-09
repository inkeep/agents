import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { contextValidationMiddleware } from '../../../domains/run/context/validation';

function createMockExecutionContext(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  headersSchema?: Record<string, unknown> | null;
  includeContextConfig?: boolean;
}) {
  const { tenantId, projectId, agentId, headersSchema, includeContextConfig = true } = params;

  return {
    apiKey: 'test-api-key',
    apiKeyId: 'test-api-key-id',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      agents: {
        [agentId]: {
          id: agentId,
          tenantId,
          projectId,
          name: 'Test Agent',
          description: 'Test agent',
          defaultSubAgentId: agentId,
          subAgents: {},
          tools: {},
          externalAgents: {},
          teamAgents: {},
          transferRelations: {},
          delegateRelations: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          ...(includeContextConfig
            ? {
                contextConfigId: 'test-config',
                contextConfig: {
                  id: 'test-config',
                  headersSchema: headersSchema ?? null,
                },
              }
            : {}),
        },
      },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: {},
      statusUpdates: null,
    },
  } as any;
}

describe('contextValidationMiddleware - HTTPException handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 with specific error when header validation fails', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-api-key': { type: 'string' },
      },
      required: ['x-api-key'],
    };

    const executionContext = createMockExecutionContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      headersSchema,
    });

    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('executionContext', executionContext);
      c.set('requestBody', {});
      c.set('credentialStores', undefined);
      await next();
    });

    app.use('*', contextValidationMiddleware);

    app.get('/', (c) => c.json({ ok: true }));

    const res = await app.request('/', {
      headers: { 'other-header': 'value' },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.message).toContain('Invalid headers');
  });

  it('should return 500 for unexpected non-HTTP errors', async () => {
    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('executionContext', {
        get tenantId() {
          throw new Error('Unexpected DB failure');
        },
      });
      await next();
    });

    app.use('*', contextValidationMiddleware);

    app.get('/', (c) => c.json({ ok: true }));

    const res = await app.request('/');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_server_error');
    expect(body.error.message).toBe('Context validation failed');
  });

  it('should pass through successfully when headers are valid', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-api-key': { type: 'string' },
      },
      required: ['x-api-key'],
    };

    const executionContext = createMockExecutionContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      headersSchema,
    });

    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('executionContext', executionContext);
      c.set('requestBody', {});
      c.set('credentialStores', undefined);
      await next();
    });

    app.use('*', contextValidationMiddleware);

    app.get('/', (c) => c.json({ ok: true }));

    const res = await app.request('/', {
      headers: { 'x-api-key': 'test-key' },
    });

    expect(res.status).toBe(200);
  });
});
