import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectAuthenticationRequired,
  exchangeMcpAuthorizationCode,
  initiateMcpOAuthFlow,
} from '../auth-detection';
import type { PinoLogger } from '../logger';

// Mock the MCP SDK functions
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverOAuthProtectedResourceMetadata: vi.fn(),
  discoverAuthorizationServerMetadata: vi.fn(),
  registerClient: vi.fn(),
  startAuthorization: vi.fn(),
  exchangeAuthorization: vi.fn(),
}));

describe('auth-detection', () => {
  let mockLogger: PinoLogger;
  let mockDiscoverOAuthProtectedResourceMetadata: any;
  let mockDiscoverAuthorizationServerMetadata: any;
  let mockRegisterClient: any;
  let mockStartAuthorization: any;
  let mockExchangeAuthorization: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
    } as any;

    // Get the mocked functions
    const {
      discoverOAuthProtectedResourceMetadata,
      discoverAuthorizationServerMetadata,
      registerClient,
      startAuthorization,
      exchangeAuthorization,
    } = await import('@modelcontextprotocol/sdk/client/auth.js');
    mockDiscoverOAuthProtectedResourceMetadata = discoverOAuthProtectedResourceMetadata as any;
    mockDiscoverAuthorizationServerMetadata = discoverAuthorizationServerMetadata as any;
    mockRegisterClient = registerClient as any;
    mockStartAuthorization = startAuthorization as any;
    mockExchangeAuthorization = exchangeAuthorization as any;
  });

  describe('initiateMcpOAuthFlow', () => {
    it('should initiate OAuth flow with metadata discovery', async () => {
      // Mock successful metadata discovery
      mockDiscoverOAuthProtectedResourceMetadata.mockResolvedValueOnce({
        resource: 'https://api.example.com',
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['read', 'write'],
      });

      mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
        token_endpoint: 'https://auth.example.com/oauth/token',
        registration_endpoint: 'https://auth.example.com/oauth/register',
        code_challenge_methods_supported: ['S256'],
      });

      mockRegisterClient.mockResolvedValueOnce({
        client_id: 'registered-client-id',
        client_secret: 'client-secret',
      });

      mockStartAuthorization.mockResolvedValueOnce({
        authorizationUrl: new URL(
          'https://auth.example.com/oauth/authorize?client_id=registered-client-id&state=test-state'
        ),
        codeVerifier: 'test-code-verifier',
      });

      const result = await initiateMcpOAuthFlow({
        mcpServerUrl: 'https://mcp.example.com',
        redirectUri: 'http://localhost:3000/callback',
        state: 'test-state',
        logger: mockLogger,
      });

      expect(result).toEqual({
        authorizationUrl:
          'https://auth.example.com/oauth/authorize?client_id=registered-client-id&state=test-state',
        codeVerifier: 'test-code-verifier',
        state: 'test-state',
        clientInformation: {
          client_id: 'registered-client-id',
          client_secret: 'client-secret',
        },
        metadata: {
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          registration_endpoint: 'https://auth.example.com/oauth/register',
          code_challenge_methods_supported: ['S256'],
        },
        resourceUrl: 'https://api.example.com/',
        scopes: 'read write',
      });
    });

    it('should throw error when OAuth is not supported', async () => {
      mockDiscoverOAuthProtectedResourceMetadata.mockRejectedValue(new Error('Not found'));
      mockDiscoverAuthorizationServerMetadata.mockRejectedValue(new Error('Not found'));

      await expect(
        initiateMcpOAuthFlow({
          mcpServerUrl: 'https://mcp.example.com',
          redirectUri: 'http://localhost:3000/callback',
          state: 'test-state',
          logger: mockLogger,
        })
      ).rejects.toThrow('OAuth not supported by this server');
    });
  });

  describe('detectAuthenticationRequired', () => {
    it('should detect MCP OAuth via metadata discovery', async () => {
      // Mock successful metadata discovery
      mockDiscoverOAuthProtectedResourceMetadata.mockResolvedValueOnce({
        authorization_servers: ['https://auth.example.com'],
      });

      mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
        token_endpoint: 'https://auth.example.com/oauth/token',
      });

      const result = await detectAuthenticationRequired({
        serverUrl: 'https://mcp.example.com',
        toolId: 'test-tool',
        error: new Error('Test error'),
        logger: mockLogger,
      });

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { toolId: 'test-tool', serverUrl: 'https://mcp.example.com' },
        'MCP OAuth support confirmed via metadata discovery'
      );
    });

    it('should return false when metadata discovery fails', async () => {
      // Mock failed metadata discovery
      mockDiscoverOAuthProtectedResourceMetadata.mockRejectedValue(new Error('Not found'));
      mockDiscoverAuthorizationServerMetadata.mockRejectedValue(new Error('Not found'));

      const result = await detectAuthenticationRequired({
        serverUrl: 'https://mcp.example.com',
        toolId: 'test-tool',
        error: new Error('Test error'),
        logger: mockLogger,
      });

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { toolId: 'test-tool', error: 'Test error' },
        'No MCP OAuth authentication requirement detected'
      );
    });

    it('should handle protected resource metadata without authorization server', async () => {
      // Mock protected resource metadata without authorization servers
      mockDiscoverOAuthProtectedResourceMetadata.mockResolvedValueOnce({
        resource: 'https://api.example.com',
        scopes_supported: ['read', 'write'],
      });

      // Mock authorization server metadata discovery using the original server URL
      mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
        authorization_endpoint: 'https://mcp.example.com/oauth/authorize',
        token_endpoint: 'https://mcp.example.com/oauth/token',
      });

      const result = await detectAuthenticationRequired({
        serverUrl: 'https://mcp.example.com',
        toolId: 'test-tool',
        error: new Error('Test error'),
        logger: mockLogger,
      });

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { toolId: 'test-tool', serverUrl: 'https://mcp.example.com' },
        'MCP OAuth support confirmed via metadata discovery'
      );
    });
  });

  describe('exchangeMcpAuthorizationCode', () => {
    it('should exchange authorization code for tokens', async () => {
      const mockTokens = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      };

      mockExchangeAuthorization.mockResolvedValueOnce(mockTokens);

      const result = await exchangeMcpAuthorizationCode({
        mcpServerUrl: 'https://mcp.example.com',
        metadata: {
          token_endpoint: 'https://auth.example.com/oauth/token',
        },
        clientInformation: {
          client_id: 'test-client-id',
        },
        authorizationCode: 'auth-code-123',
        codeVerifier: 'code-verifier-456',
        redirectUri: 'http://localhost:3000/callback',
        logger: mockLogger,
      });

      expect(result).toEqual({
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        token_type: 'Bearer',
        expires_at: expect.any(Date),
        scope: 'read write',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        {
          tokenType: 'Bearer',
          hasRefreshToken: true,
          expiresIn: 3600,
        },
        'MCP token exchange successful'
      );
    });

    it('should handle tokens without refresh token or expiration', async () => {
      const mockTokens = {
        access_token: 'access-token-123',
        token_type: 'Bearer',
      };

      mockExchangeAuthorization.mockResolvedValueOnce(mockTokens);

      const result = await exchangeMcpAuthorizationCode({
        mcpServerUrl: 'https://mcp.example.com',
        metadata: {
          token_endpoint: 'https://auth.example.com/oauth/token',
        },
        clientInformation: {
          client_id: 'test-client-id',
        },
        authorizationCode: 'auth-code-123',
        codeVerifier: 'code-verifier-456',
        redirectUri: 'http://localhost:3000/callback',
        logger: mockLogger,
      });

      expect(result).toEqual({
        access_token: 'access-token-123',
        refresh_token: undefined,
        token_type: 'Bearer',
        expires_at: undefined,
        scope: undefined,
      });
    });
  });
});
