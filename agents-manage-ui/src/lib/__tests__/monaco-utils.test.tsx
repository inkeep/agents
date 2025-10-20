import * as monaco from 'monaco-editor';
import { addDecorations } from '@/lib/monaco-editor/monaco-utils';
import '@/lib/monaco-editor/setup-monaco-workers';

const obj = {
  null: null,
  number: 1,
  boolean: false,
  array: [
    true,
    {
      foo: 'bar',
    },
    [2, 'baz'],
  ],
  string: 'hello',
  emptyString: '',
};

describe('Monaco-Editor Functionality', () => {
  let editor: monaco.editor.IStandaloneCodeEditor;
  let model: monaco.editor.ITextModel;
  let container: HTMLDivElement;

  function getOrCreateModel({ uri: $uri, value }: { uri: string; value: string }) {
    const uri = monaco.Uri.file($uri);
    const language = uri.path.split('.').at(-1);
    if (!language) {
      throw new Error(`Could not determine file language from path: "${uri.path}"`);
    }
    const model = monaco.editor.getModel(uri);
    return model ?? monaco.editor.createModel(value, language, uri);
  }

  beforeEach(() => {
    // Create a container for Monaco Editor
    container = document.createElement('div');
    document.body.append(container);

    model = getOrCreateModel({
      uri: 'test.json',
      value: JSON.stringify(obj, null, 2),
    });

    // Create Monaco editor
    editor = monaco.editor.create(container, {
      language: 'json',
      model,
    });
  });

  afterEach(async () => {
    editor?.dispose();
    model?.dispose();
    container?.remove();

    // Wait for any pending operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should test monaco.editor.tokenize with proper worker initialization', async () => {
    // Wait for Monaco workers to initialize
    const { promise, resolve } = Promise.withResolvers();
    requestAnimationFrame(resolve);
    await promise;

    expect(monaco.editor.tokenize(model.getValue(), 'json')).toMatchFileSnapshot('tokenize.json');

    expect(model.getValue()).toMatchInlineSnapshot(`
      "{
        "null": null,
        "number": 1,
        "boolean": false,
        "array": [
          true,
          {
            "foo": "bar"
          },
          [
            2,
            "baz"
          ]
        ],
        "string": "hello",
        "emptyString": ""
      }"
    `);

    const { decorations, decorationCollection } = addDecorations({
      monaco,
      editorInstance: editor,
      content: model.getValue(),
    });

    // Verify that decorations were created (we have 9 primitive values: null, 1, false, true, "bar", 2, "baz", "hello", "")
    expect(decorations).toHaveLength(9);

    // Verify the decorations are applied to the editor
    const appliedDecorations = decorationCollection.getRanges();
    expect(appliedDecorations).toHaveLength(9);

    // Verify that the decorations are positioned correctly
    // Based on the debug output, we have decorations on these lines:
    const decorationPositions = appliedDecorations.map((range) => ({
      startLineNumber: range.startLineNumber,
      startColumn: range.startColumn,
    }));

    /**
     * Add decorations to a string content using actual decoration positions
     * This function modifies the string content to show where decorations would be inserted
     */
    function addDecorationsToString(content: string, addedContent = '❌'): string {
      const lines = content.split('\n');
      const modifiedLines: string[] = [];

      // Sort decorations by line number and column (descending) to avoid offset issues
      const sortedDecorations = decorationPositions
        .map((pos, index) => ({ ...pos, originalIndex: index }))
        .sort((a, b) => {
          if (a.startLineNumber !== b.startLineNumber) {
            return b.startLineNumber - a.startLineNumber;
          }
          return b.startColumn - a.startColumn;
        });

      // Process each line
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineNumber = lineIndex + 1;
        let modifiedLine = lines[lineIndex];

        // Find decorations for this line
        const lineDecorations = sortedDecorations.filter(
          (decoration) => decoration.startLineNumber === lineNumber
        );

        // Apply decorations to this line (from right to left to maintain positions)
        for (const decoration of lineDecorations) {
          const insertPosition = decoration.startColumn - 1; // Convert to 0-based index

          // Insert the decoration at the specified position
          modifiedLine =
            modifiedLine.slice(0, insertPosition) +
            addedContent +
            modifiedLine.slice(insertPosition);
        }

        modifiedLines.push(modifiedLine);
      }

      return modifiedLines.join('\n');
    }

    const expectedContentWithDecorations = `{
  "null": null,❌
  "number": 1,❌
  "boolean": false,❌
  "array": [
    true,❌
    {
      "foo": "bar"❌
    },
    [
      2,❌
      "baz"❌
    ]
  ],
  "string": "hello",❌
  "emptyString": ""❌
}`;
    expect(addDecorationsToString(model.getValue())).toBe(expectedContentWithDecorations);
  });
});
