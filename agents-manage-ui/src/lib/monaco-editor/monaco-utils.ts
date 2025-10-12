import { editor, Uri, type IDisposable, Range, languages } from 'monaco-editor';
import { MONACO_THEME_DATA, MONACO_THEME_NAME } from '@/constants/theme';
import monacoCompatibleSchema from './dynamic-ref-compatible-json-schema.json';

// Function to check if a token should show a copy icon
function shouldShowCopyIcon(tokenType: string): boolean {
  switch (tokenType) {
    case 'string.value.json':
    case 'number.json':
    case 'keyword.json':
      return true;
  }
  return false;
}

export function addDecorations(
  editorInstance: editor.IStandaloneCodeEditor,
  content: string,
  addedContent = ' #'
): {
  decorations: editor.IModelDeltaDecoration[];
  decorationCollection: editor.IEditorDecorationsCollection;
} {
  // Add decorations for copy icons after primitive values
  const decorations: editor.IModelDeltaDecoration[] = [];
  const tokens = editor.tokenize(content, 'json');

  // Find tokens that should have copy icons and add decorations
  const lines = content.split('\n');

  for (const [index, lineTokens] of tokens.entries()) {
    const lineNumber = index + 1;
    const lineContent = lines[lineNumber - 1];

    for (const [tokenIndex, token] of lineTokens.entries()) {
      if (!shouldShowCopyIcon(token.type)) {
        continue;
      }
      // Calculate the end position of the current token
      const nextToken = lineTokens[tokenIndex + 1];
      const tokenEndOffset = nextToken ? nextToken.offset + 1 : lineContent.length;

      const range = new Range(
        //
        lineNumber,
        tokenEndOffset,
        lineNumber,
        tokenEndOffset + 1
      );
      decorations.push({
        range,
        options: {
          after: {
            content: addedContent,
            inlineClassName: 'copy-button-icon',
          },
        },
      });
    }
  }
  // Apply decorations to the editor
  const decorationCollection = editorInstance.createDecorationsCollection(decorations);

  return { decorations, decorationCollection };
}

export function getOrCreateModel({ uri: $uri, value }: { uri: string; value: string }) {
  const uri = Uri.file($uri);
  const model = editor.getModel(uri);
  const language = uri.path.split('.').at(-1);
  if (!language) {
    throw new Error(`Could not determine file language from path: "${uri.path}"`);
  }
  return model ?? editor.createModel(value, language, uri);
}

editor.defineTheme(MONACO_THEME_NAME.dark, MONACO_THEME_DATA.dark);
editor.defineTheme(MONACO_THEME_NAME.light, MONACO_THEME_DATA.light);

// Define tokens for template variables
languages.setMonarchTokensProvider('plaintext', {
  tokenizer: {
    root: [
      // Template variables: {{variable}}
      [/\{\{([^}]+)}}/, 'template-variable'],
      // Regular text
      [/[^{]+/, 'text'],
      // Single { without closing }
      [/\{/, 'text'],
    ],
  },
});

languages.json.jsonDefaults.setDiagnosticsOptions({
  // Fixes when `$schema` is `https://json-schema.org/draft/2020-12/schema`
  // The schema uses meta-schema features ($dynamicRef) that are not yet supported by the validator
  schemas: [
    {
      // Configure JSON language service with Monaco-compatible schema
      uri: 'https://json-schema.org/draft/2020-12/schema',
      fileMatch: ['*.json'],
      schema: monacoCompatibleSchema,
    },
  ],
  enableSchemaRequest: true,
});

export function createEditor(
  domElement: HTMLDivElement,
  options: editor.IStandaloneEditorConstructionOptions
): editor.IStandaloneCodeEditor {
  const { model } = options;
  if (!model) {
    throw new Error('options.model is required');
  }
  const language = model.uri.path.split('.').at(-1);
  if (!language) {
    throw new Error(`Could not determine file language from path: "${model.uri.path}"`);
  }
  return editor.create(domElement, {
    language,
    automaticLayout: true,
    minimap: { enabled: false }, // disable the minimap
    overviewRulerLanes: 0, // remove unnecessary error highlight on the scroll
    scrollBeyondLastLine: false, // cleans up unnecessary "padding-bottom" on each editor
    lineNumbers: 'off',
    wordWrap: 'on', // Toggle word wrap on resizing editors
    contextmenu: false, // Disable the right-click context menu
    fontSize: 12,
    fixedOverflowWidgets: true, // since container has overflow-hidden
    padding: {
      top: 12,
      bottom: 12,
    },
    scrollbar: {
      vertical: 'hidden', // Hide vertical scrollbar
      horizontal: 'hidden', // Hide horizontal scrollbar
      useShadows: false, // Disable shadow effects
      alwaysConsumeMouseWheel: false, // Monaco grabs the mouse wheel by default
    },
    stickyScroll: { enabled: false }, // Disable sticky scroll widget
    tabSize: 2,
    // scrollbar: {
    //   verticalScrollbarSize: 10,
    // },
    ...options,
  });
}

/**
 * Cleanup various monaco-editor disposables functions
 */
export function cleanupDisposables(disposables: IDisposable[]) {
  return () => {
    for (const disposable of disposables) {
      disposable.dispose(); // remove the listener
    }
  };
}
