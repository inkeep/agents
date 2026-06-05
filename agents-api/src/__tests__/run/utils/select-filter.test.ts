import { describe, expect, it } from 'vitest';
import { ToolChainResolutionError } from '../../../domains/run/artifacts/ArtifactParser';
import { SENTINEL_KEY } from '../../../domains/run/constants/artifact-syntax';
import { applySelector, sanitizeJMESPathSelector } from '../../../domains/run/utils/select-filter';

describe('sanitizeJMESPathSelector', () => {
  it('should fix double-quoted comparisons', () => {
    expect(sanitizeJMESPathSelector('[?status=="active"]')).toBe("[?status=='active']");
  });

  it('should fix tilde-contains pattern with double quotes', () => {
    expect(sanitizeJMESPathSelector('[?title~contains(@, "test")]')).toBe(
      '[?contains(title, `test`)]'
    );
  });

  it('should fix tilde-contains pattern with single quotes', () => {
    expect(sanitizeJMESPathSelector("[?title~contains(@, 'test')]")).toBe(
      '[?contains(title, `test`)]'
    );
  });

  it('should remove stray tilde operators', () => {
    expect(sanitizeJMESPathSelector('field ~ value')).toBe('field value');
  });

  it('should return valid expressions unchanged', () => {
    expect(sanitizeJMESPathSelector('items[?score > `0.8`]')).toBe('items[?score > `0.8`]');
  });
});

describe('applySelector', () => {
  const toolCallId = 'call_test_123';

  const sampleData = {
    items: [
      { title: 'Alpha', score: 0.9, url: 'https://a.com' },
      { title: 'Beta', score: 0.5, url: 'https://b.com' },
      { title: 'Gamma', score: 0.85, url: 'https://g.com' },
    ],
    metadata: { total: 3, query: 'test' },
  };

  it('should filter array by condition', () => {
    const result = applySelector(sampleData, 'items[?score > `0.8`]', toolCallId);
    expect(result).toEqual([
      { title: 'Alpha', score: 0.9, url: 'https://a.com' },
      { title: 'Gamma', score: 0.85, url: 'https://g.com' },
    ]);
  });

  it('should extract specific fields', () => {
    const result = applySelector(sampleData, 'items[].{title: title, url: url}', toolCallId);
    expect(result).toEqual([
      { title: 'Alpha', url: 'https://a.com' },
      { title: 'Beta', url: 'https://b.com' },
      { title: 'Gamma', url: 'https://g.com' },
    ]);
  });

  it('should count elements', () => {
    const result = applySelector(sampleData, 'length(items)', toolCallId);
    expect(result).toBe(3);
  });

  it('should access nested fields', () => {
    const result = applySelector(sampleData, 'metadata.query', toolCallId);
    expect(result).toBe('test');
  });

  it('should get first element', () => {
    const result = applySelector(sampleData, 'items[0]', toolCallId);
    expect(result).toEqual({ title: 'Alpha', score: 0.9, url: 'https://a.com' });
  });

  it('should auto-strip result. prefix', () => {
    const result = applySelector(sampleData, 'result.metadata.total', toolCallId);
    expect(result).toBe(3);
  });

  it('should handle string input', () => {
    const result = applySelector('hello world', 'length(@)', toolCallId);
    expect(result).toBe(11);
  });

  it('should throw ToolChainResolutionError when selector matches nothing', () => {
    expect(() => applySelector(sampleData, 'nonexistent', toolCallId)).toThrow(
      ToolChainResolutionError
    );
    expect(() => applySelector(sampleData, 'nonexistent', toolCallId)).toThrow(
      new RegExp(`${SENTINEL_KEY.SELECT} matched nothing`)
    );
  });

  it('should return empty array when filter condition excludes all items', () => {
    const result = applySelector(sampleData, 'items[?score > `0.99`]', toolCallId);
    expect(result).toEqual([]);
  });

  it('should throw ToolChainResolutionError for null input', () => {
    expect(() => applySelector(null, 'items', toolCallId)).toThrow(ToolChainResolutionError);
  });

  it('should throw ToolChainResolutionError for invalid expression', () => {
    expect(() => applySelector(sampleData, '[invalid!!!', toolCallId)).toThrow(
      ToolChainResolutionError
    );
  });

  it('should throw ToolChainResolutionError for dangerous patterns', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing dangerous pattern detection
    expect(() => applySelector(sampleData, '${evil}', toolCallId)).toThrow(
      ToolChainResolutionError
    );
    expect(() => applySelector(sampleData, 'eval()', toolCallId)).toThrow(ToolChainResolutionError);
    expect(() => applySelector(sampleData, '__proto__', toolCallId)).toThrow(
      ToolChainResolutionError
    );
  });

  it('should throw ToolChainResolutionError for overly long expressions', () => {
    const longExpr = 'a'.repeat(1001);
    expect(() => applySelector(sampleData, longExpr, toolCallId)).toThrow(ToolChainResolutionError);
  });

  it('should include expression in error message', () => {
    try {
      applySelector(sampleData, '[bad!', toolCallId);
    } catch (error) {
      expect(error).toBeInstanceOf(ToolChainResolutionError);
      expect((error as ToolChainResolutionError).message).toContain('[bad!');
      expect((error as ToolChainResolutionError).toolCallId).toBe(toolCallId);
    }
  });

  it('should sanitize LLM errors before applying', () => {
    const data = { items: [{ status: 'active' }, { status: 'inactive' }] };
    // The top-level object is not an array, so [?status=="active"] (sanitized to single quotes)
    // applied to the object returns null — which now throws
    expect(() => applySelector(data, '[?status=="active"]', toolCallId)).toThrow(
      ToolChainResolutionError
    );
  });

  it('should trim whitespace from selector', () => {
    const result = applySelector(sampleData, '  metadata.total  ', toolCallId);
    expect(result).toBe(3);
  });
});
