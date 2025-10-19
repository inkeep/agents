/**
 * Re‑export Monaco Editor exports.
 * Importing directly from 'monaco-editor' causes a “window is not defined” error during SSR.
 */
import { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';
import { URI as Uri } from 'monaco-editor/esm/vs/base/common/uri.js';
import type { editor, IDisposable } from 'monaco-editor';

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

export function addDecorations({
  monacoEditor,
  editorInstance,
  content,
  addedContent = ' #',
}: {
  monacoEditor: typeof editor;
  editorInstance: editor.IStandaloneCodeEditor;
  content: string;
  addedContent?: string;
}): {
  decorations: editor.IModelDeltaDecoration[];
  decorationCollection: editor.IEditorDecorationsCollection;
} {
  // Add decorations for copy icons after primitive values
  const decorations: editor.IModelDeltaDecoration[] = [];
  const tokens = monacoEditor.tokenize(content, 'json');

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

export { Uri, Range };
