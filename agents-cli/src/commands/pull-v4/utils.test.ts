import {
  buildComponentFileName,
  collectTemplateVariableNames,
  formatStringLiteral,
  formatTemplate,
  isHumanReadableId,
  toCamelCase,
  toKebabCase,
} from './utils';

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

describe('toKebabCase', () => {
  test('should convert display names to kebab-case', () => {
    expect(toKebabCase('Support Agent')).toBe('support-agent');
  });
  test('should handle camelCase input', () => {
    expect(toKebabCase('supportAgent')).toBe('support-agent');
  });
  test('should collapse multiple separators', () => {
    expect(toKebabCase('  My   Cool  Tool  ')).toBe('my-cool-tool');
  });
  test('should handle already-kebab input', () => {
    expect(toKebabCase('already-kebab')).toBe('already-kebab');
  });
});

describe('isHumanReadableId', () => {
  test('should return true for kebab-case slugs', () => {
    expect(isHumanReadableId('support-agent')).toBe(true);
    expect(isHumanReadableId('tier-one')).toBe(true);
    expect(isHumanReadableId('github-webhook')).toBe(true);
  });
  test('should return true for short simple words', () => {
    expect(isHumanReadableId('webhook')).toBe(true);
    expect(isHumanReadableId('agent')).toBe(true);
  });
  test('should return false for UUIDs', () => {
    expect(isHumanReadableId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
  test('should return false for CUIDs', () => {
    expect(isHumanReadableId('cm82v49jh001upc01lo2ddxn2')).toBe(false);
  });
  test('should return false for long alphanumeric strings', () => {
    expect(isHumanReadableId('a8f3b2c1d4e5f6')).toBe(false);
  });
  test('should return false for nanoid-style IDs (21-char lowercase alphanumeric)', () => {
    expect(isHumanReadableId('k3mf8vq2xn1p7rtj4yw0s')).toBe(false);
    expect(isHumanReadableId('abcdefghijklmnopqrstu')).toBe(false);
  });
  test('should return true for underscore-separated words', () => {
    expect(isHumanReadableId('my_cool_agent')).toBe(true);
  });
  test('should return true for IDs with a version number suffix', () => {
    expect(isHumanReadableId('agent-v2')).toBe(true);
  });
});

describe('buildComponentFileName', () => {
  test('should return id-based name for human-readable ids', () => {
    expect(buildComponentFileName('support-agent', 'Support Agent')).toBe('support-agent.ts');
  });
  test('should use name with truncated id suffix for opaque ids', () => {
    expect(buildComponentFileName('cm82v49jh001upc01lo2ddxn2', 'Support Agent')).toBe(
      'support-agent-lo2ddxn2.ts'
    );
  });
  test('should fall back to full id when no name is provided', () => {
    expect(buildComponentFileName('cm82v49jh001upc01lo2ddxn2')).toBe(
      'cm82v49jh001upc01lo2ddxn2.ts'
    );
  });
  test('should fall back to id when name produces the same kebab as the id', () => {
    expect(buildComponentFileName('support-agent', 'support-agent')).toBe('support-agent.ts');
  });
});

describe('template variable replacement', () => {
  test('should collect template variable names using double-brace syntax', () => {
    expect(collectTemplateVariableNames('Time: {{time}}, TZ: {{headers.tz}}')).toEqual([
      'time',
      'headers.tz',
    ]);
  });

  test('should replace context and headers template variables with toTemplate calls', () => {
    expect(
      formatTemplate('Time: {{time}}, TZ: {{headers.tz}}', {
        contextReference: 'supportContext',
        headersReference: 'supportContextHeaders',
      })
    ).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test assert
      'Time: ${supportContext.toTemplate("time")}, TZ: ${supportContextHeaders.toTemplate("tz")}'
    );
  });
});
