import { javascript } from '@codemirror/lang-javascript';
import { duotoneDark, duotoneLight } from '@uiw/codemirror-theme-duotone';
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export interface CodeEditorProps extends ReactCodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  language?: 'javascript' | 'jsx' | 'typescript' | 'tsx';
}

export function CodeEditor(props: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const {
    language = 'jsx',
    className,
    value,
    onChange,
    placeholder,
    disabled,
    readOnly,
    ...rest
  } = props;

  const extensions = [
    javascript({
      jsx: language === 'jsx' || language === 'tsx',
      typescript: language === 'typescript' || language === 'tsx',
    }),
  ];

  return (
    <CodeMirror
      {...rest}
      value={value || ''}
      onChange={(value) => onChange(value)}
      extensions={extensions}
      theme={isDark ? duotoneDark : duotoneLight}
      placeholder={placeholder || 'Enter code...'}
      editable={!disabled && !readOnly}
      basicSetup={{
        lineNumbers: false,
        foldGutter: true,
        dropCursor: false,
        allowMultipleSelections: false,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
      }}
      data-disabled={disabled ? '' : undefined}
      data-read-only={readOnly ? '' : undefined}
      className={cn(
        'h-full [&>.cm-editor]:max-h-[inherit] [&_.cm-gutters]:!bg-transparent [&>.cm-editor]:!bg-transparent dark:[&>.cm-editor]:!bg-input/30 [&>.cm-editor]:!outline-none [&>.cm-editor]:rounded-[7px] [&>.cm-editor]:px-3 [&>.cm-editor]:py-2 leading-2 text-xs font-mono rounded-md border border-input shadow-xs transition-[color,box-shadow] data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:bg-muted data-invalid:border-destructive has-[.cm-focused]:border-ring has-[.cm-focused]:ring-ring/50 has-[.cm-focused]:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
    />
  );
}
