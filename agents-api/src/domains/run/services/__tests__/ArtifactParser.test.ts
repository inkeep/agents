import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactParser } from '../ArtifactParser';
import type { ArtifactService } from '../ArtifactService';

vi.mock('../ArtifactService', () => ({
  ArtifactService: vi.fn().mockImplementation(() => ({
    createArtifact: vi.fn(),
    getArtifactSummary: vi.fn(),
    getContextArtifacts: vi.fn(),
  })),
}));

vi.mock('../../../logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
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

const mockArtifactData = {
  artifactId: 'a1',
  toolCallId: 't1',
  name: 'Test Artifact',
  description: 'A test artifact',
  type: 'citation',
  data: { url: 'https://example.com', title: 'Example' },
};

describe('ArtifactParser', () => {
  let mockArtifactService: {
    createArtifact: ReturnType<typeof vi.fn>;
    getArtifactSummary: ReturnType<typeof vi.fn>;
    getContextArtifacts: ReturnType<typeof vi.fn>;
  };
  let parser: ArtifactParser;

  beforeEach(() => {
    vi.clearAllMocks();
    mockArtifactService = {
      createArtifact: vi.fn(),
      getArtifactSummary: vi.fn(),
      getContextArtifacts: vi.fn().mockResolvedValue(new Map()),
    };
    parser = new ArtifactParser(mockExecutionContext, {
      artifactService: mockArtifactService as unknown as ArtifactService,
    });
  });

  describe('hasArtifactMarkers', () => {
    it('detects a standard artifact:create self-closing tag', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base='result.docs[0]' />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('detects artifact:create when base contains > in a double-quoted value', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt']" />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('detects artifact:create when base contains a JMESPath > comparator in a single-quoted value', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base='docs[?score > 0]' />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('detects artifact:create with details as JSON and > in base', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Inkeep Agent Platform > llms-full.txt' && contains(context, 'auth')]" details='{"url":"url","title":"title"}' />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('detects artifact:create with both > in base and double quotes inside details JSON', () => {
      const text = `<artifact:create id='api-usage-1' tool='toolu_abc' type='citation' base="content[0].text.documents[?title=='Inkeep Agent Platform > llms-full.txt' && contains(context, 'authentication')]" details='{"url":"url","title":"title","content":"content","context":"context","record_type":"record_type"}' />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('detects artifact:ref tag', () => {
      const text = `<artifact:ref id='a1' tool='t1' />`;
      expect(parser.hasArtifactMarkers(text)).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(parser.hasArtifactMarkers('Just some plain text')).toBe(false);
    });

    it('returns false for text containing > but no artifact tags', () => {
      expect(parser.hasArtifactMarkers('foo > bar && baz < qux')).toBe(false);
    });

    it('returns false for an incomplete artifact:create tag', () => {
      const text = `Some text <artifact:create id='a1' tool='t1'`;
      expect(parser.hasArtifactMarkers(text)).toBe(false);
    });
  });

  describe('hasIncompleteArtifact', () => {
    it('returns true when text ends with an artifact prefix', () => {
      expect(parser.hasIncompleteArtifact('some text <artifact')).toBe(true);
      expect(parser.hasIncompleteArtifact('some text <artifact:')).toBe(true);
      expect(parser.hasIncompleteArtifact('some text <artifact:create')).toBe(true);
    });

    it('returns true when text ends mid-tag in the attribute section', () => {
      expect(parser.hasIncompleteArtifact(`some text <artifact:create id='a1' tool='t1'`)).toBe(
        true
      );
    });

    it('returns false for a complete self-closing tag', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base='result.docs[0]' />`;
      expect(parser.hasIncompleteArtifact(text)).toBe(false);
    });

    it('returns false for complete tag when base attribute contains > in a double-quoted value', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt']" />`;
      expect(parser.hasIncompleteArtifact(text)).toBe(false);
    });

    it('returns true when streaming chunk ends after > in a quoted value but before closing />', () => {
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt'`;
      expect(parser.hasIncompleteArtifact(text)).toBe(true);
    });

    it('returns false for complete tag with preceding plain text', () => {
      const text = `Here is a result. <artifact:create id='a1' tool='t1' type='citation' base='result' />`;
      expect(parser.hasIncompleteArtifact(text)).toBe(false);
    });
  });

  describe('findSafeTextBoundary', () => {
    it('returns full length when text has no artifacts', () => {
      const text = 'Just some plain text';
      expect(parser.findSafeTextBoundary(text)).toBe(text.length);
    });

    it('returns full length for a complete artifact tag', () => {
      const text = `text <artifact:create id='a1' tool='t1' type='citation' base='result' />`;
      expect(parser.findSafeTextBoundary(text)).toBe(text.length);
    });

    it('returns index before an incomplete artifact:create', () => {
      const prefix = 'Some text ';
      const text = `${prefix}<artifact:create id='a1' tool='t1'`;
      expect(parser.findSafeTextBoundary(text)).toBe(prefix.length);
    });

    it('returns full length for a complete tag when base attribute contains > in a quoted value', () => {
      const text = `text <artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt']" />`;
      expect(parser.findSafeTextBoundary(text)).toBe(text.length);
    });

    it('returns index before an incomplete tag that has > in a quoted value', () => {
      const prefix = 'Some text ';
      const text = `${prefix}<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt'`;
      expect(parser.findSafeTextBoundary(text)).toBe(prefix.length);
    });
  });

  describe('parseText', () => {
    it('returns plain text unchanged when no artifacts are present', async () => {
      const text = 'Just plain text with no artifacts';
      const parts = await parser.parseText(text);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ kind: 'text', text });
    });

    it('parses a standard artifact:create tag into a data part', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(mockArtifactData);
      const text = `<artifact:create id='a1' tool='t1' type='citation' base='result.docs[0]' />`;
      const parts = await parser.parseText(text);
      expect(parts).toHaveLength(1);
      expect(parts[0].kind).toBe('data');
      expect(parts[0].data?.artifactId).toBe('a1');
      expect(parts[0].data?.toolCallId).toBe('t1');
      expect(parts[0].data?.type).toBe('citation');
    });

    it('parses artifact:create with > inside double-quoted base attribute', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(mockArtifactData);
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="docs[?title=='Platform > llms.txt']" details='{"url":"url"}' />`;
      const parts = await parser.parseText(text);
      const dataParts = parts.filter((p) => p.kind === 'data');
      expect(dataParts).toHaveLength(1);
      expect(dataParts[0].data?.artifactId).toBe('a1');
    });

    it('parses the exact real-world tag that exposed the bug', async () => {
      mockArtifactService.createArtifact.mockResolvedValue({
        ...mockArtifactData,
        artifactId: 'api-usage-1',
        toolCallId: 'toolu_abc',
      });
      const text = `I found information about using our API. <artifact:create id='api-usage-1' tool='toolu_abc' type='citation' base="content[0].text.documents[?title=='Inkeep Agent Platform > llms-full.txt' && contains(context, 'authentication')]" details='{"url":"url","title":"title","content":"content","context":"context","record_type":"record_type"}' />\n\nHere's how to use the Inkeep API:`;
      const parts = await parser.parseText(text);
      const dataParts = parts.filter((p) => p.kind === 'data');
      expect(dataParts).toHaveLength(1);
      expect(dataParts[0].data?.artifactId).toBe('api-usage-1');
    });

    it('passes the correct baseSelector (including >) to createArtifact', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(mockArtifactData);
      const base = "content[0].text.documents[?title=='Platform > llms.txt']";
      const text = `<artifact:create id='a1' tool='t1' type='citation' base="${base}" />`;
      await parser.parseText(text);
      expect(mockArtifactService.createArtifact).toHaveBeenCalledWith(
        expect.objectContaining({ baseSelector: base }),
        undefined,
        undefined
      );
    });

    it('preserves surrounding text around an artifact tag', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(mockArtifactData);
      const text = `Before the artifact. <artifact:create id='a1' tool='t1' type='citation' base='result' /> After the artifact.`;
      const parts = await parser.parseText(text);
      const textParts = parts.filter((p) => p.kind === 'text');
      expect(textParts[0].text).toBe('Before the artifact. ');
      expect(textParts[1].text).toBe(' After the artifact.');
    });

    it('handles multiple artifact:create tags', async () => {
      const a2data = { ...mockArtifactData, artifactId: 'a2', toolCallId: 't2' };
      mockArtifactService.createArtifact
        .mockResolvedValueOnce(mockArtifactData)
        .mockResolvedValueOnce(a2data);
      const text = `First: <artifact:create id='a1' tool='t1' type='citation' base='result1' /> Second: <artifact:create id='a2' tool='t2' type='citation' base='result2' />`;
      const parts = await parser.parseText(text);
      const dataParts = parts.filter((p) => p.kind === 'data');
      expect(dataParts).toHaveLength(2);
      expect(dataParts[0].data?.artifactId).toBe('a1');
      expect(dataParts[1].data?.artifactId).toBe('a2');
    });

    it('removes the artifact tag when the service returns null', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(null);
      const text = `Before <artifact:create id='a1' tool='t1' type='citation' base='result' /> After`;
      const parts = await parser.parseText(text);
      const dataParts = parts.filter((p) => p.kind === 'data');
      expect(dataParts).toHaveLength(0);
    });

    it('handles artifact:create with single-quoted JSON in details attribute', async () => {
      mockArtifactService.createArtifact.mockResolvedValue(mockArtifactData);
      const text = `<artifact:create id='a1' tool='t1' type='citation' base='result' details='{"url":"url","title":"title"}' />`;
      const parts = await parser.parseText(text);
      expect(parts.filter((p) => p.kind === 'data')).toHaveLength(1);
    });
  });
});
