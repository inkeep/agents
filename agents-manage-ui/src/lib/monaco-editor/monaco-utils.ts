import type * as Monaco from 'monaco-editor';

// Function to check if a token should show a copy icon
function shouldShowCopyIcon(tokenType: string): boolean {
  switch (tokenType) {
    case 'string.value.json':
    case 'number.json':
    case 'keyword.json':
    case 'string':
      return true;
  }
  return false;
}

export function addDecorations({
  monaco,
  editorInstance,
  content,
  addedContent = ' #',
}: {
  monaco: typeof Monaco;
  editorInstance: Monaco.editor.IStandaloneCodeEditor;
  content: string;
  addedContent?: string;
}): {
  decorations: Monaco.editor.IModelDeltaDecoration[];
  decorationCollection: Monaco.editor.IEditorDecorationsCollection;
} {
  // Add decorations for copy icons after primitive values
  const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
  const tokens = monaco.editor.tokenize(content, 'json');

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

      const range = new monaco.Range(
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

export function getOrCreateModel({
  uri: $uri,
  value,
  monaco,
}: {
  uri: string;
  value: string;
  monaco: typeof Monaco;
}): { model: Monaco.editor.ITextModel; language: string } {
  const uri = monaco.Uri.file($uri);
  let language = uri.path.split('.').at(-1);
  if (!language) {
    throw new Error(`Could not determine file language from path: "${uri.path}"`);
  }
  switch (language) {
    case 'js':
    case 'jsx':
      language = 'javascript';
      break;
    case 'ts':
    case 'tsx':
      language = 'typescript';
      break;
  }
  const model = monaco.editor.getModel(uri);
  return {
    language,
    model: model ?? monaco.editor.createModel(value, language, uri),
  };
}

/**
 * Cleanup various monaco-editor disposables functions
 */
export function cleanupDisposables(disposables: Monaco.IDisposable[]) {
  return () => {
    for (const disposable of disposables) {
      disposable.dispose(); // remove the listener
    }
  };
}
