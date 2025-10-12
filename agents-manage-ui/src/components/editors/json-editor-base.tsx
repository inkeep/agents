'use client';

import type { FC, Ref, ComponentPropsWithoutRef } from 'react';
import { useEffect, useRef, useImperativeHandle, useId, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { type editor, type IDisposable, KeyCode } from 'monaco-editor';
import { toast } from 'sonner';
import { MONACO_THEME_NAME } from '@/constants/theme';
import { cn } from '@/lib/utils';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
} from '@/lib/monaco-editor/monaco-utils';
import '@/lib/monaco-editor/setup-monaco-workers';

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

interface JsonEditorProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  /** @default '' */
  value?: string;
  uri?: `${string}.json`;
  readOnly?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
  ref?: Ref<JsonEditorRef>;
  placeholder?: string;
  /** @default 12 */
  fontSize?: number;
}

export const JsonEditor: FC<JsonEditorProps> = ({
  ref,
  value = '',
  uri,
  readOnly,
  children,
  className,
  disabled,
  onChange,
  placeholder,
  autoFocus,
  fontSize = 12,
  ...props
}) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.json` as `${string}.json`, [id]);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor>(null);
  const onChangeRef = useRef<typeof onChange>(undefined);
  const { resolvedTheme } = useTheme();

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
    if (!container) {
      return;
    }
    const model = getOrCreateModel({ uri, value });
    const monacoTheme = resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;

    const editorInstance = createEditor(container, {
      theme: monacoTheme,
      model,
      readOnly,
      placeholder,
      fontSize,
    });
    editorRef.current = editorInstance;

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
      editorInstance.onDidContentSizeChange(updateHeight),
      // Disable command palette
      editorInstance.addAction({
        id: 'disable-command-palette',
        label: 'Disable Command Palette',
        keybindings: [KeyCode.F1],
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

    // Add read-only specific features
    if (readOnly) {
      // Add copy decorations after Monaco workers initialize
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
  // [&>.cm-editor]:px-3
  // [&>.cm-editor]:py-2

  return (
    <div
      ref={containerRef}
      className={cn(
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
    </div>
  );
};
