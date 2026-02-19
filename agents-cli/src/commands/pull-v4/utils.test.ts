import { formatStringLiteral, toCamelCase } from './utils';

describe('camelCase', () => {
  test('should handle special characters', () => {
    expect(toCamelCase('agent-v2_final')).toBe('agentV2Final');
  });
  test('should handle starting with numbers', () => {
    expect(toCamelCase('2nd-generation-agent')).toBe('_2ndGenerationAgent');
  });
  test('should capitalize char after dot', () => {
    expect(toCamelCase('status.config')).toBe('statusConfig');
    expect(toCamelCase('statuS.config')).toBe('statuSConfig');
    expect(toCamelCase('statuS0.config')).toBe('statuS0Config');
  });
});

describe('formatStringLiteral', () => {
  test('should use single quotes by default', () => {
    expect(formatStringLiteral('find 3 urls')).toBe("'find 3 urls'");
  });

  test('should use double quotes when value contains a single quote', () => {
    expect(formatStringLiteral("user's question")).toBe(`"user's question"`);
  });

  test('should use a template literal when value contains both single and double quotes', () => {
    expect(formatStringLiteral(`find 3 URLs relevant to the user's "question".`)).toBe(
      '`find 3 URLs relevant to the user\'s "question".`'
    );
  });
});
