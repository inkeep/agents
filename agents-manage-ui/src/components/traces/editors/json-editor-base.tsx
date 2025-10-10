import { type ReactNode, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useTheme } from 'next-themes';
import { type editor, type IDisposable, KeyCode } from 'monaco-editor';
import { toast } from 'sonner';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
} from '@/lib/monaco-utils';
import { MONACO_THEME_NAME } from '@/constants/theme';
import { cn } from '@/lib/utils';
import '@/lib/setup-monaco-workers';

const handleCopyFieldValue = (model: editor.IModel) => async (e: editor.IEditorMouseEvent) => {
  const { element, position } = e.target;
  if (!element?.classList.contains('copy-button-icon') || !position) {
    return;
  }
  e.event.preventDefault();
  const lineContent = model.getLineContent(position.lineNumber);
  const index = lineContent.indexOf(': ');
  const valueToCopy = lineContent
    .slice(index + 2)
    .trim()
    // Remove trailing comma if present
    .replace(/,$/, '')
    // Replace quotes in strings
    .replaceAll(/(^")|("$)/g, '');
  try {
    await navigator.clipboard.writeText(valueToCopy);
    toast.success('Copied to clipboard', {
      description: `Value: ${valueToCopy.length > 50 ? `${valueToCopy.slice(0, 50)}...'` : valueToCopy}`,
    });
  } catch (error) {
    console.error('Failed to copy', error);
    toast.error('Failed to copy to clipboard');
  }
};

export interface JsonEditorRef {
  editor: editor.IStandaloneCodeEditor | null;
}

interface JsonEditorProps {
  value: string;
  uri: `${string}.json`;
  readOnly?: boolean;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export const JsonEditor = forwardRef<JsonEditorRef, JsonEditorProps>(
  ({ value, uri, readOnly, children, className, disabled, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor>(null);
    const onChangeRef = useRef<typeof onChange>(undefined);
    const { resolvedTheme } = useTheme();

    useImperativeHandle(ref, () => ({
      editor: editorRef.current,
    }));

    useEffect(() => {
      editorRef.current?.updateOptions({
        readOnly: readOnly || disabled,
      });
    }, [readOnly, disabled]);

    // Update model when value prop changes
    useEffect(() => {
      const model = editorRef.current?.getModel();
      if (model && model.getValue() !== value) {
        model.setValue(value);
      }
    }, [value]);

    // Keep onChange ref up to date to avoid stale closures in the model's `onDidChangeContent` handler
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const model = getOrCreateModel({ uri, value });
      const monacoTheme =
        resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
      const editorInstance = createEditor(container, {
        theme: monacoTheme,
        model,
        readOnly,
        lineNumbers: 'off',
        wordWrap: 'on', // Toggle word wrap on resizing editors
        contextmenu: false, // Disable the right-click context menu
        fontSize: 12,
        fixedOverflowWidgets: true, // since container has overflow-hidden
        padding: {
          top: 16,
          bottom: 16,
        },
        scrollbar: {
          vertical: 'hidden', // Hide vertical scrollbar
          horizontal: 'hidden', // Hide horizontal scrollbar
          useShadows: false, // Disable shadow effects
          alwaysConsumeMouseWheel: false, // Monaco grabs the mouse wheel by default
        },
      });
      editorRef.current = editorInstance;

      function updateHeight() {
        if (model.isDisposed()) {
          return;
        }
        // Update height based on content
        const contentHeight = editorInstance.getContentHeight();
        if (container) {
          container.style.height = `${contentHeight}px`;
        }
      }
      const disposables: IDisposable[] = [
        model,
        model.onDidChangeContent(() => {
          const currentOnChange = onChangeRef.current; // Always gets the latest onChange
          if (!currentOnChange) {
            return;
          }
          const newValue = model.getValue();
          currentOnChange(newValue); // Calls the current onChange, not a stale one
        }),
        editorInstance,
        editorInstance.onDidContentSizeChange(updateHeight),
        // Disable command palette by overriding the action
        editorInstance.addAction({
          id: 'disable-command-palette',
          label: 'Disable Command Palette',
          keybindings: [KeyCode.F1],
          // Do nothing - this prevents the command palette from opening
          run() {},
        }),
      ];
      if (readOnly) {
        // Wait for Monaco workers to initialize
        const timerId = setTimeout(() => {
          if (model.isDisposed()) {
            return;
          }
          addDecorations(editorInstance, value, ' ');
        }, 1000);

        disposables.push(
          {
            dispose() {
              clearTimeout(timerId);
            },
          },
          editorInstance.onMouseDown(handleCopyFieldValue(model))
        );
      }
      return cleanupDisposables(disposables);
    }, []);

    // h-full
    // [&>.cm-editor]:max-h-[inherit]
    // [&>.cm-editor]:!bg-transparent
    // dark:[&>.cm-editor]:!bg-input/30
    // [&>.cm-editor]:!outline-none
    // [&>.cm-editor]:px-3
    // [&>.cm-editor]:py-2
    // leading-2
    // font-mono
    // rounded-md
    // transition-[color,box-shadow]
    // data-invalid:border-destructive
    // aria-invalid:ring-destructive/20
    // aria-invalid:border-destructive
    // dark:aria-invalid:ring-destructive/40

    return (
      <div
        ref={containerRef}
        className={cn(
          'rounded-[7px] overflow-hidden relative',
          'border border-input shadow-xs',
          disabled
            ? 'cursor-not-allowed opacity-50 bg-muted [&>.monaco-editor]:pointer-events-none'
            : 'has-[&>.focused]:border-ring has-[&>.focused]:ring-ring/50 has-[&>.focused]:ring-[3px]',
          className
        )}
      >
        {children}
      </div>
    );
  }
);

JsonEditor.displayName = 'JsonEditor';
