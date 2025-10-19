'use client';

import type { FC, Ref, ComponentPropsWithoutRef } from 'react';
import { useEffect, useRef, useImperativeHandle } from 'react';
import { useTheme } from 'next-themes';
import type { IDisposable, editor } from 'monaco-editor';
import { MONACO_THEME_NAME } from '@/constants/theme';
import { cn } from '@/lib/utils';
import { cleanupDisposables } from '@/lib/monaco-editor/monaco-utils';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { Skeleton } from '@/components/ui/skeleton';
import '@/lib/monaco-editor/setup-monaco-workers';

interface MonacoEditorRef {
  editor: editor.IStandaloneCodeEditor | null;
}

type Monaco = typeof import('monaco-editor');

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
  ref?: Ref<MonacoEditorRef>;
  placeholder?: string;
  /** @default 12 */
  fontSize?: number;
  /**
   * Stretches the editor height to fit its content.
   * @default true
   */
  hasDynamicHeight?: boolean;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
}

export const MonacoEditor: FC<MonacoEditorProps> = ({
  ref,
  value = '',
  uri: $uri,
  readOnly,
  children,
  className,
  disabled,
  onChange,
  placeholder,
  autoFocus,
  fontSize = 12,
  hasDynamicHeight = true,
  onMount,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor>(null);
  const onChangeRef = useRef<typeof onChange>(undefined);
  const { resolvedTheme } = useTheme();
  const monaco = useMonacoStore((state) => state.monaco);

  // Expose editor instance through ref
  useImperativeHandle(ref, () => ({
    editor: editorRef.current,
  }));

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Initialize Monaco Editor (runs only on mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !monaco) {
      return;
    }
    const { Uri, editor } = monaco;
    const uri = Uri.file($uri);
    const language = uri.path.split('.').at(-1);
    if (!language) {
      throw new Error(`Could not determine file language from path: "${uri.path}"`);
    }
    function getOrCreateModel() {
      const model = editor.getModel(uri);
      return model ?? editor.createModel(value, language, uri);
    }
    const model = getOrCreateModel();
    const monacoTheme = resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;

    const editorInstance = editor.create(container, {
      theme: monacoTheme,
      model,
      readOnly,
      placeholder,
      fontSize,
      language,
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
      // scrollbar: {
      //   verticalScrollbarSize: 10,
      // },
    });
    editorRef.current = editorInstance;

    // Set up disposables for cleanup
    const disposables: IDisposable[] = [
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
        const contentHeight = editorInstance.getContentHeight();
        if (container) {
          container.style.height = `${contentHeight}px`;
        }
      }

      disposables.push(editorInstance.onDidContentSizeChange(updateHeight));
    }

    onMount?.(editorInstance, monaco);

    return cleanupDisposables(disposables);
  }, [monaco]);

  return (
    <div
      ref={containerRef}
      className={cn(
        !hasDynamicHeight && 'h-full',
        'rounded-md relative dark:bg-input/30 transition-colors',
        'border border-input shadow-xs',
        disabled
          ? 'cursor-not-allowed opacity-50 bg-muted [&>.monaco-editor]:pointer-events-none'
          : 'has-[&>.focused]:border-ring has-[&>.focused]:ring-ring/50 has-[&>.focused]:ring-[3px]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    >
      {children}
      {!monaco && <Skeleton className="h-4 w-3/4 mx-[26px] my-3" />}
    </div>
  );
};
