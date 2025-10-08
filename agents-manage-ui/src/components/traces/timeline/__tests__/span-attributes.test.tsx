import * as monaco from 'monaco-editor';

describe('Monaco Editor Copy Functionality - Real Monaco Editor', () => {
  let editor: monaco.editor.IStandaloneCodeEditor;
  let model: monaco.editor.ITextModel;
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container for Monaco Editor
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    document.body.appendChild(container);

    // Create Monaco editor
    editor = monaco.editor.create(container, {
      value: JSON.stringify(
        {
          array: [1, 2, 3],
          number: 2,
          foo: {
            bar: {
              baz: '',
            },
          },
        },
        null,
        2
      ),
      language: 'json',
    });

    model = editor.getModel()!;
  });

  afterEach(() => {
    if (editor) {
      editor.dispose();
    }
    if (model) {
      model.dispose();
    }
    if (container) {
      document.body.removeChild(container);
    }
  });

  it('should tokenize JSON content correctly', () => {
    const tokens = monaco.editor.tokenize(model.getValue(), 'json');

    expect(tokens).toBeDefined();
    expect(tokens.length).toBeGreaterThan(0);

    // Check that we have the expected token types
    const allTokens = tokens.flat();
    const tokenTypes = allTokens.map((token) => token.type);

    expect(tokenTypes).toContain('delimiter.bracket.json');
    expect(tokenTypes).toContain('delimiter.array.json');
    expect(tokenTypes).toContain('number.json');
    expect(tokenTypes).toContain('string.value.json');
  });
});
