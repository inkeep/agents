import * as monaco from 'monaco-editor';
import { getOrCreateModel, addDecorations } from '@/lib/monaco-utils';
import '@/lib/setup-monaco-workers';

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
    const { promise, resolve } = Promise.withResolvers();
    requestAnimationFrame(resolve);
    await promise;
  });

  it('should test monaco.editor.tokenize with proper worker initialization', async () => {
    // Wait for Monaco workers to initialize
    const { promise, resolve } = Promise.withResolvers();
    requestAnimationFrame(resolve);
    await promise;

    expect(monaco.editor.tokenize(model.getValue(), 'json')).toMatchInlineSnapshot(`
      [
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "delimiter.bracket.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 8,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 9,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 10,
            "type": "keyword.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 14,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 10,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 11,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 12,
            "type": "number.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 13,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 11,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 12,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 13,
            "type": "keyword.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 18,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 9,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 10,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 11,
            "type": "delimiter.array.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 4,
            "type": "keyword.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 8,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 4,
            "type": "delimiter.bracket.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 6,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 11,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 12,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 13,
            "type": "string.value.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 4,
            "type": "delimiter.bracket.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 5,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 4,
            "type": "delimiter.array.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 6,
            "type": "number.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 7,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 6,
            "type": "string.value.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 4,
            "type": "delimiter.array.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "delimiter.array.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 3,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 10,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 11,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 12,
            "type": "string.value.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 19,
            "type": "delimiter.comma.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 2,
            "type": "string.key.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 15,
            "type": "delimiter.colon.json",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 16,
            "type": "",
          },
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 17,
            "type": "string.value.json",
          },
        ],
        [
          Token {
            "_tokenBrand": undefined,
            "language": "json",
            "offset": 0,
            "type": "delimiter.bracket.json",
          },
        ],
      ]
    `);

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

    const { decorations, decorationCollection } = addDecorations(editor, model.getValue());

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

    // Verify we have decorations on the expected lines (based on actual token positions)
    expect(decorationPositions.some((pos) => pos.startLineNumber === 2)).toBe(true); // "null": null
    expect(decorationPositions.some((pos) => pos.startLineNumber === 3)).toBe(true); // "number": 1
    expect(decorationPositions.some((pos) => pos.startLineNumber === 4)).toBe(true); // "boolean": false
    expect(decorationPositions.some((pos) => pos.startLineNumber === 6)).toBe(true); // true
    expect(decorationPositions.some((pos) => pos.startLineNumber === 8)).toBe(true); // "foo": "bar"
    expect(decorationPositions.some((pos) => pos.startLineNumber === 11)).toBe(true); // 2
    expect(decorationPositions.some((pos) => pos.startLineNumber === 12)).toBe(true); // "baz"
    expect(decorationPositions.some((pos) => pos.startLineNumber === 15)).toBe(true); // "string": "hello"
    expect(decorationPositions.some((pos) => pos.startLineNumber === 16)).toBe(true); // "emptyString": ""
  });
});
