import { editor, Uri, type IDisposable, Range } from 'monaco-editor';
import type { RefObject } from 'react';

export function addDecorations(editorInstance: editor.IStandaloneCodeEditor): {
  decorations: editor.IModelDeltaDecoration[];
  decorationCollection: editor.IEditorDecorationsCollection;
} {
  // Add decorations for copy icons after primitive values
  const decorations: editor.IModelDeltaDecoration[] = [];
  const model = editorInstance.getModel()!;

  const tokens = editor.tokenize(model.getValue(), 'json');

  // Function to check if a token should show a copy icon
  const shouldShowCopyIcon = (tokenType: string): boolean => {
    if (tokenType === 'string.value.json') return true;
    if (tokenType === 'number.json') return true;
    if (tokenType === 'keyword.json') return true;
    return false;
  };

  // Find tokens that should have copy icons and add decorations
  let lineNumber = 1;
  for (const lineTokens of tokens) {
    for (const token of lineTokens) {
      if (shouldShowCopyIcon(token.type)) {
        const range = new Range(lineNumber, token.offset + 1, lineNumber, token.offset + 1);
        decorations.push({
          range,
          options: {
            after: {
              content: ' #',
              inlineClassName: 'copy-button-icon',
            },
          },
        });
        console.log(
          `Added decoration for ${token.type} at line ${lineNumber}, offset ${token.offset}`
        );
      }
    }
    lineNumber++;
  }

  console.log(`Total decorations created: ${decorations.length}`);

  // Apply decorations to the editor
  const decorationCollection = editorInstance.createDecorationsCollection(decorations);

  return { decorations, decorationCollection };
}

export function getOrCreateModel({ uri: $uri, value }: { uri: string; value: string }) {
  const uri = Uri.file($uri);
  const model = editor.getModel(uri);
  const language = uri.path.split('.').at(-1)!;
  return model ?? editor.createModel(value, language, uri);
}

export const MONACO_THEME = {
  dark: 'inkeep-dark',
  light: 'inkeep-light',
};

editor.defineTheme(MONACO_THEME.dark, {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#18181b',
  },
});
editor.defineTheme(MONACO_THEME.light, {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fafaf9',
  },
});

export function createEditor(
  domElement: RefObject<HTMLDivElement>,
  options: editor.IStandaloneEditorConstructionOptions
): editor.IStandaloneCodeEditor {
  const { model } = options;
  if (!model) {
    throw new Error('options.model is required');
  }
  const language = model.uri.path.split('.').at(-1)!;
  return editor.create(domElement.current, {
    language,
    automaticLayout: true,
    fontSize: 15,
    minimap: { enabled: false }, // disable the minimap
    tabSize: 2,
    renderLineHighlight: 'none', // Remove a line selection border
    stickyScroll: { enabled: false }, // Disable sticky scroll widget
    overviewRulerLanes: 0, // remove unnecessary error highlight on the scroll
    scrollbar: {
      verticalScrollbarSize: 10,
    },
    scrollBeyondLastLine: false, // cleans up unnecessary "padding-bottom" on each editor
    lineNumbersMinChars: 2, // reduce line numbers width on the left size
    ...options,
  });
}

export function cleanupDisposables(disposables: IDisposable[]) {
  return () => {
    for (const disposable of disposables) {
      disposable.dispose(); // remove the listener
    }
  };
}
