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

  useEffect(() => {
    if (!monaco || !editor) {
      return;
    }
    const variableNames = ['name', 'email', 'company', 'date'];

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
          const filteredSuggestions = suggestions.filter((s) => s.toLowerCase().includes(query));

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };

          // Check if we need to auto-close with }}
          const lineText = model.getLineContent(position.lineNumber);
          const nextChar = lineText[position.column - 1];
          const needsClosing = nextChar !== '}';

          const completionItems: Monaco.languages.CompletionItem[] = [
            // Add context suggestions
            ...filteredSuggestions.map((suggestion) => ({
              label: suggestion,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: `${suggestion}${needsClosing ? '}}' : '}'}`,
              detail: `Context variable: ${suggestion}`,
              sortText: '0',
              range,
            })),
            // Add reserved keys
            ...Array.from(RESERVED_KEYS).map((key) => ({
              label: key,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: `${key}${needsClosing ? '}}' : '}'}`,
              detail: `Reserved variable: ${key}`,
              sortText: '1',
              range,
            })),
            // Add environment variables
            {
              label: '$env.',
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: `$env.${needsClosing ? '}}' : '}'}`,
              detail: 'Environment variable',
              sortText: '2',
              range,
            },
          ];

          console.log('Returning completion items:', completionItems);
          return { suggestions: completionItems };
        },
      }),
      // monaco.languages.registerCompletionItemProvider('plaintext', {
      //   triggerCharacters: ['['],
      //   provideCompletionItems(model, position) {
      //     // Look at the two characters immediately before the caret
      //     const startCol = Math.max(1, position.column - 2);
      //
      //     // Replace the just-typed '{{' with the full snippet
      //     const replaceRange = new monaco.Range(
      //       position.lineNumber,
      //       startCol,
      //       position.lineNumber,
      //       position.column
      //     );
      //
      //     // A few opinionated snippets
      //     const baseSnippets = [
      //       {
      //         label: '{{ variable }}',
      //         detail: 'Insert a {{ variable }} placeholder',
      //         insertText: '{{ ${1:variable} }}',
      //       },
      //       {
      //         label: '{{#if condition}}…{{/if}}',
      //         detail: 'Conditional block',
      //         insertText: '{{#if ${1:condition}}}\n  ${2:content}\n{{/if}}',
      //       },
      //       {
      //         label: '{{#each items}}…{{/each}}',
      //         detail: 'Loop block',
      //         insertText: '{{#each ${1:items}}}\n  ${2:content}\n{{/each}}',
      //       },
      //     ];
      //
      //     // Turn variable names into targeted suggestions like `{{ name }}`
      //     const variableSnippets = variableNames.map((v) => ({
      //       label: `{{ ${v} }}`,
      //       detail: `Insert {{ ${v} }}`,
      //       insertText: `{{ ${v} }}`,
      //     }));
      //
      //     const suggestions = [...variableSnippets, ...baseSnippets].map((s) => ({
      //       label: s.label,
      //       kind: monaco.languages.CompletionItemKind.Snippet,
      //       detail: s.detail,
      //       range: replaceRange,
      //       insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      //       insertText: s.insertText,
      //     }));
      //
      //     return { suggestions };
      //   },
      // }),
    ];

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [editor, monaco, suggestions]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editorInstance, monaco) => {
      setEditor(editorInstance);
      setMonaco(monaco);
    },
    []
  );

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
