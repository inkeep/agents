'use client';

import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, type UseEditorOptions, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextInitial } from 'lucide-react';
import type { ComponentPropsWithoutRef, FC, RefObject } from 'react';
import { useEffect, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { MarkdownIcon } from '@/icons';
import { cn } from '@/lib/utils';
import { variableSuggestionExtension } from './tiptap/variable-suggestion';
import './prompt-editor.css';

interface PromptEditorProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  hasDynamicHeight?: boolean;
  ref: RefObject<PromptEditorHandle | null>;
}

const editorOptions: UseEditorOptions = {
  parseOptions: {
    // do not collapse new lines in text editor
    preserveWhitespace: 'full',
  },
};

export interface PromptEditorHandle {
  focus: () => void;
  insertVariableTrigger: () => void;
}

export const PromptEditor: FC<PromptEditorProps> = ({
  className,
  hasDynamicHeight,
  disabled,
  readOnly,
  ref,
  value,
  'aria-invalid': ariaInvalid,
  placeholder,
  autoFocus,
  onChange,
}) => {
  const { toggleMarkdownEditor } = useAgentActions();
  const isMarkdownMode = useAgentStore((state) => state.isMarkdownEditor);
  const editable = !(readOnly || disabled);

  const editor = useEditor(
    {
      ...editorOptions,
      autofocus: autoFocus,
      // to see placeholder on initial rendering
      immediatelyRender: true,
      extensions: [
        isMarkdownMode
          ? StarterKit
          : StarterKit.configure({
              // this is needed to remove node formatting for text mode
              bold: false,
              italic: false,
              orderedList: false,
              bulletList: false,
              code: false,
              codeBlock: false,
              strike: false,
              heading: false,
              blockquote: false,
            }),
        Placeholder.configure({ placeholder }),
        Markdown,
        TaskList,
        TaskItem.configure({ nested: true }),
        TableKit,
        // todo: add dropdown suggestions for text mode too
        ...(isMarkdownMode ? [variableSuggestionExtension] : []),
      ],
      content: value,
      contentType: isMarkdownMode ? 'markdown' : undefined,
      onUpdate({ editor }) {
        const nextValue = isMarkdownMode ? editor.getMarkdown() : editor.getText();
        onChange?.(nextValue);
      },
    },
    [isMarkdownMode]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    // Add a class to an existing editor instance
    editor.setOptions({
      editorProps: {
        attributes: {
          class: cn(
            'prose prose-sm dark:prose-invert',
            'focus:outline-none overflow-scroll min-w-full',
            'dark:bg-input/30 text-sm focus:outline-none px-3 py-2',
            'rounded-md border border-input shadow-xs transition-colors',
            hasDynamicHeight ? 'min-h-16' : 'min-h-80',
            editable
              ? 'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40'
              : 'bg-muted/50 text-muted-foreground opacity-70 cursor-not-allowed',
            ariaInvalid === 'true' &&
              'border-destructive focus-within:border-destructive focus-within:ring-destructive/30',
            className
          ),
        },
      },
    });
    editor.setEditable(editable);
  }, [editor, hasDynamicHeight, editable, ariaInvalid, className]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    // When `Markdown` extension is enabled placeholder isn't rendered on initial loading
    // and loaded only after focusing editor, this dispatch fix it
    editor.view.dispatch(editor.state.tr.setMeta('placeholder-init', true));
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editor?.chain().focus('end').run();
      },
      insertVariableTrigger() {
        if (!editor) {
          return;
        }
        const { from } = editor.state.selection;
        // Get the character **before** caret
        const charBefore = editor.state.doc.textBetween(from - 1, from);

        editor
          .chain()
          .focus()
          // @tiptap/extension-mention don't show dropdown if there is some character before, we insert space to fix it
          .insertContent(charBefore ? ' {' : '{')
          .run();
      },
    }),
    [editor]
  );

  const IconToUse = isMarkdownMode ? TextInitial : MarkdownIcon;

  return (
    <EditorContent editor={editor} className="relative">
      <Button
        variant="default"
        className="absolute end-2 top-2 z-1"
        size="icon-sm"
        title={`Switch to ${isMarkdownMode ? 'Text' : 'Markdown'}`}
        onClick={toggleMarkdownEditor}
      >
        <IconToUse />
      </Button>
    </EditorContent>
  );
};
