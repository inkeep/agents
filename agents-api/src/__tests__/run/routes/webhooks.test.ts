import { createHmac } from 'node:crypto';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

vi.mock('../../../logger', () => ({
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
  withRefMock,
  getCredentialReferenceMock,
  createKeyChainStoreMock,
  keychainGetMock,
  canUseProjectStrictMock,
} = vi.hoisted(() => {
  const keychainGetMock = vi.fn();
  return {
    getTriggerByIdMock: vi.fn(),
    createTriggerInvocationMock: vi.fn(),
    updateTriggerInvocationStatusMock: vi.fn(),
    getFullProjectWithRelationIdsMock: vi.fn(),
    createOrGetConversationMock: vi.fn(),
    setActiveAgentForConversationMock: vi.fn(),
    createMessageMock: vi.fn(),
    withRefMock: vi.fn(),
    getCredentialReferenceMock: vi.fn(),
    createKeyChainStoreMock: vi.fn(() => ({
      get: keychainGetMock,
      set: vi.fn(),
      delete: vi.fn(),
    })),
    keychainGetMock,
    canUseProjectStrictMock: vi.fn().mockResolvedValue(true),
  };
});

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
    withRef: withRefMock,
    getCredentialReference: getCredentialReferenceMock,
    createKeyChainStore: createKeyChainStoreMock,
    createApiError: actual.createApiError,
    verifyTriggerAuth: actual.verifyTriggerAuth,
    interpolateTemplate: actual.interpolateTemplate,
    JsonTransformer: actual.JsonTransformer,
    hashTriggerHeaderValue: actual.hashTriggerHeaderValue,
    verifySignatureWithConfig: actual.verifySignatureWithConfig,
    canUseProjectStrict: canUseProjectStrictMock,
    generateId: () => 'test-id-123',
    getConversationId: () => 'conv-test-123',
  };
});

// Mock ExecutionHandler
vi.mock('../../domains/run/handlers/executionHandler.js', () => ({
  ExecutionHandler: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      iterations: 1,
    }),
  })),
}));

// Mock database clients
vi.mock('../../../data/db/manageDbPool', () => ({
  default: {},
}));

vi.mock('../../../data/db/runDbClient', () => ({
  default: {},
}));

// Mock stream helpers
vi.mock('../../domains/run/utils/stream-helpers.js', () => ({
  createSSEStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn(),
    writeContent: vi.fn(),
    complete: vi.fn(),
    writeError: vi.fn(),
    writeOperation: vi.fn(),
  }),
}));

// Mock env
vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://localhost:5432/test',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:8080',
  },
}));

vi.mock('../../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://localhost:5432/test',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:8080',
  },
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import type { BaseExecutionContext, ResolvedRef } from '@inkeep/agents-core';
import webhooksApp from '../../../domains/run/routes/webhooks';

// Create a test app with middleware that sets up executionContext
const testResolvedRef = {
  type: 'branch' as const,
  name: 'tenant-123_project-123_main',
  hash: 'abc123',
};

const app = new OpenAPIHono();

// Add middleware to set executionContext before routing to webhooks
app.use(
  '*',
  async (
    c: Context<{ Variables: { executionContext: BaseExecutionContext; resolvedRef: ResolvedRef } }>,
    next
  ) => {
    c.set('executionContext', {
      apiKey: 'test-key',
      apiKeyId: 'test-key-id',
      tenantId: 'tenant-123',
      projectId: 'project-123',
      agentId: 'agent-123',
      baseUrl: 'http://localhost:8080',
    });
    c.set('resolvedRef', testResolvedRef);
    await next();
  }
);

// Mount the webhooks routes
app.route('/', webhooksApp);

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
    signingSecretCredentialReferenceId: null,
    signatureVerification: null,
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

    // Setup withRef mock to execute the callback with a mock db
    withRefMock.mockImplementation(
      async (_pool: unknown, _ref: unknown, callback: (db: unknown) => Promise<unknown>) => {
        return callback({});
      }
    );

    // Setup default mock implementations
    getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(testTrigger));
    createTriggerInvocationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    updateTriggerInvocationStatusMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    getFullProjectWithRelationIdsMock.mockReturnValue(vi.fn().mockResolvedValue(testProject));
    createOrGetConversationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    setActiveAgentForConversationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    createMessageMock.mockReturnValue(vi.fn().mockResolvedValue({}));
    getCredentialReferenceMock.mockReturnValue(vi.fn().mockResolvedValue(null));
    keychainGetMock.mockResolvedValue(null);
    canUseProjectStrictMock.mockResolvedValue(true);
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
        conversationId: 'conv-test-123',
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
    it('should accept request with valid header authentication', async () => {
      // Use the actual hash function to create proper test data
      const { hashTriggerHeaderValue } = await import('@inkeep/agents-core');
      const { valueHash, valuePrefix } = await hashTriggerHeaderValue('test-secret-key');

      const triggerWithAuth = {
        ...testTrigger,
        authentication: {
          headers: [
            {
              name: 'X-API-Key',
              valueHash,
              valuePrefix,
            },
          ],
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithAuth));

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

    it('should return 401 for missing required header', async () => {
      const { hashTriggerHeaderValue } = await import('@inkeep/agents-core');
      const { valueHash, valuePrefix } = await hashTriggerHeaderValue('test-secret-key');

      const triggerWithAuth = {
        ...testTrigger,
        authentication: {
          headers: [
            {
              name: 'X-API-Key',
              valueHash,
              valuePrefix,
            },
          ],
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithAuth));

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

    it('should return 403 for invalid header value', async () => {
      const { hashTriggerHeaderValue } = await import('@inkeep/agents-core');
      const { valueHash, valuePrefix } = await hashTriggerHeaderValue('test-secret-key');

      const triggerWithAuth = {
        ...testTrigger,
        authentication: {
          headers: [
            {
              name: 'X-API-Key',
              valueHash,
              valuePrefix,
            },
          ],
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithAuth));

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

    it('should validate multiple headers', async () => {
      const { hashTriggerHeaderValue } = await import('@inkeep/agents-core');
      const hash1 = await hashTriggerHeaderValue('key1');
      const hash2 = await hashTriggerHeaderValue('key2');

      const triggerWithMultipleHeaders = {
        ...testTrigger,
        authentication: {
          headers: [
            { name: 'X-API-Key', valueHash: hash1.valueHash, valuePrefix: hash1.valuePrefix },
            { name: 'X-Client-ID', valueHash: hash2.valueHash, valuePrefix: hash2.valuePrefix },
          ],
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithMultipleHeaders));

      // Both headers valid
      const validResponse = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key1',
            'X-Client-ID': 'key2',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );
      expect(validResponse.status).toBe(202);

      // Missing second header
      const missingResponse = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key1',
          },
          body: JSON.stringify({ message: 'test' }),
        }
      );
      expect(missingResponse.status).toBe(401);
    });

    it('should accept request with no authentication configured', async () => {
      const triggerNoAuth = {
        ...testTrigger,
        authentication: null,
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoAuth));

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

    it('should accept request with empty headers array', async () => {
      const triggerEmptyHeaders = {
        ...testTrigger,
        authentication: { headers: [] },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerEmptyHeaders));

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

  describe('Signing secret verification (basic pattern)', () => {
    it('should accept request with valid signature', async () => {
      const signingSecret = 'my-secret-key';

      // Setup credential reference mock
      getCredentialReferenceMock.mockReturnValue(
        vi.fn().mockResolvedValue({
          id: 'cred-ref-basic',
          type: 'keychain',
          credentialStoreId: 'keychain-default',
          retrievalParams: { key: 'basic-secret-key' },
        })
      );
      keychainGetMock.mockResolvedValue(signingSecret);

      const triggerWithSignature = {
        ...testTrigger,
        signingSecretCredentialReferenceId: 'cred-ref-basic',
        signatureVerification: {
          algorithm: 'sha256' as const,
          encoding: 'hex' as const,
          signature: {
            source: 'header' as const,
            key: 'X-Signature-256',
            prefix: 'sha256=',
          },
          signedComponents: [
            {
              source: 'body' as const,
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate' as const,
            separator: '',
          },
        },
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
      const signingSecret = 'my-secret-key';

      // Setup credential reference mock
      getCredentialReferenceMock.mockReturnValue(
        vi.fn().mockResolvedValue({
          id: 'cred-ref-basic',
          type: 'keychain',
          credentialStoreId: 'keychain-default',
          retrievalParams: { key: 'basic-secret-key' },
        })
      );
      keychainGetMock.mockResolvedValue(signingSecret);

      const triggerWithSignature = {
        ...testTrigger,
        signingSecretCredentialReferenceId: 'cred-ref-basic',
        signatureVerification: {
          algorithm: 'sha256' as const,
          encoding: 'hex' as const,
          signature: {
            source: 'header' as const,
            key: 'X-Signature-256',
            prefix: 'sha256=',
          },
          signedComponents: [
            {
              source: 'body' as const,
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate' as const,
            separator: '',
          },
        },
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
      const signingSecret = 'my-secret-key';

      // Setup credential reference mock
      getCredentialReferenceMock.mockReturnValue(
        vi.fn().mockResolvedValue({
          id: 'cred-ref-basic',
          type: 'keychain',
          credentialStoreId: 'keychain-default',
          retrievalParams: { key: 'basic-secret-key' },
        })
      );
      keychainGetMock.mockResolvedValue(signingSecret);

      const triggerWithSignature = {
        ...testTrigger,
        signingSecretCredentialReferenceId: 'cred-ref-basic',
        signatureVerification: {
          algorithm: 'sha256' as const,
          encoding: 'hex' as const,
          signature: {
            source: 'header' as const,
            key: 'X-Signature-256',
            prefix: 'sha256=',
          },
          signedComponents: [
            {
              source: 'body' as const,
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate' as const,
            separator: '',
          },
        },
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

  describe('Signature verification with credential references', () => {
    describe('GitHub pattern', () => {
      it('should accept request with valid GitHub-style signature', async () => {
        const secret = 'github-webhook-secret';
        const payload = JSON.stringify({ action: 'opened', issue: { id: 1 } });
        const signature = createHmac('sha256', secret).update(payload).digest('hex');

        // Setup credential reference mock with keychain type
        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-123',
            tenantId: 'tenant-123',
            projectId: 'project-123',
            name: 'GitHub Webhook Secret',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: { key: 'github-secret-key' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerWithNewVerification = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-123',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Hub-Signature-256',
              prefix: 'sha256=',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
            validation: {
              headerCaseSensitive: false,
              allowEmptyBody: false,
              normalizeUnicode: false,
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithNewVerification));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Hub-Signature-256': `sha256=${signature}`,
            },
            body: payload,
          }
        );

        expect(response.status).toBe(202);
        expect(getCredentialReferenceMock).toHaveBeenCalled();
      });

      it('should return 403 for invalid signature with credential verification', async () => {
        const secret = 'github-webhook-secret';

        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-123',
            tenantId: 'tenant-123',
            projectId: 'project-123',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: { key: 'github-secret-key' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerWithNewVerification = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-123',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Hub-Signature-256',
              prefix: 'sha256=',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithNewVerification));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Hub-Signature-256': 'sha256=invalid-signature-here',
            },
            body: JSON.stringify({ action: 'opened' }),
          }
        );

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBeTruthy();
      });

      it('should return 403 for missing signature header', async () => {
        const secret = 'github-webhook-secret';

        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-123',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: { key: 'github-secret-key' },
          })
        );

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerWithNewVerification = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-123',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Hub-Signature-256',
              prefix: 'sha256=',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithNewVerification));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'opened' }),
          }
        );

        expect(response.status).toBe(403);
      });
    });

    describe('Slack pattern', () => {
      it('should accept request with valid Slack-style signature', async () => {
        const secret = 'slack-signing-secret';
        const timestamp = '1234567890';
        const payload = JSON.stringify({ type: 'event_callback' });
        const signedData = `v0:${timestamp}:${payload}`;
        const signature = createHmac('sha256', secret).update(signedData).digest('hex');

        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-slack',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: { key: 'slack-secret-key' },
          })
        );

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerWithSlackVerification = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-slack',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Slack-Signature',
              prefix: 'v0=',
            },
            signedComponents: [
              {
                source: 'literal' as const,
                value: 'v0',
                required: true,
              },
              {
                source: 'header' as const,
                key: 'X-Slack-Request-Timestamp',
                required: true,
              },
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: ':',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSlackVerification));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Slack-Signature': `v0=${signature}`,
              'X-Slack-Request-Timestamp': timestamp,
            },
            body: payload,
          }
        );

        expect(response.status).toBe(202);
      });

      it('should return 403 for invalid Slack signature', async () => {
        const secret = 'slack-signing-secret';
        const timestamp = '1234567890';

        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-slack',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: { key: 'slack-secret-key' },
          })
        );

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerWithSlackVerification = {
          ...testTrigger,
          signingSecretCredentialReferenceId: 'cred-ref-slack',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Slack-Signature',
              prefix: 'v0=',
            },
            signedComponents: [
              {
                source: 'literal' as const,
                value: 'v0',
                required: true,
              },
              {
                source: 'header' as const,
                key: 'X-Slack-Request-Timestamp',
                required: true,
              },
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: ':',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithSlackVerification));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Slack-Signature': 'v0=wrong-signature',
              'X-Slack-Request-Timestamp': timestamp,
            },
            body: JSON.stringify({ type: 'event_callback' }),
          }
        );

        expect(response.status).toBe(403);
      });
    });

    describe('Credential resolution and caching', () => {
      it('should return 500 when credential reference not found', async () => {
        getCredentialReferenceMock.mockReturnValue(vi.fn().mockResolvedValue(null));

        const triggerWithMissingCredential = {
          ...testTrigger,
          signingSecretCredentialReferenceId: 'nonexistent-cred',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Signature',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithMissingCredential));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': 'some-signature',
            },
            body: JSON.stringify({ test: 'data' }),
          }
        );

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.error).toContain('Failed to resolve signing secret');
      });

      it('should return 500 when credential has no secret in retrievalParams', async () => {
        // Use a unique credential reference ID to avoid cache hits from previous tests
        getCredentialReferenceMock.mockReturnValue(
          vi.fn().mockResolvedValue({
            id: 'cred-ref-no-secret',
            type: 'keychain',
            credentialStoreId: 'keychain-default',
            retrievalParams: {}, // No key field
          })
        );

        // Mock keychain to return null when no key is provided
        keychainGetMock.mockResolvedValue(null);

        const triggerWithBadCredential = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-no-secret',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Signature',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithBadCredential));

        const response = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': 'some-signature',
            },
            body: JSON.stringify({ test: 'data' }),
          }
        );

        expect(response.status).toBe(500);
      });

      it('should cache credential references for subsequent requests', async () => {
        const secret = 'cached-secret';
        const payload = JSON.stringify({ test: 'data' });
        const signature = createHmac('sha256', secret).update(payload).digest('hex');

        // First call returns credential
        const getCredentialFn = vi.fn().mockResolvedValue({
          id: 'cred-ref-cache',
          type: 'keychain',
          credentialStoreId: 'keychain-default',
          retrievalParams: { key: 'cache-secret-key' },
        });
        getCredentialReferenceMock.mockReturnValue(getCredentialFn);

        // Setup keychain mock to return the actual secret
        keychainGetMock.mockResolvedValue(secret);

        const triggerConfig = {
          ...testTrigger,
          inputSchema: null, // Override inputSchema to accept any payload
          signingSecretCredentialReferenceId: 'cred-ref-cache',
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Signature',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerConfig));

        // First request
        const response1 = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': signature,
            },
            body: payload,
          }
        );
        expect(response1.status).toBe(202);
        expect(getCredentialFn).toHaveBeenCalledTimes(1);

        // Second request (should use cache)
        const response2 = await app.request(
          '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': signature,
            },
            body: payload,
          }
        );
        expect(response2.status).toBe(202);
        // Cache prevents second call to getCredentialReference
        expect(getCredentialFn).toHaveBeenCalledTimes(1);
      });
    });

    describe('Error handling', () => {
      it('should skip verification when no signatureVerification config', async () => {
        const triggerNoVerification = {
          ...testTrigger,
          signingSecretCredentialReferenceId: null,
          signatureVerification: null,
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoVerification));

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
        expect(getCredentialReferenceMock).not.toHaveBeenCalled();
      });

      it('should skip verification when no credentialReferenceId', async () => {
        const triggerNoCredentialRef = {
          ...testTrigger,
          signingSecretCredentialReferenceId: null,
          signatureVerification: {
            algorithm: 'sha256' as const,
            encoding: 'hex' as const,
            signature: {
              source: 'header' as const,
              key: 'X-Signature',
            },
            signedComponents: [
              {
                source: 'body' as const,
                required: true,
              },
            ],
            componentJoin: {
              strategy: 'concatenate' as const,
              separator: '',
            },
          },
        };
        getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoCredentialRef));

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
        expect(getCredentialReferenceMock).not.toHaveBeenCalled();
      });
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

    it('should apply JMESPath field extraction transformation', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      const triggerWithJMESPath = {
        ...testTrigger,
        inputSchema: null, // Skip validation for this test
        outputTransform: {
          jmespath: '{ action: action, title: issue.title }',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithJMESPath));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'opened',
            issue: {
              title: 'Bug report',
              body: 'Description of the bug',
            },
          }),
        }
      );

      expect(response.status).toBe(202);
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestPayload: {
            action: 'opened',
            issue: { title: 'Bug report', body: 'Description of the bug' },
          },
          transformedPayload: {
            action: 'opened',
            title: 'Bug report',
          },
        })
      );
    });

    it('should apply JMESPath array filtering transformation', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      const triggerWithArrayFilter = {
        ...testTrigger,
        inputSchema: null, // Skip validation for this test
        outputTransform: {
          jmespath: 'tasks[?priority > `3`].name',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithArrayFilter));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tasks: [
              { name: 'High priority', priority: 5 },
              { name: 'Low priority', priority: 2 },
              { name: 'Medium priority', priority: 4 },
            ],
          }),
        }
      );

      expect(response.status).toBe(202);
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          transformedPayload: ['High priority', 'Medium priority'],
        })
      );
    });

    it('should apply objectTransformation mapping', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      const triggerWithObjectTransform = {
        ...testTrigger,
        inputSchema: null,
        outputTransform: {
          objectTransformation: {
            sender: 'event.user',
            message: 'event.text',
            channel: 'event.channel',
          },
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithObjectTransform));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event: {
              user: 'U12345',
              text: 'Hello world',
              channel: 'general',
            },
          }),
        }
      );

      expect(response.status).toBe(202);
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          transformedPayload: {
            sender: 'U12345',
            message: 'Hello world',
            channel: 'general',
          },
        })
      );
    });

    it('should apply complex nested JMESPath transformation with length function', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      const triggerWithComplexJMESPath = {
        ...testTrigger,
        inputSchema: null,
        outputTransform: {
          jmespath:
            '{ orderId: order.id, customerName: order.customer.name, itemNames: order.items[*].name, itemCount: length(order.items) }',
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithComplexJMESPath));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order: {
              id: 'ORD-123',
              customer: { name: 'John Doe' },
              items: [
                { name: 'Widget A', price: 10 },
                { name: 'Widget B', price: 20 },
              ],
            },
          }),
        }
      );

      expect(response.status).toBe(202);
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          transformedPayload: {
            orderId: 'ORD-123',
            customerName: 'John Doe',
            itemNames: ['Widget A', 'Widget B'],
            itemCount: 2,
          },
        })
      );
    });

    it('should pass through payload unchanged when no outputTransform is configured', async () => {
      const createInvocationFn = vi.fn().mockResolvedValue({});
      createTriggerInvocationMock.mockReturnValue(createInvocationFn);

      const triggerNoTransform = {
        ...testTrigger,
        outputTransform: null,
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoTransform));

      const payload = { message: 'test', extra: 'data' };
      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      expect(response.status).toBe(202);
      expect(createInvocationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestPayload: payload,
          transformedPayload: payload,
        })
      );
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

  describe('Multi-part message format', () => {
    it('should create message with both text and data parts when messageTemplate is provided', async () => {
      const createMessageFn = vi.fn().mockResolvedValue({});
      createMessageMock.mockReturnValue(createMessageFn);

      await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'Hello webhook!' }),
        }
      );

      // Wait for async invocation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(createMessageFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            parts: [
              { kind: 'text', text: 'Webhook message: Hello webhook!' },
              {
                kind: 'data',
                data: { message: 'Hello webhook!' },
                metadata: { source: 'trigger', triggerId: 'trigger-123' },
              },
            ],
          }),
        })
      );
    });

    it('should create message with only data part when messageTemplate is not provided', async () => {
      const createMessageFn = vi.fn().mockResolvedValue({});
      createMessageMock.mockReturnValue(createMessageFn);

      const triggerNoTemplate = { ...testTrigger, messageTemplate: null };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoTemplate));

      await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'test data' }),
        }
      );

      // Wait for async invocation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(createMessageFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            parts: [
              {
                kind: 'data',
                data: { message: 'test data' },
                metadata: { source: 'trigger', triggerId: 'trigger-123' },
              },
            ],
          }),
        })
      );
    });

    it('should include data part even for empty object payload', async () => {
      const createMessageFn = vi.fn().mockResolvedValue({});
      createMessageMock.mockReturnValue(createMessageFn);

      const triggerNoSchema = { ...testTrigger, inputSchema: null, messageTemplate: null };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerNoSchema));

      await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      // Wait for async invocation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(createMessageFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            parts: [
              {
                kind: 'data',
                data: {},
                metadata: { source: 'trigger', triggerId: 'trigger-123' },
              },
            ],
          }),
        })
      );
    });

    it('should include transformed payload in data part when outputTransform is configured', async () => {
      const createMessageFn = vi.fn().mockResolvedValue({});
      createMessageMock.mockReturnValue(createMessageFn);

      const triggerWithTransform = {
        ...testTrigger,
        inputSchema: null,
        messageTemplate: 'User: {{userName}}',
        outputTransform: {
          objectTransformation: {
            userName: 'user.name',
          },
        },
      };
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(triggerWithTransform));

      await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user: { name: 'Alice' } }),
        }
      );

      // Wait for async invocation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(createMessageFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            parts: [
              { kind: 'text', text: 'User: Alice' },
              {
                kind: 'data',
                data: { userName: 'Alice' },
                metadata: { source: 'trigger', triggerId: 'trigger-123' },
              },
            ],
          }),
        })
      );
    });
  });

  describe('Background execution error handling', () => {
    it('should update invocation status to failed when project is not found', async () => {
      const updateStatusFn = vi.fn().mockResolvedValue({});
      updateTriggerInvocationStatusMock.mockReturnValue(updateStatusFn);

      // Make getFullProjectWithRelationIds return null (project not found)
      getFullProjectWithRelationIdsMock.mockReturnValue(vi.fn().mockResolvedValue(null));

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

      // Webhook still returns 202 (async execution)
      expect(response.status).toBe(202);

      // Wait for background execution to fail and update status
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(updateStatusFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('not found'),
          }),
        })
      );
    });

    it('should update invocation status to failed when agent is not in project', async () => {
      const updateStatusFn = vi.fn().mockResolvedValue({});
      updateTriggerInvocationStatusMock.mockReturnValue(updateStatusFn);

      // Return project with no matching agent
      const projectWithoutAgent = {
        ...testProject,
        agents: {},
      };
      getFullProjectWithRelationIdsMock.mockReturnValue(
        vi.fn().mockResolvedValue(projectWithoutAgent)
      );

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

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(updateStatusFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('not found in project'),
          }),
        })
      );
    });

    it('should update invocation status to failed when agent has no default sub-agent', async () => {
      const updateStatusFn = vi.fn().mockResolvedValue({});
      updateTriggerInvocationStatusMock.mockReturnValue(updateStatusFn);

      // Return project where agent has no defaultSubAgentId
      const projectNoSubAgent = {
        ...testProject,
        agents: {
          'agent-123': {
            ...testProject.agents['agent-123'],
            defaultSubAgentId: null,
          },
        },
      };
      getFullProjectWithRelationIdsMock.mockReturnValue(
        vi.fn().mockResolvedValue(projectNoSubAgent)
      );

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

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(updateStatusFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('no default sub-agent'),
          }),
        })
      );
    });
  });

  describe('User-scoped execution', () => {
    const userScopedTrigger = {
      ...testTrigger,
      runAsUserId: 'user-abc',
    };

    it('should check permission and proceed when runAsUserId is set and user has access', async () => {
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(userScopedTrigger));
      canUseProjectStrictMock.mockResolvedValue(true);

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      expect(response.status).toBe(202);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user-abc',
        tenantId: 'tenant-123',
        projectId: 'project-123',
      });

      // Execution proceeded — conversation was created
      expect(createOrGetConversationMock).toHaveBeenCalled();
    });

    it('should mark invocation failed and skip execution when user lacks permission', async () => {
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(userScopedTrigger));
      canUseProjectStrictMock.mockResolvedValue(false);

      const updateStatusFn = vi.fn().mockResolvedValue({});
      updateTriggerInvocationStatusMock.mockReturnValue(updateStatusFn);

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      expect(response.status).toBe(202);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(updateStatusFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining("no longer has 'use' permission"),
          }),
        })
      );
      // Execution did not proceed — no conversation created
      expect(createOrGetConversationMock).not.toHaveBeenCalled();
    });

    it('should mark invocation failed when permission check throws', async () => {
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(userScopedTrigger));
      canUseProjectStrictMock.mockRejectedValue(new Error('SpiceDB unavailable'));

      const updateStatusFn = vi.fn().mockResolvedValue({});
      updateTriggerInvocationStatusMock.mockReturnValue(updateStatusFn);

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      expect(response.status).toBe(202);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(updateStatusFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('Permission check failed'),
          }),
        })
      );
      // Execution did not proceed — no conversation created
      expect(createOrGetConversationMock).not.toHaveBeenCalled();
    });

    it('should skip permission check and use anonymous initiatedBy when trigger has no runAsUserId', async () => {
      getTriggerByIdMock.mockReturnValue(vi.fn().mockResolvedValue(testTrigger));

      const response = await app.request(
        '/tenants/tenant-123/projects/project-123/agents/agent-123/triggers/trigger-123',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      expect(response.status).toBe(202);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      // Execution proceeded — conversation was created
      expect(createOrGetConversationMock).toHaveBeenCalled();
    });
  });
});
