import type { FullProjectDefinition } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFullProjectViaAPI,
  deleteFullProjectViaAPI,
  getFullProjectViaAPI,
  updateFullProjectViaAPI,
} from '../projectFullClient';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('projectFullClient', () => {
  const tenantId = 'test-tenant';
  const apiUrl = 'http://localhost:3002';
  const projectId = 'test-project';

  const mockProjectData: FullProjectDefinition = {
    id: projectId,
    name: 'Test Project',
    description: 'A test project',
    models: {
      base: { model: 'gpt-4o-mini' },
    },
    stopWhen: {
      transferCountIs: 10,
      stepCountIs: 50,
    },
    graphs: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFullProjectViaAPI', () => {
    it('should create a project successfully', async () => {
      const expectedResponse = { data: mockProjectData };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => expectedResponse,
      });

      const result = await createFullProjectViaAPI(tenantId, apiUrl, mockProjectData);

      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tenants/${tenantId}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockProjectData),
      });

      expect(result).toEqual(mockProjectData);
    });

    it('should handle API errors', async () => {
      const errorResponse = { error: 'Project creation failed' };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify(errorResponse),
      });

      await expect(createFullProjectViaAPI(tenantId, apiUrl, mockProjectData)).rejects.toThrow(
        'Project creation failed'
      );
    });
  });

  describe('updateFullProjectViaAPI', () => {
    it('should update a project successfully', async () => {
      const expectedResponse = { data: mockProjectData };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => expectedResponse,
      });

      const result = await updateFullProjectViaAPI(tenantId, apiUrl, projectId, mockProjectData);

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/tenants/${tenantId}/projects/${projectId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockProjectData),
        }
      );

      expect(result).toEqual(mockProjectData);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(
        updateFullProjectViaAPI(tenantId, apiUrl, projectId, mockProjectData)
      ).rejects.toThrow('Server error');
    });
  });

  describe('getFullProjectViaAPI', () => {
    it('should get a project successfully', async () => {
      const expectedResponse = { data: mockProjectData };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => expectedResponse,
      });

      const result = await getFullProjectViaAPI(tenantId, apiUrl, projectId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/tenants/${tenantId}/projects/${projectId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      expect(result).toEqual(mockProjectData);
    });

    it('should return null for 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await getFullProjectViaAPI(tenantId, apiUrl, projectId);

      expect(result).toBeNull();
    });

    it('should handle other API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(getFullProjectViaAPI(tenantId, apiUrl, projectId)).rejects.toThrow(
        'Server error'
      );
    });
  });

  describe('deleteFullProjectViaAPI', () => {
    it('should delete a project successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await deleteFullProjectViaAPI(tenantId, apiUrl, projectId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/tenants/${tenantId}/projects/${projectId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(deleteFullProjectViaAPI(tenantId, apiUrl, projectId)).rejects.toThrow(
        'Server error'
      );
    });
  });
});
