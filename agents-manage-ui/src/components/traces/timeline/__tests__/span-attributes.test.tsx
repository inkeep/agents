import * as monaco from 'monaco-editor';
import '@/lib/setup-monaco-workers';

describe('Span Attributes Copy Functionality', () => {
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

  it('', () => {
    console.log(model.getValue());
    const lines = monaco.editor.tokenize(model.getValue(), 'json');
    console.log(lines);
  });
});
