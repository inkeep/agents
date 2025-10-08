import * as monaco from 'monaco-editor';
import { getOrCreateModel } from '@/lib/monaco-utils';
import '@/lib/setup-workers/webpack';

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

describe('Span Attributes Copy Functionality', () => {
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

  afterEach(() => {
    editor?.dispose();
    model?.dispose();
    container?.remove();
  });

  it('should test monaco.editor.tokenize with proper worker initialization', async () => {
    // Wait for Monaco workers to initialize
    await new Promise((resolve) => setTimeout(resolve, 60));

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
  });
});
