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
  uri?: `${string}.template`;
}

export const PromptEditor: FC<PromptEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.template` as `${string}.template`, [id]);

  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();
  const [monaco, setMonaco] = useState<typeof import('monaco-editor')>();
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

    const disposables = [
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

          // Check if we're inside a template variable
          const match = textUntilPosition.match(/\{\{([^}]*)$/);
          if (!match) {
            console.log('No template variable match found');
            // Test: always return a suggestion to see if popup works
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            };
            return {
              suggestions: [
                {
                  label: 'test-suggestion',
                  kind: monaco.languages.CompletionItemKind.Text,
                  insertText: 'test-suggestion',
                  range,
                  documentation: 'Test suggestion',
                  sortText: '0',
                },
              ],
            };
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

          const completionItems: monaco.languages.CompletionItem[] = [
            // Add environment variables
            {
              label: '$env.',
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: '$env.',
              documentation: 'Environment variable',
              sortText: '0',
              range,
            },
            // Add reserved keys
            ...Array.from(RESERVED_KEYS).map((key) => ({
              label: key,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: key,
              documentation: `Reserved variable: ${key}`,
              sortText: '1',
              range,
            })),
            // Add context suggestions
            ...filteredSuggestions.map((suggestion) => ({
              label: suggestion,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: suggestion,
              documentation: `Context variable: ${suggestion}`,
              sortText: '2',
              range,
            })),
          ];

          console.log('Returning completion items:', completionItems);
          return { suggestions: completionItems };
        },
      }),
      // Add keybinding to trigger suggestions manually
      editor.addAction({
        id: 'trigger-suggestions',
        label: 'Trigger Suggestions',
        keybindings: [monaco.KeyCode.F1], // F1 key
        run() {
          console.log('Manually triggering suggestions');
          editor.trigger('trigger-suggestions', 'editor.action.triggerSuggest', {});
        },
      }),
      // Add auto-closing for { character
      // editor.addAction({
      //   id: 'auto-close-brace',
      //   label: 'Auto Close Brace',
      //   keybindings: [monaco.KeyCode.US_OPEN_BRACKET], // { key
      //   run: (editorInstance) => {
      //     const position = editorInstance.getPosition();
      //     if (!position) return;
      //
      //     const model = editorInstance.getModel();
      //     if (!model) return;
      //
      //     const textBeforeCursor = model.getValueInRange({
      //       startLineNumber: position.lineNumber,
      //       startColumn: 1,
      //       endLineNumber: position.lineNumber,
      //       endColumn: position.column,
      //     });
      //
      //     // Check if we just typed a single {
      //     if (textBeforeCursor.endsWith('{')) {
      //       editorInstance.executeEdits('auto-close-brace', [
      //         {
      //           range: {
      //             startLineNumber: position.lineNumber,
      //             startColumn: position.column,
      //             endLineNumber: position.lineNumber,
      //             endColumn: position.column,
      //           },
      //           text: '}',
      //           forceMoveMarkers: true,
      //         },
      //       ]);
      //       // Move cursor back between the braces
      //       editorInstance.setPosition({
      //         lineNumber: position.lineNumber,
      //         column: position.column,
      //       });
      //     }
      //   },
      // }),
    ];

    // Configure editor to show suggestions
    editor.updateOptions({
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
    });

    console.log('Completion provider registered for plaintext language');

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [suggestions]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editorInstance, monaco) => {
      setEditor(editorInstance);
      setMonaco(monaco);
    },
    [suggestions]
  );


  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
