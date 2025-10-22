'use client';

import { type ComponentProps, type FC, useCallback, useId, useState, useEffect } from 'react';
import type { IDisposable } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { MonacoEditor } from './monaco-editor';
import {
  monacoStore,
  useMonacoStore,
  RESERVED_KEYS,
} from '@/features/agent/state/use-monaco-store';
import { cleanupDisposables } from '@/lib/monaco-editor/monaco-utils';

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.template`;
}

export const PromptEditor: FC<PromptEditorProps> = ({ uri, editorOptions, onMount, ...props }) => {
  const id = useId();
  uri ??= `${id}.template`;

  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const monaco = useMonacoStore((state) => state.monaco);
  useEffect(() => {
    const model = editor?.getModel();
    if (!monaco || !editor || !model) {
      return;
    }

    // Function to validate template variables and set markers
    const validateTemplateVariables = () => {
      const validVariables = new Set(monacoStore.getState().variableSuggestions);
      const regex = /\{\{([^}]+)}}/g;
      const markers: Monaco.editor.IMarkerData[] = [];

      for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
        const line = model.getLineContent(lineNumber);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
          const variableName = match[1];

          // Check if variable is valid (in suggestions) or reserved
          const isValid =
            validVariables.has(variableName) ||
            RESERVED_KEYS.has(variableName) ||
            variableName.startsWith('$env.') ||
            // Exclude arrays from linting, as they are indicated with [*] in the suggestions
            variableName.includes('[') ||
            // JMESPath expressions
            variableName.startsWith('length(');

          if (!isValid) {
            markers.push({
              startLineNumber: lineNumber,
              startColumn: match.index + 3,
              endLineNumber: lineNumber,
              endColumn: match.index + match[0].length - 1,
              message: `Unknown variable: ${variableName}`,
              severity: monaco.MarkerSeverity.Error,
            });
          }
        }
      }

      monaco.editor.setModelMarkers(model, 'template-variables', markers);
    };

    const disposables: IDisposable[] = [];

    // Add model change listener to trigger validation for this specific editor
    disposables.push(model.onDidChangeContent(validateTemplateVariables));
    // Initial validation
    validateTemplateVariables();

    return cleanupDisposables(disposables);
  }, [editor, monaco]);

  const handleOnMount: NonNullable<ComponentProps<typeof MonacoEditor>['onMount']> = useCallback(
    (editorInstance) => {
      setEditor(editorInstance);
      onMount?.(editorInstance);
    },
    [onMount]
  );

  return (
    <MonacoEditor
      uri={uri}
      onMount={handleOnMount}
      editorOptions={{
        autoClosingBrackets: 'never',
        renderLineHighlight: 'none', // disable active line highlight
        ...editorOptions,
      }}
      {...props}
    />
  );
};
