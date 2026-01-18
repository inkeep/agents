import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// Create hoisted mocks for @inkeep/agents-core
const {
  getTriggerByIdMock,
  createTriggerInvocationMock,
  updateTriggerInvocationStatusMock,
  getFullProjectWithRelationIdsMock,
  createOrGetConversationMock,
  setActiveAgentForConversationMock,
  createMessageMock,
} = vi.hoisted(() => ({
  getTriggerByIdMock: vi.fn(),
  createTriggerInvocationMock: vi.fn(),
  updateTriggerInvocationStatusMock: vi.fn(),
  getFullProjectWithRelationIdsMock: vi.fn(),
  createOrGetConversationMock: vi.fn(),
  setActiveAgentForConversationMock: vi.fn(),
  createMessageMock: vi.fn(),
}));

// Mock @inkeep/agents-core
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createAgentsManageDatabaseClient: vi.fn(() => ({})),
    getTriggerById: getTriggerByIdMock,
    createTriggerInvocation: createTriggerInvocationMock,
    updateTriggerInvocationStatus: updateTriggerInvocationStatusMock,
    getFullProjectWithRelationIds: getFullProjectWithRelationIdsMock,
    createOrGetConversation: createOrGetConversationMock,
    setActiveAgentForConversation: setActiveAgentForConversationMock,
    createMessage: createMessageMock,
    createApiError: actual.createApiError,
    verifyTriggerAuth: actual.verifyTriggerAuth,
    verifySigningSecret: actual.verifySigningSecret,
    interpolateTemplate: actual.interpolateTemplate,
    JsonTransformer: actual.JsonTransformer,
    generateId: () => 'test-id-123',
    getConversationId: () => 'conv-test-123',
  };
});

// Mock ExecutionHandler
vi.mock('../../handlers/executionHandler.js', () => ({
  ExecutionHandler: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      iterations: 1,
    }),
  })),
}));

// Mock database client
vi.mock('../../data/db/dbClient', () => ({
  default: {},
}));

vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

// Mock stream helpers
vi.mock('../../utils/stream-helpers.js', () => ({
  createSSEStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn(),
    writeContent: vi.fn(),
    complete: vi.fn(),
    writeError: vi.fn(),
    writeOperation: vi.fn(),
  }),
}));

// Mock env
vi.mock('../../env.js', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://localhost:5432/test',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:8080',
  },
}));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://localhost:5432/test',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:8080',
  },
}));

import app from '../../routes/webhooks';

describe('Webhook Endpoint Tests', () => {
  const testTrigger = {
    id: 'trigger-123',
    tenantId: 'tenant-123',
    projectId: 'project-123',
    agentId: 'agent-123',
    name: 'Test Trigger',
    description: 'Test trigger description',
    enabled: true,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    outputTransform: null,
    messageTemplate: 'Webhook message: {{message}}',
    authentication: null,
    signingSecret: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testProject = {
    id: 'project-123',
    tenantId: 'tenant-123',
    name: 'Test Project',
    agents: {
      'agent-123': {
        id: 'agent-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        name: 'Test Agent',
        description: 'Test agent',
        defaultSubAgentId: 'sub-agent-123',
        subAgents: {
          'sub-agent-123': {
            id: 'sub-agent-123',
            tenantId: 'tenant-123',
            projectId: 'project-123',
            name: 'Sub Agent',
            description: 'Test sub agent',
            prompt: 'You are a helpful assistant.',
            canUse: [],
            canTransferTo: [],
            canDelegateTo: [],
            dataComponents: [],
            artifactComponents: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        tools: {},
        externalAgents: {},
        teamAgents: {},
        transferRelations: {},
        delegateRelations: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    tools: {},
    functions: {},
    dataComponents: {},
    artifactComponents: {},
    externalAgents: {},
    credentialReferences: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(testTrigger));
    createTriggerInvocationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    updateTriggerInvocationStatusMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    getFullProjectWithRelationIdsMock.mockReturnValue(vi.fn().mockResolvedValue(testProject));
    createOrGetConversationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    setActiveAgentForConversationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    createMessageMock.mockReturnValue(vi.fn().mockResolvedValue({}));
  });

  describe('Success path', () => {
    it('should accept valid webhook request and return 202', async () => {
      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'Hello webhook!' }),
        }
      );

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        invocationId: 'test-id-123',
      });

      // Verify trigger was fetched
      expect(getTriggerByIdMock).toHaveBeenCalled();

      // Verify invocation was created
      expect(createTriggerInvocationMock).toHaveBeenCalled();
    });

    it('should handle payload without input schema validation', async () => {
      const triggerNoSchema = { ...testTrigger, inputSchema: null };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoSchema));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ anyField: 'anyValue' }),
        }
      );

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should handle empty message template with JSON fallback', async () => {
      const triggerNoTemplate = { ...testTrigger, messageTemplate: null };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoTemplate));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(202);
    });
  });

  describe('Authentication', () => {
    it('should accept request with valid API key authentication', async () => {
      const triggerWithApiKey = {
        ...testTrigger,
        authentication: {
          type: 'api_key',
          headerName: 'X-API-Key',
          apiKey: 'test-secret-key',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithApiKey));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-secret-key',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(202);
    });

    it('should return 401 for missing API key', async () => {
      const triggerWithApiKey = {
        ...testTrigger,
        authentication: {
          type: 'api_key',
          headerName: 'X-API-Key',
          apiKey: 'test-secret-key',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithApiKey));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('should return 403 for invalid API key', async () => {
      const triggerWithApiKey = {
        ...testTrigger,
        authentication: {
          type: 'api_key',
          headerName: 'X-API-Key',
          apiKey: 'test-secret-key',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithApiKey));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'wrong-key',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('should accept request with valid Basic auth', async () => {
      const triggerWithBasicAuth = {
        ...testTrigger,
        authentication: {
          type: 'basic_auth',
          username: 'testuser',
          password: 'testpass',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithBasicAuth));

      const credentials = Buffer.from('testuser:testpass').toString('base64');
      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(202);
    });

    it('should accept request with valid Bearer token', async () => {
      const triggerWithBearerAuth = {
        ...testTrigger,
        authentication: {
          type: 'bearer_token',
          token: 'test-bearer-token',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithBearerAuth));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-bearer-token',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(202);
    });
  });

  describe('Signing secret verification', () => {
    it('should accept request with valid signature', async () => {
      const signingSecret = 'my-secret-key';
      const triggerWithSignature = {
        ...testTrigger,
        signingSecret,
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSignature));

      const payload = JSON.stringify({ message: 'test' });
      const signature = createHmac('sha256', signingSecret).update(payload).digest('hex');

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-256': `sha256=${signature}`,
          },
          body: payload,
        }
      );

      expect(response.status).toBe(202);
    });

    it('should return 403 for invalid signature', async () => {
      const triggerWithSignature = {
        ...testTrigger,
        signingSecret: 'my-secret-key',
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSignature));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-256': 'sha256=invalid-signature',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('should return 403 for missing signature when signing secret is configured', async () => {
      const triggerWithSignature = {
        ...testTrigger,
        signingSecret: 'my-secret-key',
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSignature));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Input validation', () => {
    it('should return 400 for payload that fails schema validation', async () => {
      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wrongField: 'value' }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Payload validation failed');
      expect(data.validationErrors).toBeDefined();
    });

    it('should return 400 for invalid payload type', async () => {
      const triggerWithSchema = {
        ...testTrigger,
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number' },
          },
          required: ['count'],
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSchema));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ count: 'not-a-number' }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Payload validation failed');
    });
  });

  describe('Trigger not found or disabled', () => {
    it('should return 404 when trigger does not exist', async () => {
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(null));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/nonexistent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    it('should return 404 when trigger is disabled', async () => {
      const disabledTrigger = { ...testTrigger, enabled: false };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(disabledTrigger));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('disabled');
    });
  });

  describe('Payload transformation', () => {
    it('should return 422 when payload transformation fails', async () => {
      const triggerWithTransform = {
        ...testTrigger,
        outputTransform: {
          jmespath: 'invalid..jmespath..syntax',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithTransform));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toContain('transformation failed');
    });
  });

  describe('Invocation logging', () => {
    it('should create invocation record with success status', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );

      expect(createTriggerInvocationMock).toHaveBeenCalled();
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-id-123',
          triggerId: 'trigger-123',
          tenantId: 'tenant-123',
          projectId: 'project-123',
          agentId: 'agent-123',
          status: 'pending',
          requestPayload: { message: 'test' },
        })
      );
    });
  });
});
