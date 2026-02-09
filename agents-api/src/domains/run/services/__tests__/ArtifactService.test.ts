import type { ResolvedRef } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ArtifactCreateRequest,
  ArtifactService,
  type ArtifactServiceContext,
} from '../ArtifactService';

// Hoisted mocks must be defined before vi.mock calls
const {
  listTaskIdsByContextIdMock,
  getTaskMock,
  getLedgerArtifactsMock,
  upsertLedgerArtifactMock,
  toolSessionManagerMock,
  agentSessionManagerMock,
} = vi.hoisted(() => ({
  listTaskIdsByContextIdMock: vi.fn(),
  getTaskMock: vi.fn(),
  getLedgerArtifactsMock: vi.fn(),
  upsertLedgerArtifactMock: vi.fn(),
  toolSessionManagerMock: {
    getSession: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getToolResult: vi.fn(),
  },
  agentSessionManagerMock: {
    getAgentSession: vi.fn(),
    ensureAgentSession: vi.fn(),
    updateArtifactComponents: vi.fn(),
    recordEvent: vi.fn(),
    setArtifactCache: vi.fn(),
    getArtifactCache: vi.fn(),
  },
}));

// Mock @inkeep/agents-core WITHOUT importOriginal to avoid loading the heavy module
vi.mock('@inkeep/agents-core', () => ({
  listTaskIdsByContextId: listTaskIdsByContextIdMock,
  getTask: getTaskMock,
  getLedgerArtifacts: getLedgerArtifactsMock,
  upsertLedgerArtifact: upsertLedgerArtifactMock,
  // Add stubs for exports needed by transitive dependencies
  createAgentsRunDatabaseClient: vi.fn(() => 'mock-run-db-client'),
  createAgentsManageDatabaseClient: vi.fn(() => 'mock-manage-db-client'),
  loadEnvironmentFiles: vi.fn(),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('../../agents/ToolSessionManager', () => ({
  toolSessionManager: toolSessionManagerMock,
}));

vi.mock('../AgentSession', () => ({
  agentSessionManager: agentSessionManagerMock,
}));

// Mock runDbClient to prevent it from loading @inkeep/agents-core
vi.mock('../../../data/db/runDbClient', () => ({
  default: 'mock-run-db-client',
}));

// Mock logger to prevent transitive @inkeep/agents-core imports
vi.mock('../../../logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

// Mock schema-validation to prevent @inkeep/agents-core/utils imports
vi.mock('../../utils/schema-validation', () => ({
  extractPreviewFields: vi.fn((schema: any) => ({
    type: 'object',
    properties: schema?.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).filter(([_, prop]: [string, any]) => prop.inPreview)
        )
      : {},
  })),
  extractFullFields: vi.fn((schema: any) => ({
    type: 'object',
    properties: schema?.properties || {},
    required: schema?.required,
  })),
}));

describe('ArtifactService', () => {
  let artifactService: ArtifactService;
  let mockContext: ArtifactServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      executionContext: {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        apiKey: 'test-api-key',
        apiKeyId: 'test-api-key-id',
        baseUrl: 'http://localhost:3003',
        resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
        project: {
          id: 'test-project',
          tenantId: 'test-tenant',
          name: 'Test Project',
          agents: {},
          tools: {},
          functions: {},
          dataComponents: {},
          artifactComponents: {},
          externalAgents: {},
          credentialReferences: {},
        },
      } as any,
      sessionId: 'test-session',
      taskId: 'test-task',
      contextId: 'test-context',
      streamRequestId: 'test-stream-request',
      subAgentId: 'test-agent',
      artifactComponents: [
        {
          id: 'test-component-id',
          name: 'TestComponent',
          description: 'Test component description',
          props: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title', inPreview: true },
              summary: { type: 'string', description: 'Summary', inPreview: true },
              content: { type: 'string', description: 'Content', inPreview: false },
              details: { type: 'object', description: 'Details', inPreview: false },
            },
          },
        },
      ],
    };

    artifactService = new ArtifactService(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getContextArtifacts', () => {
    it('should fetch and organize artifacts by context', async () => {
      const mockTaskIds = ['task1', 'task2'];
      const mockTask = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        id: 'task1',
        contextId: 'test-context',
        status: 'active',
        metadata: null,
        subAgentId: 'test-agent',
        ref: { type: 'branch', name: 'main', hash: 'test-hash' } as ResolvedRef,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const mockArtifacts = [
        {
          artifactId: 'artifact1',
          taskId: 'task1',
          parts: [{ kind: 'data' as const, data: {} }],
          metadata: { toolCallId: 'tool1' },
          createdAt: '2024-01-15T21:30:00.000Z',
        },
        {
          artifactId: 'artifact2',
          taskId: 'task2',
          parts: [{ kind: 'data' as const, data: {} }],
          metadata: { toolCallId: 'tool2' },
          createdAt: '2024-01-15T22:30:00.000Z',
        },
      ];

      listTaskIdsByContextIdMock.mockReturnValue(() => Promise.resolve(mockTaskIds));
      getTaskMock.mockReturnValue(() => Promise.resolve(mockTask));
      getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve(mockArtifacts));

      const result = await artifactService.getContextArtifacts('test-context');

      expect(result.size).toBe(4); // 2 artifacts × 2 keys each (toolCallId + taskId)
      expect(result.has('artifact1:tool1')).toBe(true);
      expect(result.has('artifact1:task1')).toBe(true);
      expect(result.has('artifact2:tool2')).toBe(true);
      expect(result.has('artifact2:task2')).toBe(true);
    });

    it('should handle missing tasks gracefully', async () => {
      const mockTaskIds = ['task1', 'task2'];

      listTaskIdsByContextIdMock.mockReturnValue(() => Promise.resolve(mockTaskIds));
      getTaskMock
        .mockReturnValueOnce(() =>
          Promise.resolve({
            tenantId: 'test-tenant',
            projectId: 'test-project',
            agentId: 'test-agent',
            id: 'task1',
            contextId: 'test-context',
            ref: { type: 'branch', name: 'main', hash: 'test-hash' },
            status: 'active',
            metadata: null,
            subAgentId: 'test-agent',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          })
        )
        .mockReturnValueOnce(() => Promise.resolve(null)); // Second task not found
      getLedgerArtifactsMock.mockReturnValue(() =>
        Promise.resolve([
          {
            artifactId: 'artifact1',
            taskId: 'task1',
            parts: [{ kind: 'data', data: {} }],
            metadata: { toolCallId: 'tool1' },
            createdAt: '2024-01-15T23:30:00.000Z',
          },
        ])
      );

      const result = await artifactService.getContextArtifacts('test-context');

      expect(result.size).toBe(2); // Only one artifact's keys
      expect(result.has('artifact1:tool1')).toBe(true);
      expect(result.has('artifact1:task1')).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      listTaskIdsByContextIdMock.mockReturnValue(() => Promise.reject(new Error('Database error')));

      const result = await artifactService.getContextArtifacts('test-context');

      expect(result.size).toBe(0);
    });
  });

  describe('createArtifact', () => {
    const mockRequest: ArtifactCreateRequest = {
      artifactId: 'test-artifact',
      toolCallId: 'test-tool-call',
      type: 'TestComponent',
      baseSelector: 'result.data[0]',
      detailsSelector: {
        title: 'title',
        summary: 'summary',
        content: 'content',
        details: 'details',
      },
    };

    it('should create artifact successfully with valid tool result', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [
            {
              title: 'Test Title',
              summary: 'Test Summary',
              content: 'Test Content',
              details: { extra: 'info' },
            },
          ],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);
      agentSessionManagerMock.setArtifactCache.mockResolvedValue(undefined);

      const result = await artifactService.createArtifact(mockRequest);

      expect(result).toEqual({
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        name: 'Processing...',
        description: 'Name and description being generated...',
        type: 'TestComponent',
        data: {
          title: 'Test Title',
          summary: 'Test Summary',
        },
      });

      expect(agentSessionManagerMock.recordEvent).toHaveBeenCalledWith(
        'test-stream-request',
        'artifact_saved',
        'test-agent',
        expect.objectContaining({
          artifactId: 'test-artifact',
          artifactType: 'TestComponent',
          pendingGeneration: true,
        })
      );
    });

    it('should handle array results by selecting first item', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [
            { title: 'First', summary: 'First Summary' },
            { title: 'Second', summary: 'Second Summary' },
          ],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);
      agentSessionManagerMock.setArtifactCache.mockResolvedValue(undefined);

      const result = await artifactService.createArtifact(mockRequest);

      expect(result?.data).toEqual({
        title: 'First',
        summary: 'First Summary',
      });
    });

    it('should handle missing tool result', async () => {
      toolSessionManagerMock.getToolResult.mockReturnValue(undefined);

      const result = await artifactService.createArtifact(mockRequest);

      expect(result).toBeNull();
    });

    it('should handle missing session ID', async () => {
      const serviceWithoutSession = new ArtifactService({
        ...mockContext,
        sessionId: undefined,
      });

      const result = await serviceWithoutSession.createArtifact(mockRequest);

      expect(result).toBeNull();
    });

    it('should handle JMESPath selector errors gracefully', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: { data: 'simple string' },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const result = await artifactService.createArtifact({
        ...mockRequest,
        baseSelector: 'result.nonexistent[0]',
      });

      expect(result?.data).toEqual({});
    });

    it('should sanitize JMESPath selectors correctly', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [{ title: 'Test', content: 'Test Content' }],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const result = await artifactService.createArtifact({
        ...mockRequest,
        baseSelector: 'result.data[?title=="Test"]', // Double quotes should be sanitized
      });

      expect(result).not.toBeNull();
    });
  });

  describe('getArtifactSummary', () => {
    it('should return cached artifact from agent session', async () => {
      const mockCachedArtifact = {
        name: 'Cached Artifact',
        description: 'Cached Description',
        parts: [{ data: { summary: { test: 'data' } } }],
        metadata: { artifactType: 'TestType' },
      };

      agentSessionManagerMock.getArtifactCache.mockResolvedValue(mockCachedArtifact);

      const result = await artifactService.getArtifactSummary('test-artifact', 'test-tool-call');

      expect(result).toEqual({
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        name: 'Cached Artifact',
        description: 'Cached Description',
        type: 'TestType',
        data: { test: 'data' },
      });
    });

    it('should return artifact from provided map when not in cache', async () => {
      agentSessionManagerMock.getArtifactCache.mockResolvedValue(null);

      const artifactMap = new Map();
      const mockArtifact = {
        name: 'Map Artifact',
        description: 'Map Description',
        parts: [{ data: { summary: { map: 'data' } } }],
        metadata: { artifactType: 'MapType' },
      };
      artifactMap.set('test-artifact:test-tool-call', mockArtifact);

      const result = await artifactService.getArtifactSummary(
        'test-artifact',
        'test-tool-call',
        artifactMap
      );

      expect(result).toEqual({
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        name: 'Map Artifact',
        description: 'Map Description',
        type: 'MapType',
        data: { map: 'data' },
      });
    });

    it('should fetch from database when not in cache or map', async () => {
      agentSessionManagerMock.getArtifactCache.mockResolvedValue(null);

      const mockDbArtifact = {
        artifactId: 'test-artifact',
        name: 'DB Artifact',
        description: 'DB Description',
        parts: [{ kind: 'data' as const, data: { summary: { db: 'data' } } }],
        metadata: { artifactType: 'DBType' },
        createdAt: '2024-01-16T00:30:00.000Z',
      };
      getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve([mockDbArtifact]));

      const result = await artifactService.getArtifactSummary('test-artifact', 'test-tool-call');

      expect(result).toEqual({
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        name: 'DB Artifact',
        description: 'DB Description',
        type: 'DBType',
        data: { db: 'data' },
      });

      expect(getLedgerArtifactsMock).toHaveBeenCalledWith('mock-run-db-client');
    });

    it('should return null when artifact not found anywhere', async () => {
      agentSessionManagerMock.getArtifactCache.mockResolvedValue(null);
      getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve([]));

      const result = await artifactService.getArtifactSummary(
        'missing-artifact',
        'missing-tool-call'
      );

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      agentSessionManagerMock.getArtifactCache.mockResolvedValue(null);
      getLedgerArtifactsMock.mockReturnValue(() => Promise.reject(new Error('Database error')));

      const result = await artifactService.getArtifactSummary('test-artifact', 'test-tool-call');

      expect(result).toBeNull();
    });

    it('should return null when missing required context', async () => {
      const serviceWithoutContext = new ArtifactService({
        ...mockContext,
        executionContext: {
          ...(mockContext.executionContext as any),
          projectId: undefined,
        },
        taskId: undefined,
      });

      agentSessionManagerMock.getArtifactCache.mockResolvedValue(null);

      const result = await serviceWithoutContext.getArtifactSummary(
        'test-artifact',
        'test-tool-call'
      );

      expect(result).toBeNull();
    });
  });

  describe('JMESPath sanitization', () => {
    it('should fix double quotes in filter expressions', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [{ type: 'test', title: 'Test Title' }],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const request: ArtifactCreateRequest = {
        artifactId: 'test',
        toolCallId: 'test',
        type: 'TestComponent',
        baseSelector: 'result.data[?type=="test"]', // Should be sanitized to single quotes
        detailsSelector: { title: 'title' },
      };

      const result = await artifactService.createArtifact(request);

      expect(result).not.toBeNull();
      expect(result?.data.title).toBe('Test Title');
    });

    it('should fix contains syntax with @ references', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [{ content: 'test content', title: 'Test Title' }],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const request: ArtifactCreateRequest = {
        artifactId: 'test',
        toolCallId: 'test',
        type: 'TestComponent',
        baseSelector: 'result.data[?content ~ contains(@, "test")]', // Should be sanitized
        detailsSelector: { title: 'title' },
      };

      const result = await artifactService.createArtifact(request);

      expect(result).not.toBeNull();
    });
  });

  describe('schema filtering', () => {
    it('should filter properties based on component schema', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [
            {
              title: 'Test Title',
              summary: 'Test Summary',
              extraField: 'Should be filtered out',
            },
          ],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const testRequest: ArtifactCreateRequest = {
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        type: 'TestComponent',
        baseSelector: 'result.data[0]',
        detailsSelector: {
          title: 'title',
          summary: 'summary',
          content: 'content',
          details: 'details',
        },
      };

      const result = await artifactService.createArtifact(testRequest);

      expect(result?.data).toEqual({
        title: 'Test Title',
        summary: 'Test Summary',
      });
      expect(result?.data.extraField).toBeUndefined();
    });

    it('should handle missing schema properties gracefully', async () => {
      const mockToolResult = {
        toolCallId: 'test-tool-call',
        toolName: 'test-tool',
        timestamp: Date.now(),
        result: {
          data: [
            {
              title: 'Test Title',
              summary: 'Test Summary',
            },
          ],
        },
      };

      toolSessionManagerMock.getToolResult.mockReturnValue(mockToolResult);
      agentSessionManagerMock.recordEvent.mockResolvedValue(undefined);

      const serviceWithoutComponents = new ArtifactService({
        ...mockContext,
        artifactComponents: undefined,
      });

      const testRequest2: ArtifactCreateRequest = {
        artifactId: 'test-artifact',
        toolCallId: 'test-tool-call',
        type: 'TestComponent',
        baseSelector: 'result.data[0]',
        detailsSelector: {
          title: 'title',
          summary: 'summary',
          content: 'content',
          details: 'details',
        },
      };

      const result = await serviceWithoutComponents.createArtifact(testRequest2);

      expect(result?.data).toEqual({
        title: 'Test Title',
        summary: 'Test Summary',
      });
    });
  });
});
