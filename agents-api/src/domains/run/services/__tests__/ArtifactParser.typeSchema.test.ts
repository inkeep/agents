import type { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactParser } from '../ArtifactParser';

// Hoisted mocks
const { agentSessionManagerMock, toolSessionManagerMock } = vi.hoisted(() => ({
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

vi.mock('@inkeep/agents-core', () => ({
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

vi.mock('../../../data/db/runDbClient', () => ({ default: 'mock-run-db-client' }));

vi.mock('../../../logger', () => ({
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

const mockExecutionContext = {
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
} as any;

const testArtifactComponents: ArtifactComponentApiInsert[] = [
  {
    id: 'comp-1',
    name: 'ResearchDoc',
    description: 'A research document',
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title', inPreview: true },
        summary: { type: 'string', description: 'Short summary', inPreview: true },
        content: { type: 'string', description: 'Full content', inPreview: false },
        tags: {
          type: 'array',
          items: { type: 'string', description: 'Tag' },
          description: 'Tags',
          inPreview: false,
        },
      },
    },
  },
];

describe('ArtifactParser — typeSchema in data parts', () => {
  let mockArtifactService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockArtifactService = {
      getArtifactSummary: vi.fn(),
      createArtifact: vi.fn(),
      getContextArtifacts: vi.fn(),
      getArtifactFull: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('typeSchemaMap construction', () => {
    it('builds typeSchemaMap from artifactComponents with inPreview fields', async () => {
      const parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
        artifactComponents: testArtifactComponents,
      });

      mockArtifactService.getArtifactSummary.mockResolvedValue({
        artifactId: 'art-1',
        toolCallId: 'tool-1',
        name: 'My Doc',
        description: 'A doc',
        type: 'ResearchDoc',
        data: { title: 'Hello', summary: 'World' },
      });

      const parts = await parser.parseText(
        'Look at this <artifact:ref id="art-1" tool="tool-1" />',
        undefined
      );

      const dataPart = parts.find((p) => p.kind === 'data');
      expect(dataPart).toBeDefined();
      expect(dataPart?.data?.typeSchema).toBeDefined();

      expect(dataPart?.data?.typeSchema?.previewShape).toEqual({
        title: 'string',
        summary: 'string',
      });
      expect(dataPart?.data?.typeSchema?.fullShape).toEqual({
        title: 'string',
        summary: 'string',
        content: 'string',
        tags: ['string'],
      });
    });

    it('omits typeSchema when artifact type is not in the component map', async () => {
      const parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
        artifactComponents: testArtifactComponents,
      });

      mockArtifactService.getArtifactSummary.mockResolvedValue({
        artifactId: 'art-2',
        toolCallId: 'tool-2',
        name: 'Unknown Artifact',
        description: 'Desc',
        type: 'UnknownType',
        data: { field: 'value' },
      });

      const parts = await parser.parseText(
        'See <artifact:ref id="art-2" tool="tool-2" />',
        undefined
      );

      const dataPart = parts.find((p) => p.kind === 'data');
      expect(dataPart).toBeDefined();
      expect(dataPart?.data?.typeSchema).toBeUndefined();
    });

    it('omits typeSchema when no artifactComponents provided', async () => {
      const parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
      });

      mockArtifactService.getArtifactSummary.mockResolvedValue({
        artifactId: 'art-3',
        toolCallId: 'tool-3',
        name: 'Doc',
        description: 'Desc',
        type: 'ResearchDoc',
        data: { title: 'Test' },
      });

      const parts = await parser.parseText(
        'See <artifact:ref id="art-3" tool="tool-3" />',
        undefined
      );

      const dataPart = parts.find((p) => p.kind === 'data');
      expect(dataPart).toBeDefined();
      expect(dataPart?.data?.typeSchema).toBeUndefined();
    });

    it('skips components missing name or props.properties', () => {
      expect(
        () =>
          new ArtifactParser(mockExecutionContext, {
            artifactService: mockArtifactService,
            artifactComponents: [
              { id: 'c1', name: '', props: { type: 'object', properties: {} } },
              { id: 'c2', name: 'NoProps', props: { type: 'object' } },
            ] as any,
          })
      ).not.toThrow();
    });
  });

  describe('buildArtifactDataPart — core fields always present', () => {
    it('always includes artifactId, toolCallId, name, description, type, artifactSummary', async () => {
      const parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
        artifactComponents: testArtifactComponents,
      });

      const artifactData = {
        artifactId: 'art-check',
        toolCallId: 'tool-check',
        name: 'Check Doc',
        description: 'Check description',
        type: 'ResearchDoc',
        data: { title: 'Check', summary: 'Sum' },
      };
      mockArtifactService.getArtifactSummary.mockResolvedValue(artifactData);

      const parts = await parser.parseText(
        '<artifact:ref id="art-check" tool="tool-check" />',
        undefined
      );

      const dataPart = parts.find((p) => p.kind === 'data');
      expect(dataPart?.data).toMatchObject({
        artifactId: 'art-check',
        toolCallId: 'tool-check',
        name: 'Check Doc',
        description: 'Check description',
        type: 'ResearchDoc',
        artifactSummary: { title: 'Check', summary: 'Sum' },
      });
    });
  });

  describe('parseObject — typeSchema included in component data parts', () => {
    it('attaches typeSchema to data parts from artifact components', async () => {
      const parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
        artifactComponents: testArtifactComponents,
      });

      mockArtifactService.getArtifactSummary.mockResolvedValue({
        artifactId: 'art-obj',
        toolCallId: 'tool-obj',
        name: 'Object Doc',
        description: 'Desc',
        type: 'ResearchDoc',
        data: { title: 'ObjTitle' },
      });

      const obj = {
        name: 'Artifact',
        props: { artifact_id: 'art-obj', tool_call_id: 'tool-obj' },
      };

      const parts = await parser.parseObject(obj, undefined);
      const dataPart = parts.find((p) => p.kind === 'data');
      expect(dataPart?.data?.typeSchema).toBeDefined();
      expect(dataPart?.data?.typeSchema?.previewShape).toEqual({
        title: 'string',
        summary: 'string',
      });
    });
  });

  describe('resolveArgs', () => {
    let parser: ArtifactParser;

    beforeEach(() => {
      mockArtifactService.getToolResultRaw = vi.fn();
      parser = new ArtifactParser(mockExecutionContext, {
        artifactService: mockArtifactService,
        artifactComponents: testArtifactComponents,
      });
    });

    it('resolves a top-level artifact ref to full artifact data', async () => {
      mockArtifactService.getArtifactFull.mockResolvedValue({
        data: { title: 'Resolved Title', content: 'Full content' },
      });
      const result = await parser.resolveArgs({ $artifact: 'art-1', $tool: 'tool-1' });
      expect(mockArtifactService.getArtifactFull).toHaveBeenCalledWith('art-1', 'tool-1');
      expect(result).toEqual({ title: 'Resolved Title', content: 'Full content' });
    });

    it('resolves a nested artifact ref inside an object', async () => {
      mockArtifactService.getArtifactFull.mockResolvedValue({ data: { content: 'Full content' } });
      const result = await parser.resolveArgs({
        doc: { $artifact: 'art-2', $tool: 'tool-2' },
        other: 'value',
      });
      expect(result).toEqual({ doc: { content: 'Full content' }, other: 'value' });
    });

    it('resolves artifact refs inside arrays', async () => {
      mockArtifactService.getArtifactFull.mockResolvedValue({ data: { title: 'Array item' } });
      const result = await parser.resolveArgs([
        { $artifact: 'art-3', $tool: 'tool-3' },
        'plain-string',
      ]);
      expect(result).toEqual([{ title: 'Array item' }, 'plain-string']);
    });

    it('returns original ref when resolution returns null', async () => {
      mockArtifactService.getArtifactFull.mockResolvedValue(null);
      const ref = { $artifact: 'missing', $tool: 'tool-x' };
      const result = await parser.resolveArgs(ref);
      expect(result).toEqual(ref);
    });

    it('returns original ref when resolution returns empty data', async () => {
      mockArtifactService.getArtifactFull.mockResolvedValue({ data: null });
      const ref = { $artifact: 'bad', $tool: 'tool-y' };
      const result = await parser.resolveArgs(ref);
      expect(result).toEqual(ref);
    });

    it('passes through primitive values unchanged', async () => {
      expect(await parser.resolveArgs('string')).toBe('string');
      expect(await parser.resolveArgs(42)).toBe(42);
      expect(await parser.resolveArgs(true)).toBe(true);
      expect(await parser.resolveArgs(null)).toBe(null);
    });

    describe('ephemeral {$tool} resolution (no $artifact)', () => {
      it('resolves {$tool} to unwrapped text content from ToolSessionManager', async () => {
        mockArtifactService.getToolResultRaw.mockReturnValue('fetched html content');
        const result = await parser.resolveArgs({ $tool: 'call-abc' });
        expect(mockArtifactService.getToolResultRaw).toHaveBeenCalledWith('call-abc');
        expect(result).toBe('fetched html content');
      });

      it('resolves {$tool} to unwrapped image object for image content', async () => {
        const imageResult = { data: 'base64data==', encoding: 'base64', mimeType: 'image/png' };
        mockArtifactService.getToolResultRaw.mockReturnValue(imageResult);
        const result = await parser.resolveArgs({ $tool: 'call-img' });
        expect(result).toEqual(imageResult);
      });

      it('resolves {$tool} to raw non-MCP result as-is', async () => {
        const rawResult = { rows: [{ id: 1, name: 'Alice' }] };
        mockArtifactService.getToolResultRaw.mockReturnValue(rawResult);
        const result = await parser.resolveArgs({ $tool: 'call-db' });
        expect(result).toEqual(rawResult);
      });

      it('falls through gracefully when toolCallId not found', async () => {
        mockArtifactService.getToolResultRaw.mockReturnValue(undefined);
        const ref = { $tool: 'call-missing' };
        const result = await parser.resolveArgs(ref);
        expect(result).toEqual(ref);
      });

      it('resolves nested {$tool} reference inside a larger args object', async () => {
        mockArtifactService.getToolResultRaw.mockReturnValue('<html>page</html>');
        const result = await parser.resolveArgs({
          selector: 'h1',
          input: { $tool: 'call-fetch' },
        });
        expect(result).toEqual({ selector: 'h1', input: '<html>page</html>' });
      });

      it('does not invoke getToolResultRaw when both $artifact and $tool are present', async () => {
        mockArtifactService.getArtifactFull.mockResolvedValue({
          data: { title: 'Artifact data' },
        });
        await parser.resolveArgs({ $artifact: 'art-x', $tool: 'tool-x' });
        expect(mockArtifactService.getToolResultRaw).not.toHaveBeenCalled();
        expect(mockArtifactService.getArtifactFull).toHaveBeenCalledWith('art-x', 'tool-x');
      });
    });
  });
});
