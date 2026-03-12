vi.mock('ai', () => ({ parsePartialJson: vi.fn(), tool: vi.fn((c) => c) }));

import { describe, expect, it, vi } from 'vitest';
import { cleanArtifactForStream } from '../../../domains/run/stream/stream-helpers';

describe('cleanArtifactForStream', () => {
  it('returns artifact unchanged when artifactSummary is absent', () => {
    const artifact = { id: 'a1', type: 'text', data: 'hello' };
    const result = cleanArtifactForStream(artifact);
    expect(result).toEqual(artifact);
  });

  it('strips _structureHints from artifactSummary', () => {
    const artifact = {
      id: 'a1',
      artifactSummary: {
        _structureHints: { hint: 'value' },
        summary: 'A summary',
      },
    };
    const result = cleanArtifactForStream(artifact);
    expect(result.artifactSummary).not.toHaveProperty('_structureHints');
    expect(result.artifactSummary.summary).toBe('A summary');
  });

  it('strips _structureInfo from artifactSummary', () => {
    const artifact = {
      id: 'a1',
      artifactSummary: {
        _structureInfo: { info: 'value' },
        summary: 'A summary',
      },
    };
    const result = cleanArtifactForStream(artifact);
    expect(result.artifactSummary).not.toHaveProperty('_structureInfo');
    expect(result.artifactSummary.summary).toBe('A summary');
  });

  it('strips both _structureHints and _structureInfo and keeps other fields', () => {
    const artifact = {
      id: 'a1',
      type: 'chart',
      artifactSummary: {
        _structureHints: { hint: 'x' },
        _structureInfo: { info: 'y' },
        summary: 'A summary',
        title: 'My title',
      },
    };
    const result = cleanArtifactForStream(artifact);
    expect(result.id).toBe('a1');
    expect(result.type).toBe('chart');
    expect(result.artifactSummary).toEqual({ summary: 'A summary', title: 'My title' });
  });

  it('does not mutate the original object', () => {
    const original = {
      id: 'a1',
      artifactSummary: {
        _structureHints: { hint: 'x' },
        _structureInfo: { info: 'y' },
        summary: 'A summary',
      },
    };
    const originalCopy = JSON.parse(JSON.stringify(original));
    cleanArtifactForStream(original);
    expect(original).toEqual(originalCopy);
  });

  it('handles null input gracefully', () => {
    expect(cleanArtifactForStream(null)).toBeNull();
  });

  it('handles undefined input gracefully', () => {
    expect(cleanArtifactForStream(undefined)).toBeUndefined();
  });
});
