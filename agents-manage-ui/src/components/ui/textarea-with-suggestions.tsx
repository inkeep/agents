import { type FC, useMemo } from 'react';
import { autocompletion, completionKeymap, type CompletionSource } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { duotoneDark, duotoneLight } from '@uiw/codemirror-theme-duotone';
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useGraphStore } from '@/features/graph/state/use-graph-store';

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

export interface TextareaWithSuggestionsProps
  extends Omit<ReactCodeMirrorProps, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export const TextareaWithSuggestions: FC<TextareaWithSuggestionsProps> = ({
  className,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  ...rest
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const contextConfig = useGraphStore((state) => state.metadata.contextConfig);

  const extensions = useMemo(() => {
    const contextVariables = JSON.parse(contextConfig.contextVariables || '{}');
    const requestContextSchema = JSON.parse(contextConfig.requestContextSchema || '{}');
    const suggestions = getContextSuggestions({ requestContextSchema, contextVariables });
    return [
      autocompletion({
        override: [createContextAutocompleteSource(suggestions)],
      }),
      keymap.of(completionKeymap),
    ];
  }, [contextConfig]);

  return (
    <CodeMirror
      {...rest}
      value={value || ''}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? duotoneDark : duotoneLight}
      placeholder={placeholder || 'Try typing: {{req'}
      editable={!disabled && !readOnly}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        // dropCursor: false,
        // allowMultipleSelections: false,
        // bracketMatching: true,
        // closeBrackets: true,
        // autocompletion: true,
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
