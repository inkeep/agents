import { describe, expect, it } from 'vitest';
import { ArtifactParser } from '../../../domains/run/artifacts/ArtifactParser';

describe('ArtifactParser.parseRefIds', () => {
  it('returns an empty array when no refs are present', () => {
    expect(ArtifactParser.parseRefIds('plain text with no references')).toEqual([]);
  });

  it('extracts a single ref id from a self-closing tag', () => {
    expect(ArtifactParser.parseRefIds('See <artifact:ref id="art-1" tool="t1" />')).toEqual([
      'art-1',
    ]);
  });

  it('extracts a single ref id from a non-self-closing tag', () => {
    expect(ArtifactParser.parseRefIds('See <artifact:ref id="art-1" tool="t1">')).toEqual([
      'art-1',
    ]);
  });

  it('extracts every ref id when multiple refs appear (D-K multi-cite path)', () => {
    const text =
      'First <artifact:ref id="art-1" tool="t1" /> and then <artifact:ref id="art-2" tool="t2" /> and a third <artifact:ref id="art-3" tool="t3" />.';
    expect(ArtifactParser.parseRefIds(text)).toEqual(['art-1', 'art-2', 'art-3']);
  });

  it('skips refs that do not declare an id attribute', () => {
    const text =
      '<artifact:ref tool="t1" /> and <artifact:ref id="art-2" tool="t2" /> and <artifact:ref tool="t3" />';
    expect(ArtifactParser.parseRefIds(text)).toEqual(['art-2']);
  });

  it('handles single-quoted attribute values', () => {
    expect(ArtifactParser.parseRefIds("<artifact:ref id='art-1' tool='t1' />")).toEqual(['art-1']);
  });
});
