import { describe, expect, test } from 'vitest';
import { ACTIVITY_TYPES, type ActivityItem } from '@/components/traces/timeline/types';
import { formatActivityForSummary } from '@/lib/utils/trace-formatter';

const baseActivity = (overrides: Partial<ActivityItem>): ActivityItem =>
  ({
    id: 'span-1',
    type: ACTIVITY_TYPES.AI_GENERATION,
    description: 'Agent Generation',
    status: 'success',
    timestamp: '2026-05-27T08:51:08.792Z',
    ...overrides,
  }) as ActivityItem;

describe('formatActivityForSummary — cache fields mirror the visible timeline badge', () => {
  test('AI generation summary includes cacheState + read/write (the badge is visible on this row)', () => {
    const summary = formatActivityForSummary(
      baseActivity({
        type: ACTIVITY_TYPES.AI_GENERATION,
        cacheState: 'HIT',
        cacheReadTokens: 15927,
        cacheCreationTokens: 3324,
      })
    );

    expect(summary.cacheState).toBe('HIT');
    expect(summary.cacheReadTokens).toBe(15927);
    expect(summary.cacheCreationTokens).toBe(3324);
  });

  test('AI streamed-text summary also includes the cache fields', () => {
    const summary = formatActivityForSummary(
      baseActivity({
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
        cacheState: 'MISS-expected',
        cacheReadTokens: 0,
        cacheCreationTokens: 15927,
      })
    );

    expect(summary.cacheState).toBe('MISS-expected');
    expect(summary.cacheCreationTokens).toBe(15927);
  });

  test('debug-only fields (markerCount, prefixSignature) stay out of the summary — they are not shown in the UI', () => {
    const summary = formatActivityForSummary(
      baseActivity({
        type: ACTIVITY_TYPES.AI_GENERATION,
        cacheState: 'HIT',
        cacheReadTokens: 15927,
        cacheMarkerCount: 1,
        cachePrefixSignature: '2f50e6ab00',
      })
    );

    expect(summary.cacheMarkerCount).toBeUndefined();
    expect(summary.cachePrefixSignature).toBeUndefined();
  });

  test('non-LLM activities (e.g. tool calls) do not carry cache fields in their summary', () => {
    const summary = formatActivityForSummary(
      baseActivity({
        type: ACTIVITY_TYPES.TOOL_CALL,
        toolName: 'search-knowledge-base',
        // cache fields are not in TOOL_CALL's visible set even if present on the activity
        cacheState: 'HIT',
        cacheReadTokens: 15927,
      })
    );

    expect(summary.cacheState).toBeUndefined();
    expect(summary.cacheReadTokens).toBeUndefined();
  });
});
