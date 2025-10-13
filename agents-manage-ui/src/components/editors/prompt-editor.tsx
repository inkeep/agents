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
    if (!monaco || !editor) {
      return;
    }
    const disposables: IDisposable[] = [
      // Register completion provider for template variables
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
          const start = '{';
          const end = '}';

          const kind = monaco.languages.CompletionItemKind.Module;

          const completionItems: Monaco.languages.CompletionItem[] = [
            // Add context suggestions
            ...filteredSuggestions.map((label) => ({
              kind,
              range,
              label,
              detail: 'Context variable',
              insertText: `${start}${label}${end}`,
              sortText: '0',
            })),
            // Add reserved keys
            ...Array.from(RESERVED_KEYS).map((label) => ({
              kind,
              range,
              label,
              detail: 'Reserved variable',
              insertText: `${start}${label}${end}`,
              sortText: '1',
            })),
            // Add environment variables
            {
              kind,
              range,
              label: '$env.',
              detail: 'Environment variable',
              insertText: `${start}$env.${end}`,
              sortText: '2',
            },
          ];
          return { suggestions: completionItems };
        },
      }),
    ];

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [editor, monaco]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editorInstance, monaco) => {
      setEditor(editorInstance);
      setMonaco(monaco);
    },
    []
  );

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
