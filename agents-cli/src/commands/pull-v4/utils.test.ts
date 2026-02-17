import { toCamelCase } from './utils';

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
