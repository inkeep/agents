import { type ReactNode, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useTheme } from 'next-themes';
import { type editor, KeyCode } from 'monaco-editor';
import { toast } from 'sonner';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
} from '@/lib/monaco-utils';
import { MONACO_THEME_NAME } from '@/constants/theme';
import '@/lib/setup-monaco-workers';
import { cn } from '@/lib/utils';

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
  model: editor.ITextModel | null;
}

export const JsonEditor = forwardRef<
  JsonEditorRef,
  {
    value: string;
    uri: `${string}.json`;
    readOnly?: boolean;
    children?: ReactNode;
    className?: string;
  }
>(({ value, uri, readOnly = false, children, className }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<editor.ITextModel>(null);
  const { resolvedTheme } = useTheme();

  useImperativeHandle(ref, () => ({
    model: modelRef.current,
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const model = getOrCreateModel({ uri, value });
    modelRef.current = model;
    const monacoTheme = resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
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
    // Wait for Monaco workers to initialize
    const timerId = setTimeout(() => {
      if (model.isDisposed()) {
        return;
      }
      addDecorations(editorInstance, value, ' ');
    }, 1000);

    return cleanupDisposables(
      {
        dispose() {
          clearTimeout(timerId);
        },
      },
      model,
      editorInstance,
      readOnly && editorInstance.onMouseDown(handleCopyFieldValue(model)),
      editorInstance.onDidContentSizeChange(updateHeight),
      // Disable command palette by overriding the action
      editorInstance.addAction({
        id: 'disable-command-palette',
        label: 'Disable Command Palette',
        keybindings: [KeyCode.F1],
        // Do nothing - this prevents the command palette from opening
        run() {},
      })
    );
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
  // data-disabled:cursor-not-allowed
  // data-disabled:opacity-50
  // data-disabled:bg-muted
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
        'has-[&>.focused]:border-ring has-[&>.focused]:ring-ring/50 has-[&>.focused]:ring-[3px]',
        className
      )}
    >
      {children}
    </div>
  );
});
