import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbResultToMcpTool } from '../../data-access/manage/tools';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import type { ToolSelect } from '../../types/index';
import { testManageDbClient } from '../setup';

// Mock external dependencies
vi.mock('../../db/runtime/runtime-client', () => ({
  createAgentsRunDatabaseClient: vi.fn(() => ({})),
}));

vi.mock('../../data-access/runtime/cascade-delete', () => ({
  cascadeDeleteByTool: vi.fn(() => vi.fn()),
}));

vi.mock('../../dolt/schema-sync', () => ({
  getActiveBranch: vi.fn(() => vi.fn().mockResolvedValue('some_other_branch')),
}));

// Mock the MCP client — controllable per-test via mockMcpConnect
const mockMcpConnect = vi.fn().mockResolvedValue(undefined);
const mockMcpTools = vi.fn().mockResolvedValue({});
const mockMcpGetInstructions = vi.fn().mockReturnValue(undefined);
const mockMcpDisconnect = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/mcp-client', () => ({
  McpClient: vi.fn().mockImplementation(() => ({
    connect: mockMcpConnect,
    tools: mockMcpTools,
    getInstructions: mockMcpGetInstructions,
    disconnect: mockMcpDisconnect,
  })),
}));

// Mock credential lookup
vi.mock('../../data-access/manage/credentialReferences', () => ({
  getCredentialReference: vi.fn(() => vi.fn().mockResolvedValue(null)),
  getUserScopedCredentialReference: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

// Mock CredentialStuffer to avoid real credential resolution
vi.mock('../../credential-stuffer', () => ({
  CredentialStuffer: vi.fn().mockImplementation(() => ({
    buildMcpServerConfig: vi.fn().mockResolvedValue({
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer mock-token' },
    }),
  })),
}));

// Mock third-party auth check and auth detection
const mockIsThirdPartyMCPServerAuthenticated = vi.fn();
const mockDetectAuthenticationRequired = vi.fn().mockResolvedValue(false);
vi.mock('../../utils', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    isThirdPartyMCPServerAuthenticated: (...args: unknown[]) =>
      mockIsThirdPartyMCPServerAuthenticated(...args),
    detectAuthenticationRequired: (...args: unknown[]) => mockDetectAuthenticationRequired(...args),
  };
});

const makeGenericToolDbResult = (overrides: Partial<ToolSelect> = {}): ToolSelect =>
  ({
    id: 'tool-generic-1',
    tenantId: 'test-tenant',
    projectId: 'test-project',
    name: 'Generic MCP Tool',
    type: 'mcp',
    config: {
      type: 'mcp',
      mcp: {
        server: { url: 'https://mcp.linear.app/mcp' },
      },
    },
    credentialReferenceId: null,
    credentialScope: 'project',
    capabilities: null,
    headers: null,
    imageUrl: null,
    isWorkApp: false,
    lastError: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as unknown as ToolSelect;

const makeComposioToolDbResult = (overrides: Partial<ToolSelect> = {}): ToolSelect =>
  ({
    id: 'tool-composio-1',
    tenantId: 'test-tenant',
    projectId: 'test-project',
    name: 'Composio Tool',
    type: 'mcp',
    config: {
      type: 'mcp',
      mcp: {
        server: { url: 'https://mcp.composio.dev/some-server' },
      },
    },
    credentialReferenceId: null,
    credentialScope: 'project',
    capabilities: null,
    headers: null,
    imageUrl: null,
    isWorkApp: false,
    lastError: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as unknown as ToolSelect;

describe('dbResultToMcpTool - Composio "both or none" policy', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = {
      ...testManageDbClient,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{}]),
          }),
        }),
      }),
    } as any;
    vi.clearAllMocks();
    mockMcpGetInstructions.mockReturnValue(undefined);
  });

  it('should set status to needs_auth when Composio tool has no connectedAccountId', async () => {
    const dbResult = makeComposioToolDbResult({
      credentialReferenceId: null,
    });

    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Third-party authentication required');
    expect(result.lastError).toContain('pin a specific credential');
  });

  it('should check auth status when Composio tool has a credential with connectedAccountId', async () => {
    const { getCredentialReference } = await import(
      '../../data-access/manage/credentialReferences'
    );
    vi.mocked(getCredentialReference).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'cred-1',
        retrievalParams: { connectedAccountId: 'composio-account-123' },
        createdBy: 'user@example.com',
      })
    );

    mockIsThirdPartyMCPServerAuthenticated.mockResolvedValue({
      authenticated: true,
      connectedAccountId: 'composio-account-123',
    });

    const dbResult = makeComposioToolDbResult({
      credentialReferenceId: 'cred-1',
    });

    const result = await dbResultToMcpTool(dbResult, db);

    expect(mockIsThirdPartyMCPServerAuthenticated).toHaveBeenCalledWith(
      'test-tenant',
      'test-project',
      'https://mcp.composio.dev/some-server',
      'project',
      undefined
    );
    expect(result.status).not.toBe('needs_auth');
  });

  it('should set status to needs_auth when auth check returns not authenticated', async () => {
    const { getCredentialReference } = await import(
      '../../data-access/manage/credentialReferences'
    );
    vi.mocked(getCredentialReference).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'cred-1',
        retrievalParams: { connectedAccountId: 'composio-account-123' },
        createdBy: 'user@example.com',
      })
    );

    mockIsThirdPartyMCPServerAuthenticated.mockResolvedValue({
      authenticated: false,
    });

    const dbResult = makeComposioToolDbResult({
      credentialReferenceId: 'cred-1',
    });

    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Try authenticating again');
  });

  it('should set status to unavailable (not needs_auth) when auth check errors', async () => {
    const { getCredentialReference } = await import(
      '../../data-access/manage/credentialReferences'
    );
    vi.mocked(getCredentialReference).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'cred-1',
        retrievalParams: { connectedAccountId: 'composio-account-123' },
        createdBy: 'user@example.com',
      })
    );

    mockIsThirdPartyMCPServerAuthenticated.mockResolvedValue({
      authenticated: false,
      error: true,
    });

    const dbResult = makeComposioToolDbResult({
      credentialReferenceId: 'cred-1',
    });

    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('unavailable');
    expect(result.lastError).toContain('Could not verify');
    expect(result.status).not.toBe('needs_auth');
  });

  it('should set status to needs_auth when credential exists but has no connectedAccountId', async () => {
    const { getCredentialReference } = await import(
      '../../data-access/manage/credentialReferences'
    );
    vi.mocked(getCredentialReference).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'cred-1',
        retrievalParams: {},
        createdBy: 'user@example.com',
      })
    );

    const dbResult = makeComposioToolDbResult({
      credentialReferenceId: 'cred-1',
    });

    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('pin a specific credential');
    expect(mockIsThirdPartyMCPServerAuthenticated).not.toHaveBeenCalled();
  });
});

const mockCredentialStoreRegistry = { get: vi.fn() } as any;

describe('dbResultToMcpTool - three-tier error classification', () => {
  let db: AgentsManageDatabaseClient;

  const setupCredential = async (overrides: Record<string, unknown> = {}) => {
    const { getCredentialReference } = await import(
      '../../data-access/manage/credentialReferences'
    );
    vi.mocked(getCredentialReference).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'cred-1',
        credentialStoreId: 'store-1',
        retrievalParams: { accessToken: 'mock-token' },
        createdBy: 'user@example.com',
        ...overrides,
      })
    );
  };

  beforeEach(() => {
    db = {
      ...testManageDbClient,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{}]),
          }),
        }),
      }),
    } as any;
    vi.clearAllMocks();
    mockMcpConnect.mockResolvedValue(undefined);
    mockMcpTools.mockResolvedValue({});
    mockMcpGetInstructions.mockReturnValue(undefined);
  });

  it('should set status to unavailable when credential exists and server returns McpError 500', async () => {
    await setupCredential();
    mockMcpConnect.mockRejectedValue(
      new McpError(ErrorCode.InternalError, 'Internal server error')
    );

    const dbResult = makeGenericToolDbResult({ credentialReferenceId: 'cred-1' });
    const result = await dbResultToMcpTool(dbResult, db, mockCredentialStoreRegistry);

    expect(result.status).toBe('unavailable');
    expect(result.lastError).toContain('Connection failed');
    expect(mockDetectAuthenticationRequired).not.toHaveBeenCalled();
  });

  it('should set status to unavailable when credential exists and a generic non-auth error occurs', async () => {
    await setupCredential();
    mockMcpConnect.mockRejectedValue(new Error('Something unexpected happened'));

    const dbResult = makeGenericToolDbResult({ credentialReferenceId: 'cred-1' });
    const result = await dbResultToMcpTool(dbResult, db, mockCredentialStoreRegistry);

    expect(result.status).toBe('unavailable');
    expect(result.lastError).toContain('Server temporarily unavailable');
    expect(mockDetectAuthenticationRequired).not.toHaveBeenCalled();
  });

  it('should set status to needs_auth when credential exists but server returns 401', async () => {
    await setupCredential();
    mockMcpConnect.mockRejectedValue(new StreamableHTTPError(401, 'Unauthorized'));

    const dbResult = makeGenericToolDbResult({ credentialReferenceId: 'cred-1' });
    const result = await dbResultToMcpTool(dbResult, db, mockCredentialStoreRegistry);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Authentication required');
  });

  it('should set status to needs_auth when credential exists but UnauthorizedError is thrown', async () => {
    await setupCredential();
    mockMcpConnect.mockRejectedValue(new UnauthorizedError('Token revoked'));

    const dbResult = makeGenericToolDbResult({ credentialReferenceId: 'cred-1' });
    const result = await dbResultToMcpTool(dbResult, db, mockCredentialStoreRegistry);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Authentication required');
  });

  it('should set status to needs_auth when no credential and OAuth is detected', async () => {
    mockMcpConnect.mockRejectedValue(new Error('Connection refused'));
    mockDetectAuthenticationRequired.mockResolvedValue(true);

    const dbResult = makeGenericToolDbResult();
    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Authentication required');
  });

  it('should set status to unhealthy when no credential and no OAuth detected', async () => {
    mockMcpConnect.mockRejectedValue(new Error('Some unknown error'));
    mockDetectAuthenticationRequired.mockResolvedValue(false);

    const dbResult = makeGenericToolDbResult();
    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('unhealthy');
    expect(result.lastError).toContain('Some unknown error');
  });

  it('should set status to unavailable for network errors regardless of credential', async () => {
    const networkError = new Error('fetch failed');
    (networkError as any).cause = { code: 'ECONNREFUSED' };
    mockMcpConnect.mockRejectedValue(networkError);

    const dbResult = makeGenericToolDbResult();
    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('unavailable');
    expect(result.lastError).toContain('Connection failed');
    expect(mockDetectAuthenticationRequired).not.toHaveBeenCalled();
  });

  it('should set status to unavailable for StreamableHTTPError 500', async () => {
    mockMcpConnect.mockRejectedValue(new StreamableHTTPError(500, 'Internal Server Error'));

    const dbResult = makeGenericToolDbResult();
    const result = await dbResultToMcpTool(dbResult, db);

    expect(result.status).toBe('unavailable');
    expect(result.lastError).toContain('Connection failed');
  });

  it('should set status to needs_auth for StreamableHTTPError 403 even with credential', async () => {
    await setupCredential();
    mockMcpConnect.mockRejectedValue(new StreamableHTTPError(403, 'Forbidden'));

    const dbResult = makeGenericToolDbResult({ credentialReferenceId: 'cred-1' });
    const result = await dbResultToMcpTool(dbResult, db, mockCredentialStoreRegistry);

    expect(result.status).toBe('needs_auth');
    expect(result.lastError).toContain('Authentication required');
  });
});

describe('dbResultToMcpTool - serverInstructions sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpConnect.mockResolvedValue(undefined);
    mockMcpTools.mockResolvedValue({
      search: {
        description: 'Search tool',
        inputSchema: {},
      },
    });
    mockMcpGetInstructions.mockReturnValue(undefined);
  });

  it('sanitizes backslash-newline sequences before persisting capabilities', async () => {
    const badInstructions =
      'When passing string values, use literal backslash-n (' + '\\' + '\n' + ') characters.';
    const sanitizedInstructions =
      'When passing string values, use literal backslash-n (\\n) characters.';

    mockMcpGetInstructions.mockReturnValue(badInstructions);

    const mockReturning = vi.fn().mockResolvedValue([{}]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
    const db = {
      ...testManageDbClient,
      update: mockUpdate,
    } as any as AgentsManageDatabaseClient;

    const result = await dbResultToMcpTool(makeGenericToolDbResult(), db);

    expect(result.status).toBe('healthy');
    expect(result.capabilities).toEqual({
      serverInstructions: sanitizedInstructions,
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: {
          serverInstructions: sanitizedInstructions,
        },
      })
    );
  });
});
