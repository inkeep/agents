import { extractInvalidVariables } from '../prompt-editor-utils';

describe('extractInvalidVariables', () => {
  const suggestions = ['user.name', 'headers.x-api-key', 'items[*].id'];

  it('detects variables not in the suggestion list', () => {
    const invalid = extractInvalidVariables('Hello {{unknown}} and {{another}}', suggestions);

    expect(invalid).toEqual(['unknown', 'another']);
  });

  it('ignores allowed variable patterns', () => {
    const invalid = extractInvalidVariables(
      '{{$env.API_KEY}} {{items[*].id}} {{length(items)}}',
      suggestions
    );

    expect(invalid).toEqual([]);
  });
});
