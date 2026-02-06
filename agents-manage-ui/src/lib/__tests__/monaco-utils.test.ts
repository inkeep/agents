// @vitest-environment jsdom
import type * as Monaco from 'monaco-editor';
import { monacoStore } from '@/features/agent/state/use-monaco-store';
import { addDecorations, getOrCreateModel } from '@/lib/monaco-editor/monaco-utils';

// Use fake timers to prevent Monaco's WorkerManager intervals from causing
// "window is not defined" errors after the test environment is torn down.
// The WorkerManager uses window.setInterval for idle checks, which can fire
// after JSDOM cleanup if we don't control the timers.
vi.useFakeTimers();

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
  multipleQuotes: '["/Users/Inkeep/.fnm/node-versions/v22.20.0/installation/bin/node"]',
};

describe('Monaco-Editor Functionality', async () => {
  let editor: Monaco.editor.IStandaloneCodeEditor;
  let model: Monaco.editor.ITextModel;
  let container: HTMLDivElement;
  await monacoStore.getState().actions.importMonaco();
  // biome-ignore lint/style/noNonNullAssertion: was set after importMonaco
  const monaco = monacoStore.getState().monaco!;

  beforeEach(() => {
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

  afterEach(() => {
    editor?.dispose();
    model?.dispose();
    container?.remove();

    // Clear all pending timers to prevent Monaco's WorkerManager intervals
    // from firing after the test environment is torn down.
    vi.clearAllTimers();
  });

  afterAll(() => {
    // Restore real timers after all tests in this suite complete
    vi.useRealTimers();
  });

  it('should test monaco.editor.tokenize with proper worker initialization', async () => {
    const modelValue = model.getValue();
    expect(modelValue).toBe(JSON.stringify(obj, null, 2));
    await expect(monaco.editor.tokenize(modelValue, 'json')).toMatchFileSnapshot(
      './markers-tokenize.snapshot'
    );

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
  "multipleQuotes": "[\\"/Users/Inkeep/.fnm/node-versions/v22.20.0/installation/bin/node\\"]"❌
}`;
    expect(addDecorationsToString(modelValue)).toBe(expectedContentWithDecorations);
  });
});
