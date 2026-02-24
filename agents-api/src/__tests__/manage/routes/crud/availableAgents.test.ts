import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { verifyTempTokenMock, listUsableProjectIdsMock, listAgentsAcrossProjectMainBranchesMock } =
  vi.hoisted(() => ({
    verifyTempTokenMock: vi.fn(),
    listUsableProjectIdsMock: vi.fn(),
    listAgentsAcrossProjectMainBranchesMock: vi.fn(),
  }));

// Mock the dependencies before imports
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    verifyTempToken: verifyTempTokenMock,
    listUsableProjectIds: listUsableProjectIdsMock,
    listAgentsAcrossProjectMainBranches: listAgentsAcrossProjectMainBranchesMock,
    getLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  };
});

vi.mock('../../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: 'dGVzdC1wdWJsaWMta2V5', // base64 encoded test key
  },
}));

vi.mock('../../../../data/db/manageDbClient.js', () => ({
  default: {},
}));

import availableAgentsRoutes from '../../../../domains/manage/routes/availableAgents';

describe('Available Agents Route - /manage/available-agents', () => {
  // Sample JWT-like token (starts with eyJ)
  const mockJwtToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZXN0IjoidG9rZW4ifQ.signature';

  // Sample verified JWT payload
  const mockVerifiedPayload = {
    tenantId: 'test-tenant',
    type: 'temporary' as const,
    sub: 'user-123',
  };

  // Sample agents data
  const mockAgents = [
    { agentId: 'agent-1', agentName: 'Agent One', projectId: 'project-1' },
    { agentId: 'agent-2', agentName: 'Agent Two', projectId: 'project-1' },
    { agentId: 'agent-3', agentName: 'Agent Three', projectId: 'project-2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: JWT verification succeeds
    verifyTempTokenMock.mockResolvedValue(mockVerifiedPayload);
    // Default: User has access to some projects
    listUsableProjectIdsMock.mockResolvedValue(['project-1', 'project-2']);
    // Default: Some agents exist
    listAgentsAcrossProjectMainBranchesMock.mockResolvedValue(mockAgents);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /', () => {
    describe('Authentication', () => {
      it('should reject requests without authorization header', async () => {
        const res = await availableAgentsRoutes.request('/');

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Missing or invalid authorization header');
      });

      it('should reject requests with non-Bearer authorization', async () => {
        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: 'Basic sometoken',
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Missing or invalid authorization header');
      });

      it('should reject requests with non-JWT token', async () => {
        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: 'Bearer sk_test_not_a_jwt_token',
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Invalid token format');
      });

      it('should reject requests with invalid/expired JWT', async () => {
        verifyTempTokenMock.mockRejectedValue(new Error('Token has expired'));

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Invalid or expired token');
      });

      it('should reject requests with malformed JWT', async () => {
        verifyTempTokenMock.mockRejectedValue(new Error('Malformed token'));

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Invalid or expired token');
      });
    });

    describe('Successful responses', () => {
      it('should return available agents when user has access to projects', async () => {
        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toEqual(mockAgents);
        expect(body.data).toHaveLength(3);

        // Verify JWT was verified
        expect(verifyTempTokenMock).toHaveBeenCalledWith(expect.any(String), mockJwtToken);

        // Verify SpiceDB was called with the user ID and tenant ID from JWT
        expect(listUsableProjectIdsMock).toHaveBeenCalledWith({
          userId: 'user-123',
          tenantId: 'test-tenant',
        });

        // Verify agents were fetched with correct params
        expect(listAgentsAcrossProjectMainBranchesMock).toHaveBeenCalledWith(expect.anything(), {
          tenantId: 'test-tenant',
          projectIds: ['project-1', 'project-2'],
        });
      });

      it('should return empty array when user has no project access', async () => {
        listUsableProjectIdsMock.mockResolvedValue([]);

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toEqual([]);

        // Verify SpiceDB was called
        expect(listUsableProjectIdsMock).toHaveBeenCalledWith({
          userId: 'user-123',
          tenantId: 'test-tenant',
        });

        // Verify agents query was NOT called (short-circuit when no projects)
        expect(listAgentsAcrossProjectMainBranchesMock).not.toHaveBeenCalled();
      });

      it('should return empty array when no agents exist in accessible projects', async () => {
        listAgentsAcrossProjectMainBranchesMock.mockResolvedValue([]);

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toEqual([]);
      });

      it('should handle single project access', async () => {
        listUsableProjectIdsMock.mockResolvedValue(['project-1']);
        const singleProjectAgents = [
          { agentId: 'agent-1', agentName: 'Agent One', projectId: 'project-1' },
        ];
        listAgentsAcrossProjectMainBranchesMock.mockResolvedValue(singleProjectAgents);

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toEqual(singleProjectAgents);
        expect(body.data).toHaveLength(1);

        expect(listAgentsAcrossProjectMainBranchesMock).toHaveBeenCalledWith(expect.anything(), {
          tenantId: 'test-tenant',
          projectIds: ['project-1'],
        });
      });
    });

    describe('Response structure', () => {
      it('should return agents with correct schema fields', async () => {
        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();

        for (const agent of body.data) {
          expect(agent).toHaveProperty('agentId');
          expect(agent).toHaveProperty('agentName');
          expect(agent).toHaveProperty('projectId');
          expect(typeof agent.agentId).toBe('string');
          expect(typeof agent.agentName).toBe('string');
          expect(typeof agent.projectId).toBe('string');
        }
      });
    });

    describe('Error handling', () => {
      it('should handle SpiceDB errors gracefully', async () => {
        listUsableProjectIdsMock.mockRejectedValue(new Error('SpiceDB connection failed'));

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(500);
      });

      it('should handle database errors gracefully', async () => {
        listAgentsAcrossProjectMainBranchesMock.mockRejectedValue(
          new Error('Database connection failed')
        );

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(500);
      });
    });

    describe('Different user scenarios', () => {
      it('should use correct userId from JWT payload', async () => {
        const customPayload = {
          ...mockVerifiedPayload,
          sub: 'different-user-456',
          tenantId: 'different-tenant',
        };
        verifyTempTokenMock.mockResolvedValue(customPayload);

        await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(listUsableProjectIdsMock).toHaveBeenCalledWith({
          userId: 'different-user-456',
          tenantId: 'different-tenant',
        });
        expect(listAgentsAcrossProjectMainBranchesMock).toHaveBeenCalledWith(expect.anything(), {
          tenantId: 'different-tenant',
          projectIds: expect.any(Array),
        });
      });

      it('should handle users with many project accesses', async () => {
        const manyProjects = Array.from({ length: 50 }, (_, i) => `project-${i}`);
        listUsableProjectIdsMock.mockResolvedValue(manyProjects);

        const res = await availableAgentsRoutes.request('/', {
          headers: {
            Authorization: `Bearer ${mockJwtToken}`,
          },
        });

        expect(res.status).toBe(200);
        expect(listAgentsAcrossProjectMainBranchesMock).toHaveBeenCalledWith(expect.anything(), {
          tenantId: 'test-tenant',
          projectIds: manyProjects,
        });
      });
    });
  });
});
