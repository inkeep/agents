import { shikiToMonaco } from '@shikijs/monaco';
import type * as Monaco from 'monaco-editor';
import { createHighlighter, type HighlighterGeneric } from 'shiki';
import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { MONACO_THEME_NAME, TEMPLATE_LANGUAGE, VARIABLE_TOKEN } from '@/constants/theme';
import monacoCompatibleSchema from '@/lib/monaco-editor/dynamic-ref-compatible-json-schema.json';

type ShikiHighlighter = HighlighterGeneric<any, any>;

interface MonacoStateData {
  monaco: typeof Monaco | null;
  variableSuggestions: string[];
  highlighter: ShikiHighlighter | null;
}

interface MonacoActions {
  setMonacoTheme: (isDark: boolean) => void;
  /**
   * Dynamically import `monaco-editor` since it relies on `window`, which isn't available during SSR
   */
  setMonaco: () => Promise<Monaco.IDisposable[]>;
  setVariableSuggestions: (variableSuggestions: string[]) => void;
  setupHighlighter: (isDark: boolean) => void;
}

interface MonacoState extends MonacoStateData {
  actions: MonacoActions;
}

const initialMonacoState: MonacoStateData = {
  monaco: null,
  variableSuggestions: [],
  highlighter: null,
};

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

// Fixes console warning:
// [Shiki] 10 instances have been created. Shiki is supposed to be used as a singleton, consider refactoring your code
// to cache your highlighter instance; Or call `highlighter.dispose()` to release unused instances.
const getHighlighter = async (): Promise<ShikiHighlighter> => {
  highlighterPromise ??= createHighlighter({
    themes: [MONACO_THEME_NAME.light, MONACO_THEME_NAME.dark],
    langs: ['javascript', 'typescript', 'json'],
  });
  return await highlighterPromise;
};

const monacoState: StateCreator<MonacoState> = (set, get) => ({
  ...initialMonacoState,
  // Separate "namespace" for actions
  actions: {
    setVariableSuggestions(variableSuggestions) {
      set({ variableSuggestions });
    },
    setMonacoTheme(isDark) {
      const monaco = get().monaco;
      const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
      monaco?.editor.setTheme(monacoTheme);
    },
    async setupHighlighter(isDark) {
      const { highlighter: prevHighlighter, monaco, actions } = get();
      const highlighter = prevHighlighter ?? (await getHighlighter());
      // Create the highlighter
      // Register the themes from Shiki, and provide syntax highlighting for Monaco.
      shikiToMonaco(highlighter, monaco);
      actions.setMonacoTheme(isDark);
      if (!prevHighlighter) {
        set({ highlighter });
        highlighterPromise = null;
      }
    },
    async setMonaco() {
      const monaco = await import('monaco-editor');
      // for cypress
      window.monaco = monaco;
      set({ monaco });
      monaco.languages.register({ id: TEMPLATE_LANGUAGE });
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
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
        monaco.languages.setMonarchTokensProvider(TEMPLATE_LANGUAGE, {
          tokenizer: {
            root: [[/\{\{([^}]+)}}/, VARIABLE_TOKEN]],
          },
        }),
        monaco.languages.registerCompletionItemProvider(TEMPLATE_LANGUAGE, {
          triggerCharacters: ['{'],
          provideCompletionItems(model, position) {
            const { variableSuggestions } = get();

            const textUntilPosition = model.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            // Check if we're inside a template variable (after {)
            const match = textUntilPosition.match(/\{([^}]*)$/);
            if (!match) {
              console.log('No template variable match found');
              return { suggestions: [] };
            }

            const query = match[1].toLowerCase();
            const filteredSuggestions = variableSuggestions.filter((suggestion) =>
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
              // Add environment variables
              {
                label: '$env.',
                detail: 'Environment variable',
                sortText: '1',
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
        }),
      ];
    },
  },
});

export const monacoStore = create<MonacoState>()(devtools(monacoState));

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
