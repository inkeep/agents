import { editor, Uri, type IDisposable } from 'monaco-editor';
import type { RefObject } from 'react';

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
    tabIndex: -1, // Do not allow tabbing into the editor, only via by pressing Enter or its container
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
