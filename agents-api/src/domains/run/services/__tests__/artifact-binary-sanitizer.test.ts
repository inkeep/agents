import { describe, expect, it } from 'vitest';
import { stripBinaryDataForObservability } from '../blob-storage/artifact-binary-sanitizer';

const SAMPLE_BASE64 = Buffer.from('sample image bytes').toString('base64');

describe('stripBinaryDataForObservability', () => {
  it('replaces image part data with placeholder', () => {
    const input = { type: 'image', data: SAMPLE_BASE64, mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.type).toBe('image');
    expect(result.data).toMatch(/^\[binary data ~\d+ bytes, mimeType: image\/png\]$/);
    expect(result.mimeType).toBe('image/png');
  });

  it('replaces file part data with placeholder', () => {
    const input = { type: 'file', data: SAMPLE_BASE64, mimeType: 'application/pdf' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toMatch(/^\[binary data ~\d+ bytes/);
  });

  it('leaves already-blob-uri data untouched', () => {
    const input = { type: 'image', data: 'blob://some/key', mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toBe('blob://some/key');
  });

  it('leaves http URLs untouched', () => {
    const input = { type: 'image', data: 'https://example.com/img.png', mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toBe('https://example.com/img.png');
  });

  it('strips data: URIs', () => {
    const input = {
      type: 'image',
      data: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
    };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toMatch(/^\[binary data/);
  });

  it('recursively strips nested binary parts', () => {
    const input = {
      toolResult: [
        { type: 'text', text: 'Ticket info' },
        { type: 'image', data: SAMPLE_BASE64, mimeType: 'image/jpeg' },
      ],
    };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.toolResult[0]).toEqual({ type: 'text', text: 'Ticket info' });
    expect(result.toolResult[1].data).toMatch(/^\[binary data/);
  });

  it('strips hydrated get_reference_artifact-style file content for persisted metadata', () => {
    const input = {
      artifactId: 'art-1',
      name: 'doc',
      description: 'binary',
      type: 'binary_attachment',
      data: { blobUri: 'blob://v1/key', mimeType: 'image/png' },
      content: [
        { type: 'text', text: '{"artifactId":"art-1","mimeType":"image/png"}' },
        {
          type: 'file',
          data: SAMPLE_BASE64,
          mimeType: 'image/png',
          filename: 'cutecat.png',
        },
      ],
    };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.artifactId).toBe('art-1');
    expect(result.data).toEqual(input.data);
    expect(result.content[0]).toEqual(input.content[0]);
    expect(result.content[1].filename).toBe('cutecat.png');
    expect(result.content[1].mimeType).toBe('image/png');
    expect(result.content[1].data).toMatch(/^\[binary data/);
  });

  it('handles arrays at top level', () => {
    const input = [
      { type: 'text', text: 'hi' },
      { type: 'image', data: SAMPLE_BASE64, mimeType: 'image/png' },
    ];
    const result = stripBinaryDataForObservability(input) as any[];
    expect(result[0]).toEqual({ type: 'text', text: 'hi' });
    expect(result[1].data).toMatch(/^\[binary data/);
  });

  it('passes through non-object primitives unchanged', () => {
    expect(stripBinaryDataForObservability('hello')).toBe('hello');
    expect(stripBinaryDataForObservability(42)).toBe(42);
    expect(stripBinaryDataForObservability(null)).toBeNull();
  });

  it('handles circular references safely', () => {
    const input: Record<string, unknown> = { type: 'container' };
    input.self = input;

    const result = stripBinaryDataForObservability(input) as Record<string, unknown>;
    expect(result.type).toBe('container');
    expect(result.self).toBe('[Circular Reference]');
  });
});
