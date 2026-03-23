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

// Mock the MCP client to avoid real connections
vi.mock('../../utils/mcp-client', () => ({
  McpClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    getServerInstructions: vi.fn().mockReturnValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock credential lookup
vi.mock('../../data-access/manage/credentialReferences', () => ({
  getCredentialReference: vi.fn(() => vi.fn().mockResolvedValue(null)),
  getUserScopedCredentialReference: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

// Mock third-party auth check
const mockIsThirdPartyMCPServerAuthenticated = vi.fn();
vi.mock('../../utils', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    isThirdPartyMCPServerAuthenticated: (...args: unknown[]) =>
      mockIsThirdPartyMCPServerAuthenticated(...args),
  };
});

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
