'use client';

import type * as Monaco from 'monaco-editor';
import { type ComponentProps, type FC, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TEMPLATE_VARIABLE_REGEX } from '@/constants/theme';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cleanupDisposables } from '@/lib/monaco-editor/monaco-utils';
import { MonacoEditor } from './monaco-editor';

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.${'template' | 'md'}`;
}

export const PromptEditor: FC<PromptEditorProps> = ({
  uri,
  editorOptions,
  onMount,
  children,
  ...props
}) => {
  'use memo';
  const id = useId();

  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const monaco = useMonacoStore((state) => state.monaco);
  useEffect(() => {
    const model = editor?.getModel();
    if (!monaco || !editor || !model) {
      return;
    }

    // Function to validate template variables and set markers
    const validateTemplateVariables = () => {
      const validVariables = new Set(agentStore.getState().variableSuggestions);
      const markers: Monaco.editor.IMarkerData[] = [];

      for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
        const line = model.getLineContent(lineNumber);
        for (const match of line.matchAll(TEMPLATE_VARIABLE_REGEX)) {
          const { variableName } = match.groups as { variableName: string };
          // Check if variable is valid (in suggestions) or reserved env
          const isValid =
            validVariables.has(variableName) ||
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

    const disposables: Monaco.IDisposable[] = [];

    // Add model change listener to trigger validation for this specific editor
    disposables.push(model.onDidChangeContent(validateTemplateVariables));
    // Initial validation
    validateTemplateVariables();

    return cleanupDisposables(disposables);
  }, [editor, monaco]);

  const handleOnMount: ComponentProps<typeof MonacoEditor>['onMount'] = (editorInstance) => {
    setEditor(editorInstance);
    onMount?.(editorInstance);
  };

  return (
    <MonacoEditor
      uri={uri ?? `${id}.template`}
      onMount={handleOnMount}
      editorOptions={{
        autoClosingBrackets: 'never',
        renderLineHighlight: 'none', // disable active line highlight
        ariaLabel: 'Prompt input editor',
        quickSuggestions: false,
        unicodeHighlight: {
          // Disable warnings for – ’ characters
          ambiguousCharacters: false,
        },
        ...editorOptions,
      }}
      {...props}
    >
      <div className="absolute end-2 top-2 flex gap-2 z-1">
        {children}

        {!props.readOnly && (
          <Button
            type="button"
            onClick={() => {
              const formatAction = editor?.getAction('editor.action.formatDocument');
              formatAction?.run();
            }}
            variant="outline"
            size="sm"
            className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
            disabled={!props.value?.trim()}
          >
            Format
          </Button>
        )}
      </div>
    </MonacoEditor>
  );
};
