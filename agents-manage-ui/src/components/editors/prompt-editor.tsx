'use client';

import {
  type ComponentProps,
  type FC,
  useCallback,
  useId,
  useMemo,
  useState,
  useEffect,
} from 'react';
import type { IDisposable } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { MonacoEditor } from './monaco-editor';
import { monacoStore, useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cleanupDisposables } from '@/lib/monaco-editor/monaco-utils';
import { Button } from '@/components/ui/button';
import { Braces } from 'lucide-react';

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.template`;
}

// Reserved keys that are always valid
const RESERVED_KEYS = new Set(['$time', '$date', '$timestamp', '$now']);

export const PromptEditor: FC<PromptEditorProps> = ({ uri, editorOptions, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.template` as `${string}.template`, [id]);

  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const monaco = useMonacoStore((state) => state.monaco);
  const variablesText = 'Add variables';

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
    },
    []
  );

  const handleAddVariable = useCallback(() => {
    if (!editor || !monaco) {
      return;
    }
    const selection = editor.getSelection();
    const pos = selection ? selection.getStartPosition() : editor.getPosition();
    if (!pos) return;

    const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    editor.executeEdits('insert-template-variable', [{ range, text: '{' }]);
    editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
    editor.focus();
    editor.trigger('insert-template-variable', 'editor.action.triggerSuggest', {});
  }, [editor, monaco]);

  return (
    <MonacoEditor
      uri={uri}
      onMount={handleOnMount}
      editorOptions={{
        padding: {
          top: 12,
          bottom: 36,
        },
        autoClosingBrackets: 'never',
        renderLineHighlight: 'none', // disable active line highlight
        ...editorOptions,
      }}
      {...props}
    >
      <Button
        size="sm"
        variant="link"
        className="absolute end-1 bottom-1 z-1 text-xs rounded-sm h-6"
        type="button"
        disabled={!(editor && monaco)}
        onClick={handleAddVariable}
      >
        <Braces className="size-2.5" />
        {variablesText}
      </Button>
    </MonacoEditor>
  );
};
