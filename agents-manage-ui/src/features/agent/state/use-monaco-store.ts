import type * as Monaco from 'monaco-editor';
import { toast } from 'sonner';
import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import {
  INKEEP_BRAND_COLOR,
  MONACO_THEME_NAME,
  TEMPLATE_LANGUAGE,
  TEMPLATE_VARIABLE_REGEX,
  VARIABLE_TOKEN,
} from '@/constants/theme';
import { agentStore } from '@/features/agent/state/use-agent-store';

interface MonacoStateData {
  monaco: typeof Monaco | null;
}

interface MonacoActions {
  /**
   * Dynamically import `monaco-editor` since it relies on `window`, which isn't available during SSR
   */
  importMonaco: () => Promise<void>;
  getEditorByUri: (uri: string) => Monaco.editor.ICodeEditor | undefined;
}

interface MonacoState extends MonacoStateData {
  actions: MonacoActions;
}

let wasInitialized = false;

async function formatJS(value: string): Promise<string> {
  const [{ default: prettier }, { default: parserBabel }, { default: parserEstree }] =
    await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
    ]);

  const formatted = await prettier.format(value, {
    parser: 'babel',
    plugins: [parserBabel, parserEstree],
  });
  return formatted.trimEnd();
}
async function formatMarkdown(value: string): Promise<string> {
  const [{ default: prettier }, { default: parserMarkdown }] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/markdown'),
  ]);

  const formatted = await prettier.format(value, {
    parser: 'mdx',
    plugins: [parserMarkdown],
  });
  return formatted.trimEnd();
}

function provideDocumentFormattingEdits(
  formatter: typeof formatJS
): Monaco.languages.DocumentFormattingEditProvider['provideDocumentFormattingEdits'] {
  return async (model) => {
    let text = model.getValue();
    try {
      text = await formatter(text);
    } catch (error) {
      toast.error(`Could not format: ${error instanceof Error ? error.message : 'invalid syntax'}`);
    }
    return [{ text, range: model.getFullModelRange() }];
  };
}

const monacoState: StateCreator<MonacoState> = (set, get) => ({
  monaco: null,
  actions: {
    getEditorByUri(uri) {
      const { monaco } = get();
      if (!monaco) {
        return;
      }
      const model = monaco.editor.getModel(monaco.Uri.file(uri));
      return monaco.editor.getEditors().find((editor) => editor.getModel() === model);
    },
    async importMonaco() {
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
        { default: markdownShikiLangs },
      ] = await Promise.all([
        import('monaco-editor'),
        import('shiki'),
        import('@shikijs/monaco'),
        import('@/lib/monaco-editor/dynamic-ref-compatible-json-schema.json'),
        import('shiki/themes/github-light-default.mjs'),
        import('shiki/themes/github-dark-default.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('@/lib/monaco-editor/setup-monaco-workers'),
      ]);
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
        /** Highlight diagnostics errors */
        diagnostics: true,
        /**
         * Disable due to an issue where the `json` language is not highlighted correctly.
         * @see https://github.com/shikijs/shiki/issues/865
         */
        tokens: false,
        /** Enable formatting of the entire document */
        documentFormattingEdits: true,
        /** Enable formatting of only a selected range */
        documentRangeFormattingEdits: true,
      });

      // Setup formatters
      monaco.languages.registerDocumentFormattingEditProvider('javascript', {
        provideDocumentFormattingEdits: provideDocumentFormattingEdits(formatJS),
      });
      monaco.languages.registerDocumentFormattingEditProvider(['markdown', TEMPLATE_LANGUAGE], {
        provideDocumentFormattingEdits: provideDocumentFormattingEdits(formatMarkdown),
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
      const token = `${VARIABLE_TOKEN}.${TEMPLATE_LANGUAGE}`;
      const [markdownShikiGrammar] = markdownShikiLangs;

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
              'diffEditor.insertedLineBackground': `${INKEEP_BRAND_COLOR}0d`,
              'diffEditor.insertedTextBackground': `${INKEEP_BRAND_COLOR}19`,
              'editorHoverWidget.background': '#fff',
            },
            tokenColors: [
              {
                scope: token,
                settings: { foreground: '#e67e22', fontStyle: 'bold' },
              },
              ...(githubLightTheme.tokenColors || []),
            ],
          },
          {
            ...githubDarkTheme,
            name: MONACO_THEME_NAME.dark,
            colors: {
              ...githubDarkTheme.colors,
              'editor.background': 'transparent',
              'diffEditor.insertedLineBackground': '#69a3ff33',
              'diffEditor.insertedTextBackground': '#69a3ff4d',
              'editorHoverWidget.background': '#141416',
            },
            tokenColors: [
              {
                scope: token,
                settings: { foreground: '#f39c12', fontStyle: 'bold' },
              },
              ...(githubDarkTheme.tokenColors || []),
            ],
          },
        ],
        langs: [
          'javascript',
          'typescript',
          'json',
          'html-derivative',
          'markdown',
          {
            ...markdownShikiGrammar,
            aliases: [],
            displayName: 'Template',
            name: TEMPLATE_LANGUAGE,
            injections: {
              'L:text.html.markdown': {
                patterns: [
                  {
                    // Prioritize bracketed template variables over Markdown link-ref shortcut
                    match: `\\[+\\{*(${TEMPLATE_VARIABLE_REGEX.source})}*\\]+`,
                    captures: { 1: { name: token } },
                  },
                  {
                    // Template variable
                    match: TEMPLATE_VARIABLE_REGEX,
                    name: token,
                  },
                ],
              },
            },
          },
        ],
      });
      monaco.languages.register({ id: TEMPLATE_LANGUAGE });

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
