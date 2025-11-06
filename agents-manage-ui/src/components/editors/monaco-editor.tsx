'use client';

import type * as Monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import type { ComponentPropsWithoutRef, FC } from 'react';
import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonacoActions, useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cleanupDisposables, getOrCreateModel } from '@/lib/monaco-editor/monaco-utils';
import { cn } from '@/lib/utils';
import '@/lib/monaco-editor/setup-monaco-workers';

interface MonacoEditorProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  /** @default '' */
  value?: string;
  /**
   * Virtual file system path.
   * @see https://github.com/microsoft/monaco-editor?tab=readme-ov-file#uris
   */
  uri: string;
  readOnly?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
  /** @default '' */
  placeholder?: string;
  /**
   * Stretches the editor height to fit its content.
   * @default true
   */
  hasDynamicHeight?: boolean;
  onMount?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
  editorOptions?: Omit<
    Monaco.editor.IStandaloneEditorConstructionOptions,
    'readOnly' | 'placeholder'
  >;
}

export const MonacoEditor: FC<MonacoEditorProps> = ({
  value = '',
  uri,
  readOnly,
  children,
  className,
  disabled,
  onChange,
  placeholder = '',
  autoFocus,
  editorOptions = {},
  hasDynamicHeight = true,
  onMount,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor>(null);
  const onChangeRef = useRef<typeof onChange>(undefined);
  const monaco = useMonacoStore((state) => state.monaco);
  const { setupHighlighter } = useMonacoActions();
  // Update editor options when `readOnly` or `disabled` changes
  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly: readOnly || disabled,
    });
  }, [readOnly, disabled]);

  // Sync model value when `value` prop changes
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== value) {
      model.setValue(value);
    }
  }, [value]);

  // Keep `onChangeRef` up to date to avoid stale closures in the model's `onDidChangeContent` handler
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isDark = useTheme().resolvedTheme === 'dark';
  // biome-ignore lint/correctness/useExhaustiveDependencies: Initialize Monaco Editor (runs only on mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !monaco) {
      return;
    }
    const { editor } = monaco;
    const { model, language } = getOrCreateModel({ monaco, uri, value });

    const editorInstance = editor.create(container, {
      model,
      language,
      extraEditorClassName: [
        '[--vscode-editor-background:transparent]!',
        '[--vscode-editorGutter-background:transparent]!',
        '[--vscode-focusBorder:transparent]!',
      ].join(' '),
      automaticLayout: true,
      minimap: { enabled: false }, // disable the minimap
      overviewRulerLanes: 0, // remove unnecessary error highlight on the scroll
      scrollBeyondLastLine: false, // cleans up unnecessary "padding-bottom" on each editor
      lineNumbers: 'off',
      wordWrap: 'on', // Toggle word wrap on resizing editors
      contextmenu: false, // Disable the right-click context menu
      fixedOverflowWidgets: true, // since container has overflow-hidden
      padding: {
        top: 12,
        bottom: 12,
      },
      scrollbar: {
        vertical: 'hidden', // Hide vertical scrollbar
        horizontal: 'hidden', // Hide horizontal scrollbar
        useShadows: false, // Disable shadow effects
        alwaysConsumeMouseWheel: false, // Monaco grabs the mouse wheel by default
      },
      stickyScroll: { enabled: false }, // Disable sticky scroll widget
      tabSize: 2,
      readOnly,
      // Monaco doesn't render whitespace at the beginning of the lines
      placeholder: placeholder.replaceAll(/^\s+/gm, (substring) =>
        '\u00A0'.repeat(substring.length)
      ),
      fontSize: 12,
      lineDecorationsWidth: 0, // removes the blank margin where the extra caret shows
      ...editorOptions,
    });
    editorRef.current = editorInstance;

    // Set up disposables for cleanup
    const disposables: Monaco.IDisposable[] = [
      model,
      // Handle content changes
      model.onDidChangeContent(() => {
        const currentOnChange = onChangeRef.current; // Always gets the latest onChange
        if (!currentOnChange) {
          return;
        }
        const newValue = model.getValue();
        currentOnChange(newValue); // Calls the current onChange, not a stale one
      }),
      editorInstance,
      // Disable command palette
      editorInstance.addAction({
        id: 'disable-command-palette',
        label: 'Disable Command Palette',
        keybindings: [monaco.KeyCode.F1],
        run() {}, // Do nothing - prevents command palette from opening
      }),
      editorInstance.onKeyDown((event) => {
        if (event.code !== 'Space') {
          return;
        }
        // Stop propagation to prevent ReactFlow from capturing the space key
        event.browserEvent.stopPropagation();
      }),
    ];

    if (autoFocus) {
      requestAnimationFrame(() => {
        editorInstance.focus();
      });
    }

    if (hasDynamicHeight) {
      // Auto-resize editor based on content
      function updateHeight() {
        if (model.isDisposed()) {
          return;
        }
        // Update height based on content
        let contentHeight = editorInstance.getContentHeight();
        const currentValue = model.getValue();
        // If there's no content but there's a placeholder, calculate height based on placeholder
        if (!currentValue && placeholder) {
          const lines = placeholder.split('\n');
          const lineHeight = editorInstance.getOption(editor.EditorOption.lineHeight);
          const { top, bottom } = editorInstance.getOption(editor.EditorOption.padding);
          contentHeight = lines.length * lineHeight + top + bottom;
        }

        if (container) {
          container.style.height = `${contentHeight}px`;
        }
      }
      updateHeight();

      disposables.push(editorInstance.onDidContentSizeChange(updateHeight));
    }
    setupHighlighter(isDark);
    onMount?.(editorInstance);
    return cleanupDisposables(disposables);
  }, [monaco]);

  return (
    <div
      className={cn(
        !hasDynamicHeight && 'h-full',
        'rounded-md relative dark:bg-input/30 transition-colors',
        'border border-input shadow-xs',
        disabled
          ? 'cursor-not-allowed opacity-50 bg-muted [&>.monaco-editor]:pointer-events-none'
          : 'has-[&>.focused]:border-ring has-[&>.focused]:ring-ring/50 has-[&>.focused]:ring-[3px]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
        !monaco && 'px-3 py-4',
        // Fixes cursor blinking at the beginning of the line
        '[&_.native-edit-context]:caret-transparent'
      )}
      {...props}
      ref={containerRef}
    >
      {!monaco && (
        <>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5 mt-3 mb-full" />
        </>
      )}
      {children}
    </div>
  );
};
