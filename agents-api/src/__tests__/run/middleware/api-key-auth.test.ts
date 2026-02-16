import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  validateAndGetApiKeyMock,
  updateApiKeyLastUsedMock,
  getAgentByIdMock,
  verifyServiceTokenMock,
  validateTargetAgentMock,
  isSlackUserTokenMock,
  verifySlackUserTokenMock,
  verifyTempTokenMock,
  canUseProjectStrictMock,
  createAgentsRunDatabaseClientMock,
} = vi.hoisted(() => ({
  validateAndGetApiKeyMock: vi.fn(),
  updateApiKeyLastUsedMock: vi.fn(),
  getAgentByIdMock: vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-agent',
      name: 'Test Agent',
      contextConfigId: 'test-context',
    })
  ),
  verifyServiceTokenMock: vi.fn(),
  validateTargetAgentMock: vi.fn(),
  isSlackUserTokenMock: vi.fn().mockReturnValue(false),
  verifySlackUserTokenMock: vi.fn(),
  verifyTempTokenMock: vi.fn(),
  canUseProjectStrictMock: vi.fn(),
  createAgentsRunDatabaseClientMock: vi.fn().mockReturnValue({}),
}));

// Mock the dependencies before imports
vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: validateAndGetApiKeyMock,
  updateApiKeyLastUsed: updateApiKeyLastUsedMock,
  getAgentById: getAgentByIdMock,
  verifyServiceToken: verifyServiceTokenMock,
  validateTargetAgent: validateTargetAgentMock,
  isSlackUserToken: isSlackUserTokenMock,
  verifySlackUserToken: verifySlackUserTokenMock,
  verifyTempToken: verifyTempTokenMock,
  canUseProjectStrict: canUseProjectStrictMock,
  createAgentsRunDatabaseClient: createAgentsRunDatabaseClientMock,
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { type ApiKeySelect, validateAndGetApiKey } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { env } from '../../../env';
import {
  runApiKeyAuth as apiKeyAuth,
  runOptionalAuth as optionalAuth,
} from '../../../middleware/runAuth';

vi.mock('../../../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined as string | undefined,
  },
}));

describe('API Key Authentication Middleware', () => {
  let app: Hono;
  const originalEnv = process.env.ENVIRONMENT;
  const mockDbClient = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    // Set db in context before apiKeyAuth middleware
    app.use('*', async (c, next) => {
      c.set('db' as never, mockDbClient);
      await next();
    });
    // Override the test environment to allow proper testing
    process.env.ENVIRONMENT = 'production';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore the original environment
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('apiKeyAuth middleware', () => {
    it('should reject requests without authorization header', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/');

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid authorization header');
    });

    it('should reject requests with invalid authorization header format', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Basic sometoken',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid authorization header');
    });

    it('should reject requests with short API key', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer short',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid API key format');
    });

    it('should reject invalid or expired API keys', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      // Mock JWT verification to also fail
      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: false,
        error: 'Invalid token',
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid team agent token: Invalid token');
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(
        'sk_test_1234567890abcdef.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should accept valid API keys and set execution context', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_123',
        name: 'test-api-key',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'agent_123',
        publicId: 'pub_123',
        keyHash: 'hash_123',
        keyPrefix: 'sk_test_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);
      updateApiKeyLastUsedMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'sk_test_1234567890abcdef.verylongsecretkey',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'agent_123',
        apiKeyId: 'key_123',
        baseUrl: expect.stringContaining('http'),
      });
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(
        'sk_test_1234567890abcdef.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(validateAndGetApiKey).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain('Authentication failed');
    });
  });

  describe('apiKeyAuth middleware with bypass secret', () => {
    beforeEach(() => {
      // Set the bypass secret
      env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET = 'test-bypass-secret';
    });

    afterEach(() => {
      // Clear the bypass secret
      env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET = undefined;
    });

    it('should accept requests with valid bypass secret', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
          'x-inkeep-tenant-id': 'tenant-123',
          'x-inkeep-project-id': 'project-456',
          'x-inkeep-agent-id': 'agent-789',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'test-bypass-secret',
        tenantId: 'tenant-123',
        projectId: 'project-456',
        agentId: 'agent-789',
        apiKeyId: 'bypass',
        baseUrl: expect.stringContaining('http'),
      });
    });

    it('should validate API key against database when token does not match bypass secret', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_456',
        name: 'test-api-key',
        tenantId: 'tenant_456',
        projectId: 'project_456',
        agentId: 'agent_456',
        publicId: 'pub_456',
        keyHash: 'hash_456',
        keyPrefix: 'sk_prod_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_prod_differentkey123456.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'sk_prod_differentkey123456.verylongsecretkey',
        tenantId: 'tenant_456',
        projectId: 'project_456',
        agentId: 'agent_456',
        apiKeyId: 'key_456',
      });
      expect(validateAndGetApiKey).toHaveBeenCalledWith(
        'sk_prod_differentkey123456.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should reject invalid API key when bypass secret is set but key does not match', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      // Mock JWT verification to also fail
      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: false,
        error: 'Invalid token',
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid_key_not_matching_bypass',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid team agent token: Invalid token');
      expect(validateAndGetApiKey).toHaveBeenCalledWith(
        'invalid_key_not_matching_bypass',
        expect.any(Object)
      );
    });

    it('should reject bypass secret without required headers', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
          // Missing x-inkeep-tenant-id, x-inkeep-project-id, x-inkeep-agent-id
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid tenant, project, or agent ID');
    });
  });

  describe('Team Agent JWT Authentication', () => {
    beforeEach(() => {
      // Set up default mocks for JWT functions
      verifyServiceTokenMock.mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });
      validateTargetAgentMock.mockReturnValue(true);
    });

    it('should accept valid team agent JWT tokens', async () => {
      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'target-agent',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'target-agent',
        apiKeyId: 'team-agent-token',
        baseUrl: expect.stringContaining('http'),
        metadata: {
          teamDelegation: true,
          originAgentId: 'origin-agent',
        },
      });
      expect(verifyServiceTokenMock).toHaveBeenCalledWith(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      );
    });

    it('should reject invalid team agent JWT tokens', async () => {
      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: false,
        error: 'Invalid signature',
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid.jwt.token',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid team agent token: Invalid signature');
    });

    it('should reject team agent JWT tokens with target agent mismatch', async () => {
      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'target-agent',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      validateTargetAgentMock.mockReturnValueOnce(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
          'x-inkeep-sub-agent-id': 'different-agent',
        },
      });

      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Token not valid for the requested agent');
    });

    it('should fallback to JWT when API key validation fails', async () => {
      // Mock API key validation to fail
      validateAndGetApiKeyMock.mockResolvedValueOnce(null);

      // Mock JWT validation to succeed
      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'target-agent',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'target-agent',
        apiKeyId: 'team-agent-token',
        metadata: {
          teamDelegation: true,
          originAgentId: 'origin-agent',
        },
      });
    });

    it('should handle JWT verification errors gracefully', async () => {
      // Mock API key validation to fail
      validateAndGetApiKeyMock.mockResolvedValueOnce(null);

      // Mock JWT verification to throw an error
      verifyServiceTokenMock.mockRejectedValueOnce(new Error('JWT verification failed'));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        },
      });

      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain('Authentication failed');
    });

    it('should resolve agentId from x-inkeep-agent-id header in team delegation context', async () => {
      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'sub-agent-being-called',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
          'x-inkeep-agent-id': 'parent-team-agent',
          'x-inkeep-sub-agent-id': 'sub-agent-being-called',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // The agentId should be the parent agent from the header, not the JWT aud (sub-agent).
      // This is critical for project lookup: project.agents[parentAgent].subAgents[subAgent]
      expect(body.agentId).toBe('parent-team-agent');
      expect(body.subAgentId).toBe('sub-agent-being-called');
      expect(body.metadata).toMatchObject({
        teamDelegation: true,
        originAgentId: 'origin-agent',
      });
    });

    it('should use JWT aud as agentId when x-inkeep-agent-id header is absent in team delegation', async () => {
      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'target-agent',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
          // No x-inkeep-agent-id header
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Without the parent agent header, falls back to JWT aud
      expect(body.agentId).toBe('target-agent');
    });

    it('should preserve JWT token as apiKey for chained A2A calls', async () => {
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const mockJwtPayload = {
        iss: 'inkeep-agents',
        aud: 'target-agent',
        sub: 'origin-agent',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      verifyServiceTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockJwtPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // apiKey must be the actual JWT token, NOT a placeholder like 'team-agent-jwt'.
      // This is critical: 'team-agent-jwt' (14 chars) fails the apiKey.length < 16 check
      // on subsequent chained A2A calls, causing 401 errors in production.
      expect(body.apiKey).toBe(jwtToken);
      expect(body.apiKey.length).toBeGreaterThan(16);
      expect(body.apiKey).toMatch(/^eyJ/);
    });
  });

  describe('Slack User JWT Authentication', () => {
    const mockSlackPayload = {
      iss: 'inkeep-auth',
      aud: 'inkeep-api',
      sub: 'user_123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      tokenUse: 'slackUser',
      act: { sub: 'inkeep-work-app-slack' },
      tenantId: 'tenant_456',
      slack: {
        teamId: 'T12345678',
        userId: 'U87654321',
      },
    };

    const slackToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJpbmtlZXAtYXV0aCIsInRva2VuVXNlIjoic2xhY2tVc2VyIn0.test-signature-long-enough';

    beforeEach(() => {
      isSlackUserTokenMock.mockReturnValue(false);
    });

    it('should accept valid slack user JWT with SpiceDB check', async () => {
      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockSlackPayload,
      });
      canUseProjectStrictMock.mockResolvedValueOnce(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: slackToken,
        tenantId: 'tenant_456',
        projectId: 'project_789',
        agentId: 'agent_abc',
        apiKeyId: 'slack-user-token',
        metadata: {
          initiatedBy: { type: 'user', id: 'user_123' },
        },
      });
      expect(body.metadata.slack).toBeUndefined();
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user_123',
        projectId: 'project_789',
      });
    });

    it('should bypass SpiceDB when channel-authorized with matching project', async () => {
      const authorizedPayload = {
        ...mockSlackPayload,
        slack: {
          ...mockSlackPayload.slack,
          authorized: true,
          authSource: 'channel',
          channelId: 'C12345678',
          authorizedProjectId: 'project_789',
        },
      };

      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: authorizedPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        tenantId: 'tenant_456',
        projectId: 'project_789',
        agentId: 'agent_abc',
        apiKeyId: 'slack-user-token',
        metadata: {
          initiatedBy: { type: 'user', id: 'user_123' },
          slack: {
            authorized: true,
            authSource: 'channel',
            channelId: 'C12345678',
            teamId: 'T12345678',
          },
        },
      });
      // SpiceDB should NOT be called when channel-authorized
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });

    it('should fall through to SpiceDB when authorizedProjectId does not match (D8)', async () => {
      const mismatchPayload = {
        ...mockSlackPayload,
        slack: {
          ...mockSlackPayload.slack,
          authorized: true,
          authSource: 'channel',
          channelId: 'C12345678',
          authorizedProjectId: 'project_DIFFERENT',
        },
      };

      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mismatchPayload,
      });
      canUseProjectStrictMock.mockResolvedValueOnce(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // SpiceDB SHOULD be called because project doesn't match
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user_123',
        projectId: 'project_789',
      });
      // metadata.slack should NOT be set (bypass didn't apply)
      expect(body.metadata.slack).toBeUndefined();
    });

    it('should fall through to SpiceDB when authorized is not true', async () => {
      const noAuthPayload = {
        ...mockSlackPayload,
        slack: {
          ...mockSlackPayload.slack,
          authorized: false,
          authorizedProjectId: 'project_789',
        },
      };

      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: noAuthPayload,
      });
      canUseProjectStrictMock.mockResolvedValueOnce(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      expect(canUseProjectStrictMock).toHaveBeenCalled();
    });

    it('should fall through to SpiceDB when channel auth claims are missing', async () => {
      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockSlackPayload,
      });
      canUseProjectStrictMock.mockResolvedValueOnce(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      expect(canUseProjectStrictMock).toHaveBeenCalled();
    });

    it('should deny access when SpiceDB denies and no channel auth', async () => {
      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockSlackPayload,
      });
      canUseProjectStrictMock.mockResolvedValueOnce(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('insufficient permissions');
    });

    it('should reject when missing required headers', async () => {
      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockSlackPayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          // Missing x-inkeep-project-id and x-inkeep-agent-id
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('requires x-inkeep-project-id and x-inkeep-agent-id');
    });

    it('should return 503 when SpiceDB is unavailable', async () => {
      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: mockSlackPayload,
      });
      canUseProjectStrictMock.mockRejectedValueOnce(new Error('SpiceDB connection failed'));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(503);
      const body = await res.text();
      expect(body).toContain('Authorization service temporarily unavailable');
    });

    it('should bypass SpiceDB with workspace auth source', async () => {
      const workspacePayload = {
        ...mockSlackPayload,
        slack: {
          ...mockSlackPayload.slack,
          authorized: true,
          authSource: 'workspace',
          channelId: 'C12345678',
          authorizedProjectId: 'project_789',
        },
      };

      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: workspacePayload,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.slack).toMatchObject({
        authorized: true,
        authSource: 'workspace',
        teamId: 'T12345678',
      });
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });

    it('should default authSource to channel when missing from JWT', async () => {
      const payloadWithoutAuthSource = {
        ...mockSlackPayload,
        slack: {
          ...mockSlackPayload.slack,
          authorized: true,
          authorizedProjectId: 'project_789',
        },
      };

      isSlackUserTokenMock.mockReturnValueOnce(true);
      verifySlackUserTokenMock.mockResolvedValueOnce({
        valid: true,
        payload: payloadWithoutAuthSource,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${slackToken}`,
          'x-inkeep-project-id': 'project_789',
          'x-inkeep-agent-id': 'agent_abc',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.slack.authSource).toBe('channel');
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth middleware', () => {
    it('should continue without auth when no header is present', async () => {
      app.use('*', optionalAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json({ hasAuth: !!executionContext });
      });

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasAuth).toBe(false);
    });

    it('should validate API key when header is present', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_123',
        name: 'test-api-key',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'agent_123',
        publicId: 'pub_123',
        keyHash: 'hash_123',
        keyPrefix: 'sk_test_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);
      updateApiKeyLastUsedMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

      app.use('*', optionalAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json({
          hasAuth: !!executionContext,
          context: executionContext,
        });
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasAuth).toBe(true);
      expect(body.context).toMatchObject({
        apiKey: 'sk_test_1234567890abcdef.verylongsecretkey',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'agent_123',
        apiKeyId: 'key_123',
        baseUrl: expect.stringContaining('http'),
      });
    });

    it('should reject invalid API key when header is present', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      app.use('*', optionalAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid_key',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid API key format');
    });
  });
});
