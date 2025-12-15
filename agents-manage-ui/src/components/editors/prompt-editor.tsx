'use client';

import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, type UseEditorOptions, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextInitial } from 'lucide-react';
import type { ComponentPropsWithoutRef, FC, RefObject } from 'react';
import { useCallback, useEffect, useImperativeHandle, useState } from 'react';
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
  ref: RefObject<PromptEditorHandle>;
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

export const PromptEditor2: FC<PromptEditorProps> = ({
  value = '',
  onChange,
  placeholder,
  autoFocus,
  readOnly,
  disabled,
  className,
  hasDynamicHeight = true,
  ref,
  ...props
}) => {
  const suggestionsRef = useRef<string[]>([]);
  const [textValue, setTextValue] = useState(value);
  const variableSuggestions = useMonacoStore((state) => state.variableSuggestions);
  // const invalidVariables = useMemo(
  //   () => extractInvalidVariables(textValue, suggestionsRef.current),
  //   [textValue, variableSuggestions]
  // );

  useEffect(() => {
    if (!editor) return;
    const next = value ?? '';
    if (next === textValue) return;
    editor.commands.setContent(next);
    setTextValue(next);
  }, [editor, textValue, value]);

  return (
    <EditorContent
      editor={editor}
      {...props}
      //{invalidVariables.length > 0 && (
      //  <div className="pt-2 text-xs text-destructive">
      //    Unknown variables: {invalidVariables.join(', ')}
      //  </div>
      //)}
    />
  );
};

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

  const editor = useEditor({
    ...editorOptions,
    autofocus: autoFocus,
    // to see placeholder on initial rendering
    immediatelyRender: true,
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
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      variableSuggestionExtension,
    ],
    content: value,
    contentType: isMarkdownMode ? 'markdown' : undefined,
    onUpdate({ editor }) {
      const nextValue = editor.getMarkdown();
      onChange?.(nextValue);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    // When `Markdown` extension is enabled placeholder isn't rendered on initial loading
    // and loaded only after focusing editor, this dispatch fix it
    editor.view.dispatch(editor.state.tr.setMeta('placeholder-init', true));
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

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

  const toggle = useCallback(() => {
    if (!editor) return;
    // First toggle and after set content, since we are checking current `contentType` in `renderHTML()` of
    // `variableSuggestionExtension`
    toggleMarkdownEditor();
    editor.commands.setContent(
      isMarkdownMode ? /* text */ editor.getMarkdown() : /* markdown */ editor.getText(),
      isMarkdownMode ? editorOptions : { contentType: 'markdown' }
    );
  }, [editor, isMarkdownMode, toggleMarkdownEditor]);

  const IconToUse = isMarkdownMode ? TextInitial : MarkdownIcon;

  return (
    <EditorContent editor={editor} className="relative">
      <Button
        variant="default"
        className="absolute end-2 top-2 z-1"
        size="icon-sm"
        title={`Switch to ${isMarkdownMode ? 'Text' : 'Markdown'}`}
        onClick={toggle}
      >
        <IconToUse />
      </Button>
    </EditorContent>
  );
};
