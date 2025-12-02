import type * as Monaco from 'monaco-editor';
import { addDecorations, getOrCreateModel } from '@/lib/monaco-editor/monaco-utils';
import { monacoStore } from '@/features/agent/state/use-monaco-store';
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
  multipleQuotes:
    '["/Users/Inkeep/.fnm/node-versions/v22.20.0/installation/bin/node","/Users/Inkeep/Desktop/agents/agents-run-api/node_modules/vite/bin/vite.js"]',
};

describe('Monaco-Editor Functionality', () => {
  let editor: Monaco.editor.IStandaloneCodeEditor;
  let model: Monaco.editor.ITextModel;
  let container: HTMLDivElement;

  beforeAll(async () => {
    const { actions } = monacoStore.getState();
    await actions.setMonaco();
    requestAnimationFrame(async () => {
      await actions.setupHighlighter(true);
    });
  });

  beforeEach(() => {
    // biome-ignore lint/style/noNonNullAssertion: ignore
    const monaco = monacoStore.getState().monaco!;

    // Create a container for Monaco Editor
    container = document.createElement('div');
    document.body.append(container);

    model = getOrCreateModel({
      monaco,
      uri: 'test.json',
      value: JSON.stringify(obj, null, 2),
    }).model;

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
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  it('should test monaco.editor.tokenize with proper worker initialization', async () => {
    // Wait for Monaco workers to initialize
    const { promise, resolve } = Promise.withResolvers();
    requestAnimationFrame(resolve);
    await promise;

    const modelValue = model.getValue();
    expect(modelValue).toBe(JSON.stringify(obj, null, 2));

    // biome-ignore lint/style/noNonNullAssertion: ignore
    const monaco = monacoStore.getState().monaco!;

    expect(monaco.editor.tokenize(modelValue, 'json')).toMatchInlineSnapshot(`
      [
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
        ],
      ]
    `);

    const { decorations } = addDecorations({
      monaco,
      editorInstance: editor,
      content: modelValue,
    });

    /**
     * Add decorations to a string content using actual decoration positions
     * This function modifies the string content to show where decorations would be inserted
     */
    function addDecorationsToString(content: string, addedContent = '❌'): string {
      const lines = content.split('\n');
      const modifiedLines: string[] = [];

      // Sort decorations by line number and column (descending) to avoid offset issues
      const sortedDecorations = decorations
        .map((pos, index) => ({ ...pos, originalIndex: index }))
        .sort(({ range: a }, { range: b }) => {
          if (a.startLineNumber !== b.startLineNumber) {
            return b.startLineNumber - a.startLineNumber;
          }
          return b.startColumn - a.startColumn;
        });

      // Process each line
      for (let [lineIndex, modifiedLine] of lines.entries()) {
        const lineNumber = lineIndex + 1;

        // Find decorations for this line
        const lineDecorations = sortedDecorations.filter(
          (decoration) => decoration.range.startLineNumber === lineNumber
        );

        // Apply decorations to this line (from right to left to maintain positions)
        for (const decoration of lineDecorations) {
          const insertPosition = decoration.range.startColumn;

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
  "emptyString": "",❌
  "multipleQuotes": "[\\"/Users/Inkeep/.fnm/node-versions/v22.20.0/installation/bin/node\\",\\"/Users/Inkeep/Desktop/agents/agents-run-api/node_modules/vite/bin/vite.js\\"]"❌
}`;
    expect(addDecorationsToString(modelValue)).toBe(expectedContentWithDecorations);
  });
});
