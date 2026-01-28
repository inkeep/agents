import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCheck,
  updateCheck,
  VercelApiError,
  type CheckResponse,
  type VercelChecksClientConfig,
} from '../../domains/manage/routes/vercelChecks/client';

describe('Vercel Checks API client', () => {
  const mockConfig: VercelChecksClientConfig = {
    token: 'test-token-12345',
  };

  const mockConfigWithTeamId: VercelChecksClientConfig = {
    token: 'test-token-12345',
    teamId: 'team_abc123',
  };

  const mockCheckResponse: CheckResponse = {
    id: 'check_abc123',
    name: 'Readiness Check',
    status: 'registered',
    blocking: true,
    integrationId: 'icfg_xyz789',
    deploymentId: 'dpl_test123',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    rerequestable: true,
    conclusion: null,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createCheck', () => {
    it('should create a check with correct request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await createCheck(
        'dpl_test123',
        {
          name: 'Readiness Check',
          blocking: true,
          rerequestable: true,
        },
        mockConfig
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/deployments/dpl_test123/checks',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Readiness Check',
            blocking: true,
            rerequestable: true,
          }),
        }
      );

      expect(result).toEqual(mockCheckResponse);
    });

    it('should include teamId in query params when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      await createCheck(
        'dpl_test123',
        {
          name: 'Readiness Check',
          blocking: true,
        },
        mockConfigWithTeamId
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/deployments/dpl_test123/checks?teamId=team_abc123',
        expect.any(Object)
      );
    });

    it('should include detailsUrl when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      await createCheck(
        'dpl_test123',
        {
          name: 'Readiness Check',
          blocking: true,
          detailsUrl: 'https://example.com/details',
        },
        mockConfig
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            name: 'Readiness Check',
            blocking: true,
            detailsUrl: 'https://example.com/details',
          }),
        })
      );
    });

    it('should throw VercelApiError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Invalid request body',
                code: 'invalid_request',
              },
            })
          ),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        createCheck(
          'dpl_test123',
          {
            name: 'Readiness Check',
            blocking: true,
          },
          mockConfig
        )
      ).rejects.toThrow(VercelApiError);

      try {
        await createCheck(
          'dpl_test123',
          {
            name: 'Readiness Check',
            blocking: true,
          },
          mockConfig
        );
      } catch (error) {
        expect(error).toBeInstanceOf(VercelApiError);
        expect((error as VercelApiError).message).toBe('Invalid request body');
        expect((error as VercelApiError).status).toBe(400);
        expect((error as VercelApiError).code).toBe('invalid_request');
      }
    });

    it('should handle non-JSON error responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      vi.stubGlobal('fetch', mockFetch);

      try {
        await createCheck(
          'dpl_test123',
          {
            name: 'Readiness Check',
            blocking: true,
          },
          mockConfig
        );
      } catch (error) {
        expect(error).toBeInstanceOf(VercelApiError);
        expect((error as VercelApiError).message).toBe('Internal Server Error');
        expect((error as VercelApiError).status).toBe(500);
      }
    });

    it('should handle 401 unauthorized error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Invalid token',
                code: 'unauthorized',
              },
            })
          ),
      });
      vi.stubGlobal('fetch', mockFetch);

      try {
        await createCheck(
          'dpl_test123',
          {
            name: 'Readiness Check',
            blocking: true,
          },
          mockConfig
        );
      } catch (error) {
        expect(error).toBeInstanceOf(VercelApiError);
        expect((error as VercelApiError).status).toBe(401);
        expect((error as VercelApiError).code).toBe('unauthorized');
      }
    });

    it('should handle 404 deployment not found error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Deployment not found',
                code: 'not_found',
              },
            })
          ),
      });
      vi.stubGlobal('fetch', mockFetch);

      try {
        await createCheck(
          'dpl_nonexistent',
          {
            name: 'Readiness Check',
            blocking: true,
          },
          mockConfig
        );
      } catch (error) {
        expect(error).toBeInstanceOf(VercelApiError);
        expect((error as VercelApiError).status).toBe(404);
        expect((error as VercelApiError).code).toBe('not_found');
      }
    });
  });

  describe('updateCheck', () => {
    const updatedCheckResponse: CheckResponse = {
      ...mockCheckResponse,
      status: 'completed',
      conclusion: 'succeeded',
      updatedAt: 1704070800000,
    };

    it('should update a check with status running', async () => {
      const runningCheckResponse: CheckResponse = {
        ...mockCheckResponse,
        status: 'running',
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(runningCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await updateCheck(
        'dpl_test123',
        'check_abc123',
        {
          status: 'running',
        },
        mockConfig
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/deployments/dpl_test123/checks/check_abc123',
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer test-token-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'running',
          }),
        }
      );

      expect(result.status).toBe('running');
    });

    it('should update a check with conclusion succeeded', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await updateCheck(
        'dpl_test123',
        'check_abc123',
        {
          conclusion: 'succeeded',
        },
        mockConfig
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            conclusion: 'succeeded',
          }),
        })
      );

      expect(result.status).toBe('completed');
      expect(result.conclusion).toBe('succeeded');
    });

    it('should update a check with conclusion failed', async () => {
      const failedCheckResponse: CheckResponse = {
        ...mockCheckResponse,
        status: 'completed',
        conclusion: 'failed',
        updatedAt: 1704070800000,
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(failedCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await updateCheck(
        'dpl_test123',
        'check_abc123',
        {
          conclusion: 'failed',
        },
        mockConfig
      );

      expect(result.conclusion).toBe('failed');
    });

    it('should include teamId in query params when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      await updateCheck(
        'dpl_test123',
        'check_abc123',
        {
          conclusion: 'succeeded',
        },
        mockConfigWithTeamId
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/deployments/dpl_test123/checks/check_abc123?teamId=team_abc123',
        expect.any(Object)
      );
    });

    it('should include detailsUrl when updating', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedCheckResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      await updateCheck(
        'dpl_test123',
        'check_abc123',
        {
          conclusion: 'succeeded',
          detailsUrl: 'https://example.com/results',
        },
        mockConfig
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            conclusion: 'succeeded',
            detailsUrl: 'https://example.com/results',
          }),
        })
      );
    });

    it('should throw VercelApiError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Check cannot be updated',
                code: 'bad_request',
              },
            })
          ),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        updateCheck(
          'dpl_test123',
          'check_abc123',
          {
            conclusion: 'succeeded',
          },
          mockConfig
        )
      ).rejects.toThrow(VercelApiError);
    });

    it('should handle check not found error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Check not found',
                code: 'not_found',
              },
            })
          ),
      });
      vi.stubGlobal('fetch', mockFetch);

      try {
        await updateCheck(
          'dpl_test123',
          'check_nonexistent',
          {
            conclusion: 'succeeded',
          },
          mockConfig
        );
      } catch (error) {
        expect(error).toBeInstanceOf(VercelApiError);
        expect((error as VercelApiError).status).toBe(404);
      }
    });
  });

  describe('VercelApiError', () => {
    it('should have correct name and properties', () => {
      const error = new VercelApiError('Test error', 400, 'test_code');

      expect(error.name).toBe('VercelApiError');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(400);
      expect(error.code).toBe('test_code');
    });

    it('should work without code', () => {
      const error = new VercelApiError('Test error', 500);

      expect(error.name).toBe('VercelApiError');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(500);
      expect(error.code).toBeUndefined();
    });
  });
});
