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
} from 'react';
import type * as monaco from 'monaco-editor';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

/**
 * Purpose:
 * Prevent Monaco from being loaded on the server since it access to `window` object
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

  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();
  const contextConfig = useAgentStore((state) => state.metadata.contextConfig);

  // Generate suggestions from context config
  const suggestions = useMemo(() => {
    const contextVariables = tryJsonParse(contextConfig.contextVariables);
    const headersSchema = tryJsonParse(contextConfig.headersSchema);
    return getContextSuggestions({
      headersSchema,
      // @ts-expect-error -- todo: improve type
      contextVariables,
    });
  }, [contextConfig]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editorInstance, { languages }) => {
      setEditor(editorInstance);

      // Register completion provider for template variables
      const completionProvider = languages.registerCompletionItemProvider('plaintext', {
        provideCompletionItems(model, position) {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Check if we're inside a template variable
          const match = textUntilPosition.match(/\{\{([^}]*)$/);
          if (!match) {
            return { suggestions: [] };
          }

          const query = match[1].toLowerCase();
          const filteredSuggestions = suggestions.filter((s) => s.toLowerCase().includes(query));

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };

          const completionItems: monaco.languages.CompletionItem[] = [
            // Add environment variables
            {
              label: '$env.',
              kind: languages.CompletionItemKind.Variable,
              insertText: '$env.',
              documentation: 'Environment variable',
              sortText: '0',
              range,
            },
            // Add reserved keys
            ...Array.from(RESERVED_KEYS).map((key) => ({
              label: key,
              kind: languages.CompletionItemKind.Keyword,
              insertText: key,
              documentation: `Reserved variable: ${key}`,
              sortText: '1',
              range,
            })),
            // Add context suggestions
            ...filteredSuggestions.map((suggestion) => ({
              label: suggestion,
              kind: languages.CompletionItemKind.Variable,
              insertText: suggestion,
              documentation: `Context variable: ${suggestion}`,
              sortText: '2',
              range,
            })),
          ];

          return { suggestions: completionItems };
        },
      });

      // Store the provider for cleanup
      (editorInstance as any)._completionProvider = completionProvider;
    },
    [suggestions]
  );

  // Cleanup completion provider when component unmounts
  useEffect(() => {
    return () => {
      if (editor && (editor as any)._completionProvider) {
        (editor as any)._completionProvider.dispose();
      }
    };
  }, [editor]);

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
