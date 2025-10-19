'use client';

import dynamic from 'next/dynamic';
import {
  type ComponentProps,
  type FC,
  useCallback,
  useId,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import type { IDisposable } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

/**
 * Purpose: Prevent Monaco from being loaded on the server since it access to `window` object.
 **/
export const MonacoEditor = dynamic(
  () => import('./monaco-editor').then((mod) => mod.MonacoEditor),
  { ssr: false } // ensures it only loads on the client side
);

// Reserved keys that are always valid
const RESERVED_KEYS = new Set(['$time', '$date', '$timestamp', '$now']);

function tryJsonParse(json = ''): object {
  if (!json.trim()) {
    return {};
  }
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.plaintext`;
}

// Global flag to ensure provider is registered only once
let isProviderRegistered = false;

export const PromptEditor: FC<PromptEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.plaintext` as `${string}.plaintext`, [id]);

  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const [monaco, setMonaco] = useState<typeof Monaco>();
  const contextConfig = useAgentStore((state) => state.metadata.contextConfig);
  const suggestionsRef = useRef<string[]>([]);

  // Generate suggestions from context config
  useEffect(() => {
    const contextVariables = tryJsonParse(contextConfig.contextVariables);
    const headersSchema = tryJsonParse(contextConfig.headersSchema);
    suggestionsRef.current = getContextSuggestions({
      headersSchema,
      // @ts-expect-error -- todo: improve type
      contextVariables,
    });
  }, [contextConfig]);

  useEffect(() => {
    const model = editor?.getModel();
    if (!monaco || !editor || !model) {
      return;
    }

    // Function to validate template variables and set markers
    const validateTemplateVariables = () => {
      const validVariables = new Set(suggestionsRef.current);
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

    // Register completion provider only once globally
    if (!isProviderRegistered) {
      isProviderRegistered = true;
      disposables.push(
        monaco.languages.registerCompletionItemProvider('plaintext', {
          triggerCharacters: ['{'],
          provideCompletionItems(model, position) {
            const textUntilPosition = model.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            console.log('Completion triggered:', { textUntilPosition, position });

            // Check if we're inside a template variable (after {)
            const match = textUntilPosition.match(/\{([^}]*)$/);
            if (!match) {
              console.log('No template variable match found');
              return { suggestions: [] };
            }

            console.log('Template variable match:', match);

            const query = match[1].toLowerCase();
            const filteredSuggestions = suggestionsRef.current.filter((suggestion) =>
              suggestion.toLowerCase().includes(query)
            );

            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn
            );

            const completionItems: Omit<
              Monaco.languages.CompletionItem,
              'kind' | 'range' | 'insertText'
            >[] = [
              // Add context suggestions
              ...filteredSuggestions.map((label) => ({
                label,
                detail: 'Context variable',
                sortText: '0',
              })),
              // Add reserved keys
              ...Array.from(RESERVED_KEYS).map((label) => ({
                label,
                detail: 'Reserved variable',
                sortText: '1',
              })),
              // Add environment variables
              {
                label: '$env.',
                detail: 'Environment variable',
                sortText: '2',
              },
            ];
            return {
              suggestions: completionItems.map((item) => ({
                kind: monaco.languages.CompletionItemKind.Module,
                range,
                insertText: `{${item.label}}}`,
                ...item,
              })),
            };
          },
        })
      );
    }

    // Add model change listener to trigger validation for this specific editor
    disposables.push(model.onDidChangeContent(validateTemplateVariables));
    // Initial validation
    validateTemplateVariables();

    editor.updateOptions({
      autoClosingBrackets: 'never',
      renderLineHighlight: 'none', // disable active line highlight
    });

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      // Note: We don't dispose the global completion provider here
      // as it's shared across all PromptEditor instances
    };
  }, [editor, monaco]);

  const handleOnMount: NonNullable<ComponentProps<typeof MonacoEditor>['onMount']> = useCallback(
    (editorInstance, monaco) => {
      setEditor(editorInstance);
      setMonaco(monaco);
    },
    []
  );

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
