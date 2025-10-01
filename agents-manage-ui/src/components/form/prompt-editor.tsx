import { type FC, type RefObject, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { autocompletion, type CompletionSource, startCompletion } from '@codemirror/autocomplete';
import { Decoration, ViewPlugin, EditorView, type DecorationSet } from '@codemirror/view';
import { duotoneDark, duotoneLight } from '@uiw/codemirror-theme-duotone';
import CodeMirror, {
  type ReactCodeMirrorProps,
  type Range,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useGraphStore } from '@/features/graph/state/use-graph-store';

// Decoration for template variables
const templateVariableDecoration = Decoration.mark({
  class: 'cm-template-variable',
});

// Plugin to highlight template variables
const templateVariablePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: Range<Decoration>[] = [];
      const regex = /\{\{([^}]+)}}/g;

      for (let i = 0; i < view.state.doc.lines; i++) {
        const line = view.state.doc.line(i + 1);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line.text)) !== null) {
          const from = line.from + match.index;
          const to = line.from + match.index + match[0].length;
          decorations.push(templateVariableDecoration.range(from, to));
        }
      }

      return Decoration.set(decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Theme for template variables
const templateVariableTheme = EditorView.theme({
  '& .cm-template-variable': {
    color: '#e67e22', // Orange color for variables
    fontWeight: 'bold',
  },
  '&.cm-dark .cm-template-variable': {
    color: '#f39c12', // Lighter orange for dark theme
  },
});

// Create autocomplete source for context variables
function createContextAutocompleteSource(suggestions: string[]): CompletionSource {
  return (context) => {
    const { state, pos } = context;
    const line = state.doc.lineAt(pos);
    const textBefore = line.text.slice(0, pos - line.from);

    // Check if we're after a { character
    const match = textBefore.match(/\{([^}]*)$/);
    if (!match) return null;

    const query = match[1].toLowerCase();
    const filteredSuggestions = suggestions.filter((s) => s.toLowerCase().includes(query));

    return {
      from: pos - match[1].length,
      to: pos,
      options: filteredSuggestions.map((suggestion) => ({
        label: suggestion,
        apply: `{${suggestion}}`,
      })),
    };
  };
}

export interface TextareaWithSuggestionsProps extends Omit<ReactCodeMirrorProps, 'onChange'> {
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  ref?: RefObject<{ insertTemplateVariable: () => void }>;
}

function tryJsonParse(json: string): object {
  if (!json.trim()) {
    return {};
  }
  try {
    return JSON.parse(json);
  } catch {}
  return {};
}

export const PromptEditor: FC<TextareaWithSuggestionsProps> = ({
  className,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  ref,
  ...rest
}) => {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  useEffect(() => {
    editorRef.current = new EditorView();
  }, []);

  useImperativeHandle(ref, () => ({
    insertTemplateVariable() {
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }
      const { doc, selection } = view.state;
      // If there's a caret, insert at caret; otherwise, fall back to end of the current line.
      const insertPos = selection.main.empty ? selection.main.head : doc.line(doc.lines).to;
      // Insert "{}" and put the cursor between
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: '{}' },
        selection: { anchor: insertPos + 1 },
        scrollIntoView: true,
      });
      startCompletion(view);
    },
  }));

  const contextConfig = useGraphStore((state) => state.metadata.contextConfig);

  const extensions = useMemo(() => {
    const contextVariables = tryJsonParse(contextConfig.contextVariables);
    const requestContextSchema = tryJsonParse(contextConfig.requestContextSchema);
    const suggestions = getContextSuggestions({
      // @ts-expect-error -- todo: improve type
      requestContextSchema,
      // @ts-expect-error -- todo: improve type
      contextVariables,
    });
    return [
      autocompletion({
        override: [createContextAutocompleteSource(suggestions)],
      }),
      templateVariablePlugin,
      templateVariableTheme,
    ];
  }, [contextConfig]);

  return (
    <CodeMirror
      ref={editorRef}
      {...rest}
      value={value || ''}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? duotoneDark : duotoneLight}
      placeholder={placeholder}
      editable={!disabled && !readOnly}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      data-disabled={disabled ? '' : undefined}
      data-read-only={readOnly ? '' : undefined}
      className={cn(
        'h-full [&>.cm-editor]:max-h-[inherit] [&>.cm-editor]:!bg-transparent dark:[&>.cm-editor]:!bg-input/30 [&>.cm-editor]:!outline-none [&>.cm-editor]:rounded-[7px] [&>.cm-editor]:px-3 [&>.cm-editor]:py-2 leading-2 text-xs font-mono rounded-md border border-input shadow-xs transition-[color,box-shadow] data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:bg-muted data-invalid:border-destructive has-[.cm-focused]:border-ring has-[.cm-focused]:ring-ring/50 has-[.cm-focused]:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
    />
  );
};
