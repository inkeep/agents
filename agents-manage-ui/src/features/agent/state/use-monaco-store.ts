import type * as Monaco from 'monaco-editor';
import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { MONACO_THEME_NAME, TEMPLATE_LANGUAGE, VARIABLE_TOKEN } from '@/constants/theme';
import { agentStore } from '@/features/agent/state/use-agent-store';

interface MonacoStateData {
  monaco: typeof Monaco | null;
}

interface MonacoActions {
  /**
   * Dynamically import `monaco-editor` since it relies on `window`, which isn't available during SSR
   */
  setMonaco: () => Promise<void>;
}

interface MonacoState extends MonacoStateData {
  actions: MonacoActions;
}

let wasInitialized = false;

const monacoState: StateCreator<MonacoState> = (set, _get) => ({
  monaco: null,
  // Separate "namespace" for actions
  actions: {
    async setMonaco() {
      if (wasInitialized) {
        return;
      }
      wasInitialized = true;
      const [
        monaco,
        { createHighlighter },
        { shikiToMonaco },
        { default: monacoCompatibleSchema },
        { default: githubLightTheme },
        { default: githubDarkTheme },
      ] = await Promise.all([
        import('monaco-editor'),
        import('shiki'),
        import('@shikijs/monaco'),
        import('@/lib/monaco-editor/dynamic-ref-compatible-json-schema.json', {
          with: {
            type: 'json',
          },
        }),
        import('shiki/themes/github-light-default.mjs'),
        import('shiki/themes/github-dark-default.mjs'),
        import('@/lib/monaco-editor/setup-monaco-workers'),
      ]);
      monaco.languages.register({ id: TEMPLATE_LANGUAGE });
      monaco.json.jsonDefaults.setDiagnosticsOptions({
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
      monaco.json.jsonDefaults.setModeConfiguration({
        /**
         * Disable due to an issue where the `json` language is not highlighted correctly.
         * @see https://github.com/shikijs/shiki/issues/865
         */
        tokens: false,
      });

      // Define tokens for template variables
      monaco.languages.setMonarchTokensProvider(TEMPLATE_LANGUAGE, {
        tokenizer: {
          root: [[/\{\{([^}]+)}}/, VARIABLE_TOKEN]],
        },
      });
      monaco.languages.registerCompletionItemProvider(TEMPLATE_LANGUAGE, {
        triggerCharacters: ['{'],
        provideCompletionItems(model, position) {
          const { variableSuggestions } = agentStore.getState();

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
      });
      /**
       * Create the highlighter
       * @see https://shiki.style/packages/monaco#usage
       */
      const highlighter = await createHighlighter({
        themes: [
          {
            ...githubLightTheme,
            name: MONACO_THEME_NAME.light,
            colors: {
              ...githubLightTheme.colors,
              'editor.background': 'transparent',
              'diffEditor.insertedLineBackground': '#3784ff0d',
              'diffEditor.insertedTextBackground': '#3784ff19',
              'scrollbarSlider.activeBackground': '#aaa5',
              'scrollbarSlider.background': '#ccc5',
              'scrollbarSlider.hoverBackground': '#bbb5',
            },
          },
          {
            ...githubDarkTheme,
            name: MONACO_THEME_NAME.dark,
            colors: {
              ...githubDarkTheme.colors,
              'editor.background': 'transparent',
              'diffEditor.insertedLineBackground': '#69a3ff33',
              'diffEditor.insertedTextBackground': '#69a3ff4d',
              'scrollbarSlider.activeBackground': '#ccc5',
              'scrollbarSlider.background': '#aaa5',
              'scrollbarSlider.hoverBackground': '#bbb5',
            },
          },
        ],
        langs: ['javascript', 'typescript', 'json'],
      });
      // Register the themes from Shiki, and provide syntax highlighting for Monaco
      shikiToMonaco(highlighter, monaco);
      // for cypress
      window.monaco = monaco;
      set({ monaco });
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
