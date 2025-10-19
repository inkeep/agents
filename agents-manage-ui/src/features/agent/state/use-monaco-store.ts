import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type * as Monaco from 'monaco-editor';
import { MONACO_THEME_DATA, MONACO_THEME_NAME } from '@/constants/theme';
import monacoCompatibleSchema from '@/lib/monaco-editor/dynamic-ref-compatible-json-schema.json';

interface MonacoStateData {
  monaco: typeof Monaco;
  variableSuggestions: string[];
}

interface MonacoActions {
  initialize: () => Monaco.IDisposable[];
  setMonacoTheme: (isDark: boolean) => void;
  setMonaco: (monaco: typeof Monaco) => void;
  setVariableSuggestions: (variableSuggestions: string[]) => void;
}

type MonacoState = MonacoStateData & {
  actions: MonacoActions;
};

const initialMonacoState: MonacoStateData = {
  monaco: null!,
  variableSuggestions: [],
};

// Reserved keys that are always valid
const RESERVED_KEYS = new Set(['$time', '$date', '$timestamp', '$now']);

export const monacoStore = create<MonacoState>()(
  devtools((set, get) => ({
    ...initialMonacoState,
    // Separate "namespace" for actions
    actions: {
      setMonacoTheme(isDark) {
        const { editor } = get().monaco;
        const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
        editor.setTheme(monacoTheme);
      },
      initialize() {
        const { editor, languages, Range } = get().monaco;

        editor.defineTheme(MONACO_THEME_NAME.dark, MONACO_THEME_DATA.dark);
        editor.defineTheme(MONACO_THEME_NAME.light, MONACO_THEME_DATA.light);

        languages.json.jsonDefaults.setDiagnosticsOptions({
          // Fixes when `$schema` is `https://json-schema.org/draft/2020-12/schema`
          // The schema uses meta-schema features ($dynamicRef) that are not yet supported by the validator
          schemas: [
            {
              // Configure JSON language service with Monaco-compatible schema
              uri: 'https://json-schema.org/draft/2020-12/schema',
              fileMatch: ['json-schema-*.json'],
              schema: monacoCompatibleSchema,
            },
          ],
          enableSchemaRequest: true,
        });

        return [
          // Define tokens for template variables
          languages.setMonarchTokensProvider('plaintext', {
            tokenizer: {
              root: [
                // Template variables: {{variable}}
                [/\{\{([^}]+)}}/, 'template-variable'],
                // Regular text
                [/[^{]+/, 'text'],
                // Single { without closing }
                [/\{/, 'text'],
              ],
            },
          }),
          languages.registerCompletionItemProvider('plaintext', {
            triggerCharacters: ['{'],
            provideCompletionItems(model, position) {
              const { variableSuggestions } = get();

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
              const filteredSuggestions = variableSuggestions.filter((suggestion) =>
                suggestion.toLowerCase().includes(query)
              );

              const word = model.getWordUntilPosition(position);
              const range = new Range(
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
                  kind: languages.CompletionItemKind.Module,
                  range,
                  insertText: `{${item.label}}}`,
                  ...item,
                })),
              };
            },
          }),
        ];
      },
    },
  }))
);

/**
 * Actions are functions that update values in your store.
 * These are static and do not change between renders.
 *
 * @see https://tkdodo.eu/blog/working-with-zustand#separate-actions-from-state
 */
export const useMonacoActions = () => monacoStore((state) => state.actions);

/**
 * Select values from the store (excluding actions).
 *
 * We explicitly use `MonacoStateData` instead of `MonacoState`,
 * which includes actions, to encourage using `useMonacoStore`
 * when accessing or calling actions.
 */
export function useMonacoStore<T>(selector: (state: MonacoStateData) => T): T {
  return monacoStore(useShallow(selector));
}
