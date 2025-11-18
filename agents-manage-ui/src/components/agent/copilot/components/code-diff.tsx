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

interface CodeDiffProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  originalValue: string;
  newValue: string;
  originalUri?: string;
  modifiedUri?: string;
  editorOptions?: Monaco.editor.IStandaloneDiffEditorConstructionOptions;
  onMount?: (editor: Monaco.editor.IStandaloneDiffEditor) => void;
}

export const CodeDiff: FC<CodeDiffProps> = ({
  originalValue,
  newValue,
  originalUri = 'code-original.txt',
  modifiedUri = 'code-modified.txt',
  className,
  editorOptions = {},
  onMount,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const monaco = useMonacoStore((state) => state.monaco);
  const { setupHighlighter } = useMonacoActions();
  const isDark = useTheme().resolvedTheme === 'dark';

  useEffect(() => {
    const originalModel = editorRef.current?.getOriginalEditor().getModel();
    if (originalModel && originalModel.getValue() !== originalValue) {
      originalModel.setValue(originalValue);
    }
  }, [originalValue]);

  useEffect(() => {
    const modifiedModel = editorRef.current?.getModifiedEditor().getModel();
    if (modifiedModel && modifiedModel.getValue() !== newValue) {
      modifiedModel.setValue(newValue);
    }
  }, [newValue]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Initialize Monaco Diff Editor (runs only on mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !monaco) {
      return;
    }

    const { editor } = monaco;
    const { model: originalModel } = getOrCreateModel({
      monaco,
      uri: originalUri,
      value: originalValue,
    });
    const { model: modifiedModel } = getOrCreateModel({
      monaco,
      uri: modifiedUri,
      value: newValue,
    });

    const diffEditor = editor.createDiffEditor(container, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: false,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      wordWrap: 'on',
      contextmenu: false,
      fixedOverflowWidgets: true,
      padding: {
        top: 12,
        bottom: 12,
      },
      scrollbar: {
        vertical: 'auto',
        horizontal: 'hidden',
        useShadows: false,
        alwaysConsumeMouseWheel: false,
      },
      stickyScroll: { enabled: false },
      fontSize: 12,
      lineDecorationsWidth: 0,
      enableSplitViewResizing: false,
      renderOverviewRuler: false,
      diffWordWrap: 'on',
      ...editorOptions,
    });

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = diffEditor;

    // Auto-resize editor based on content (similar to MonacoEditor)
    function updateHeight() {
      if (container && diffEditor) {
        // Get the height from the modified editor (or original, they should be similar)
        const modifiedEditor = diffEditor.getModifiedEditor();
        const contentHeight = modifiedEditor.getContentHeight();

        if (contentHeight > 0) {
          container.style.height = `${contentHeight}px`;
          diffEditor.layout();
        }
      }
    }

    // Initial update after a brief delay to ensure models are set
    const timeoutId = setTimeout(() => {
      updateHeight();
    }, 0);

    // Update height when content changes
    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();

    const disposables: Monaco.IDisposable[] = [
      originalModel,
      modifiedModel,
      diffEditor,
      originalEditor.onDidContentSizeChange(updateHeight),
      modifiedEditor.onDidContentSizeChange(updateHeight),
      originalEditor.onKeyDown((event) => {
        if (event.code === 'Space') {
          event.browserEvent.stopPropagation();
        }
      }),
      modifiedEditor.onKeyDown((event) => {
        if (event.code === 'Space') {
          event.browserEvent.stopPropagation();
        }
      }),
      {
        dispose: () => {
          clearTimeout(timeoutId);
        },
      },
    ];

    setupHighlighter(isDark);
    onMount?.(diffEditor);

    return cleanupDisposables(disposables);
  }, [monaco]);

  return (
    <div
      className={cn(
        'w-full',
        'rounded-md relative dark:bg-input/30 transition-colors',
        'border border-input shadow-xs',
        className,
        !monaco && 'px-3 py-4',
        '[&_.native-edit-context]:caret-transparent',
        // Fix for inline diff double character rendering - align both editors
        '[&_.editor.original]:left-1!',
        '[&_.editor.modified]:left-1!'
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
    </div>
  );
};
