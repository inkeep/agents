import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asArtifactRef,
  createReplayHydrationContext,
  hydrateArtifactRef,
  isAttachmentBookkeepingRef,
  parseDataPart,
} from '../replay-hydration';

const { getLedgerArtifactsMock } = vi.hoisted(() => ({
  getLedgerArtifactsMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  getLedgerArtifacts: getLedgerArtifactsMock,
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

vi.mock('../../../../logger', () => createMockLoggerModule().module);

vi.mock('../../../../data/db/runDbClient', () => ({ default: 'mock-run-db-client' }));

vi.mock('../../session/AgentSession', () => ({
  agentSessionManager: {
    getArtifactCache: vi.fn().mockResolvedValue(null),
  },
}));

const scopes = { tenantId: 't', projectId: 'p' };

describe('parseDataPart', () => {
  it('passes through non-string values', () => {
    expect(parseDataPart({ a: 1 })).toEqual({ a: 1 });
    expect(parseDataPart(42)).toBe(42);
    expect(parseDataPart(null)).toBe(null);
  });

  it('parses JSON strings', () => {
    expect(parseDataPart('{"artifactId":"a","toolCallId":"t"}')).toEqual({
      artifactId: 'a',
      toolCallId: 't',
    });
  });

  it('returns raw string when JSON is invalid', () => {
    expect(parseDataPart('not json')).toBe('not json');
  });
});

describe('asArtifactRef', () => {
  it('returns ref when both fields are strings', () => {
    expect(asArtifactRef({ artifactId: 'a', toolCallId: 't' })).toEqual({
      artifactId: 'a',
      toolCallId: 't',
    });
  });

  it('ignores extra fields', () => {
    expect(asArtifactRef({ artifactId: 'a', toolCallId: 't', other: 1 })).toEqual({
      artifactId: 'a',
      toolCallId: 't',
    });
  });

  it('returns null for non-ref shapes', () => {
    expect(asArtifactRef({ artifactId: 'a' })).toBeNull();
    expect(asArtifactRef({ toolCallId: 't' })).toBeNull();
    expect(asArtifactRef({ artifactId: 1, toolCallId: 't' })).toBeNull();
    expect(asArtifactRef(null)).toBeNull();
    expect(asArtifactRef('string')).toBeNull();
  });
});

describe('isAttachmentBookkeepingRef', () => {
  it('flags message_attachment: refs', () => {
    expect(
      isAttachmentBookkeepingRef({ artifactId: 'a', toolCallId: 'message_attachment:msg1' })
    ).toBe(true);
  });

  it('does not flag other tool call ids', () => {
    expect(isAttachmentBookkeepingRef({ artifactId: 'a', toolCallId: 'call_123' })).toBe(false);
    expect(isAttachmentBookkeepingRef({ artifactId: 'a', toolCallId: '' })).toBe(false);
  });
});

describe('createReplayHydrationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map when no artifact refs are present', async () => {
    getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve([]));
    const ctx = await createReplayHydrationContext(scopes, [
      { content: { text: 'hello', parts: [{ kind: 'text', text: 'hello' }] } },
    ]);
    expect(ctx.artifactMap.size).toBe(0);
    expect(getLedgerArtifactsMock).not.toHaveBeenCalled();
  });

  it('skips attachment bookkeeping refs when collecting tool call ids', async () => {
    const batchedQuery = vi.fn().mockResolvedValue([]);
    getLedgerArtifactsMock.mockReturnValue(batchedQuery);

    await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [
            {
              kind: 'data',
              data: { artifactId: 'att1', toolCallId: 'message_attachment:msg1' },
            },
          ],
        },
      },
    ]);

    // No real refs → no query made
    expect(batchedQuery).not.toHaveBeenCalled();
  });

  it('batches all non-bookkeeping tool call ids into a single query', async () => {
    const batchedQuery = vi.fn().mockResolvedValue([
      { artifactId: 'art1', toolCallId: 'call_a', parts: [{ data: { summary: { x: 1 } } }] },
      { artifactId: 'art2', toolCallId: 'call_b', parts: [{ data: { summary: { y: 2 } } }] },
    ]);
    getLedgerArtifactsMock.mockReturnValue(batchedQuery);

    const ctx = await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [
            { kind: 'data', data: { artifactId: 'art1', toolCallId: 'call_a' } },
            { kind: 'data', data: { artifactId: 'att', toolCallId: 'message_attachment:x' } },
          ],
        },
      },
      {
        content: {
          text: '',
          parts: [{ kind: 'data', data: { artifactId: 'art2', toolCallId: 'call_b' } }],
        },
      },
    ]);

    expect(batchedQuery).toHaveBeenCalledTimes(1);
    expect(batchedQuery).toHaveBeenCalledWith({
      scopes,
      toolCallIds: expect.arrayContaining(['call_a', 'call_b']),
    });
    const [{ toolCallIds }] = batchedQuery.mock.calls[0] as [{ toolCallIds: string[] }];
    expect(toolCallIds).toHaveLength(2);
    expect(ctx.artifactMap.size).toBe(2);
    expect(ctx.artifactMap.has('art1:call_a')).toBe(true);
    expect(ctx.artifactMap.has('art2:call_b')).toBe(true);
  });

  it('parses stringified JSON data parts', async () => {
    const batchedQuery = vi
      .fn()
      .mockResolvedValue([
        { artifactId: 'art1', toolCallId: 'call_a', parts: [{ data: { summary: {} } }] },
      ]);
    getLedgerArtifactsMock.mockReturnValue(batchedQuery);

    await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [
            {
              kind: 'data',
              data: JSON.stringify({ artifactId: 'art1', toolCallId: 'call_a' }),
            },
          ],
        },
      },
    ]);

    expect(batchedQuery).toHaveBeenCalledWith({
      scopes,
      toolCallIds: ['call_a'],
    });
  });
});

describe('hydrateArtifactRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a data-artifact part with summary folded in on map hit', async () => {
    getLedgerArtifactsMock.mockReturnValue(() =>
      Promise.resolve([
        {
          artifactId: 'art1',
          toolCallId: 'call_a',
          name: 'Chart',
          description: 'A chart',
          type: 'chart',
          metadata: { artifactType: 'chart' },
          parts: [{ data: { summary: { series: [1, 2, 3] } } }],
        },
      ])
    );

    const ctx = await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [{ kind: 'data', data: { artifactId: 'art1', toolCallId: 'call_a' } }],
        },
      },
    ]);

    const part = await hydrateArtifactRef(ctx, { artifactId: 'art1', toolCallId: 'call_a' });
    expect(part).toEqual({
      type: 'data-artifact',
      data: {
        artifactId: 'art1',
        toolCallId: 'call_a',
        name: 'Chart',
        description: 'A chart',
        type: 'chart',
        artifactSummary: { series: [1, 2, 3] },
      },
    });
  });

  it('returns null on ledger miss', async () => {
    getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve([]));
    const ctx = await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [{ kind: 'data', data: { artifactId: 'missing', toolCallId: 'call_x' } }],
        },
      },
    ]);

    const part = await hydrateArtifactRef(ctx, { artifactId: 'missing', toolCallId: 'call_x' });
    expect(part).toBeNull();
  });

  it('returns null when the parser throws and does not propagate the error', async () => {
    getLedgerArtifactsMock.mockReturnValue(() => Promise.resolve([]));
    const ctx = await createReplayHydrationContext(scopes, []);

    // Replace parser.parseObject with a thrower to simulate a corrupt ledger
    // row that trips formatArtifactSummaryData.
    ctx.parser.parseObject = vi.fn().mockRejectedValue(new Error('corrupt artifact'));

    const part = await hydrateArtifactRef(ctx, { artifactId: 'bad', toolCallId: 'call_bad' });
    expect(part).toBeNull();
  });
});

describe('createReplayHydrationContext error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map when the batched ledger query throws', async () => {
    getLedgerArtifactsMock.mockReturnValue(() => Promise.reject(new Error('connection refused')));

    const ctx = await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [{ kind: 'data', data: { artifactId: 'art1', toolCallId: 'call_a' } }],
        },
      },
    ]);

    expect(ctx.artifactMap.size).toBe(0);
  });

  it('still lets the caller hydrate non-existent refs without crashing after a DB failure', async () => {
    getLedgerArtifactsMock.mockReturnValue(() => Promise.reject(new Error('connection refused')));

    const ctx = await createReplayHydrationContext(scopes, [
      {
        content: {
          text: '',
          parts: [{ kind: 'data', data: { artifactId: 'art1', toolCallId: 'call_a' } }],
        },
      },
    ]);

    const part = await hydrateArtifactRef(ctx, { artifactId: 'art1', toolCallId: 'call_a' });
    expect(part).toBeNull();
  });
});
