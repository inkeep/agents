import { buildPromptContent, extractInvalidVariables } from '../prompt-editor-utils';

describe('buildPromptContent', () => {
  it('creates a paragraph for each line', () => {
    const content = buildPromptContent('hello\nworld');

    expect(content).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
      ],
    });
  });

  it('preserves empty lines', () => {
    const content = buildPromptContent('one\n\ntwo');

    expect(content).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ],
    });
  });
});

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
