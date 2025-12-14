'use client';

import type { MarkdownTokenizer } from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Mention from '@tiptap/extension-mention';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextInitial } from 'lucide-react';
import type { ComponentPropsWithoutRef, FC, RefObject } from 'react';
import { useCallback, useImperativeHandle, useMemo } from 'react';
import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { MarkdownIcon } from '@/icons';
import { cn } from '@/lib/utils';
import { mdContent } from './content';
import { buildPromptContent } from './prompt-editor-utils';
import { suggestion } from './tiptap/suggestion';
import './prompt-editor.css';

const TOKEN_NAME = 'variableSuggestion';

const variableSuggestionTokenizer: MarkdownTokenizer = {
  name: TOKEN_NAME,
  level: 'inline',
  start: (src) => src.indexOf('{{'),
  tokenize(src) {
    const match = src.match(/^\{\{([^{}]+)}}/);
    if (!match) {
      return;
    }
    const [raw, id] = match;
    return {
      type: TOKEN_NAME,
      raw,
      id: id.trim(),
    };
  },
};

const suggestionExtension = Mention.extend({
  markdownTokenName: TOKEN_NAME,
  markdownTokenizer: variableSuggestionTokenizer,
  parseMarkdown(token, helpers) {
    const id = token.id ?? token.text;
    return helpers.createNode('mention', {
      id,
      label: id,
      mentionSuggestionChar: '{',
    });
  },
  renderMarkdown({ attrs }) {
    const label = attrs?.label ?? attrs?.id;
    return label ? `{{${label}}}` : '';
  },
  renderText({ node }) {
    const label = node.attrs.label ?? node.attrs.id;
    return `{{${label}}}`;
  },
  renderHTML({ node }) {
    const label = node.attrs.label ?? node.attrs.id;
    const className = badgeVariants({ variant: 'violet' });
    return ['span', { class: className }, `{{${label}}}`];
  },
}).configure({
  suggestion,
});

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
    suggestionsRef.current = [...new Set(variableSuggestions)];
  }, [variableSuggestions]);

  const suggestionExtension = useMemo(
    () =>
      VariableSuggestion.configure({
        suggestion: {
          char: '{',
          allowSpaces: true,
          items({ query }) {
            const normalized = query.toLowerCase();
            const entries = new Map<string, VariableSuggestionItem>();

            for (const label of suggestionsRef.current) {
              if (label.toLowerCase().includes(normalized)) {
                entries.set(label, { label, detail: 'Context variable' });
              }
            }

            entries.set('$env.', { label: '$env.', detail: 'Environment variable' });

            return [...entries.values()];
          },
          command({ editor, range, props }) {
            editor.chain().focus().insertContentAt(range, `{{${props.label}}}`).run();
          },
          render() {
            let component: ReactRenderer<VariableListRef> | null = null;
            let popupElement: HTMLElement | null = null;

            const updatePopupPosition = (props: SuggestionProps<VariableSuggestionItem>) => {
              const clientRect = props.clientRect?.();
              if (!popupElement || !clientRect) return;
              popupElement.style.left = `${clientRect.left + window.scrollX}px`;
              popupElement.style.top = `${clientRect.bottom + window.scrollY}px`;
            };

            const destroyPopup = () => {
              if (popupElement?.parentNode) {
                popupElement.parentNode.removeChild(popupElement);
              }
              popupElement = null;
              component?.destroy();
              component = null;
            };

            return {
              onStart(startProps) {
                component = new ReactRenderer(VariableList, {
                  props: startProps,
                  editor: startProps.editor,
                });

                popupElement = document.createElement('div');
                popupElement.style.position = 'absolute';
                popupElement.style.zIndex = '9999';
                popupElement.appendChild(component.element);
                document.body.appendChild(popupElement);
                updatePopupPosition(startProps);
              },
              onUpdate(updateProps) {
                component?.updateProps(updateProps);
                updatePopupPosition(updateProps);
              },
              onKeyDown(keyDownProps) {
                if (keyDownProps.event.key === 'Escape') {
                  destroyPopup();
                  return true;
                }

                return component?.ref?.onKeyDown(keyDownProps) ?? false;
              },
              onExit() {
                destroyPopup();
              },
            };
          },
        },
      }),
    []
  );

  const placeholderExtension = useMemo(
    () => Placeholder.configure({ placeholder: placeholder || '' }),
    [placeholder]
  );
  const invalid = props['aria-invalid'] === 'true' || props['aria-invalid'] === true;
  const editable = !(readOnly || disabled);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        // blockquote: false,
        // codeBlock: false,
        // code: false,
        // bold: false,
        // italic: false,
        // strike: false,
        // bulletList: false,
        // orderedList: false,
        // listItem: false,
        // dropcursor: false,
        // gapcursor: false,
        // horizontalRule: false,
      }),
      placeholderExtension,
      suggestionExtension,
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'dark:bg-input/30 text-sm focus:outline-none px-3 py-2',
          'rounded-md border border-input shadow-xs transition-colors',
          hasDynamicHeight ? 'min-h-16' : 'min-h-80',
          disabled || readOnly
            ? 'bg-muted/50 text-muted-foreground opacity-70'
            : 'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40',
          invalid &&
            'border-destructive focus-within:border-destructive focus-within:ring-destructive/30',
          className
        ),
        // class:
        //   'whitespace-pre-wrap break-words leading-6 prose prose-sm max-w-none dark:prose-invert',
      },
    },
    editable,
    content: buildPromptContent(value),
    onUpdate({ editor }) {
      const nextValue = getEditorText(editor);
      setTextValue(nextValue);
      onChange?.(nextValue);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = value ?? '';
    if (next === textValue) return;
    editor.commands.setContent(buildPromptContent(next), false);
    setTextValue(next);
  }, [editor, textValue, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!autoFocus) return;
    editor?.chain().focus('end').run();
  }, [editor, autoFocus]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editor?.chain().focus('end').run();
      },
      insertVariableTrigger() {
        editor?.chain().focus().insertContent('{').run();
      },
    }),
    [editor]
  );

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

import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { Button } from '@/components/ui/button';
import { TextInitial } from 'lucide-react';
import { MarkdownIcon } from '@/icons';
import { mdContent } from './content';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import './prompt-editor.css';

export const PromptEditor: FC<PromptEditorProps> = ({
  className,
  hasDynamicHeight,
  disabled,
  readOnly,
  ref,
  invalid,
}) => {
  const { toggleMarkdownEditor } = useAgentActions();
  const isMarkdownMode = useAgentStore((state) => state.isMarkdownEditor);
  const formattedContent = useMemo(() => buildPromptContent(mdContent), []);

  const editor = useEditor({
    immediatelyRender: false, // needs for SSR
    editorProps: {
      attributes: {
        class: cn(
          isMarkdownMode && 'prose prose-sm dark:prose-invert',
          'focus:outline-none overflow-scroll min-w-full',
          'dark:bg-input/30 text-sm focus:outline-none px-3 py-2',
          'rounded-md border border-input shadow-xs transition-colors',
          hasDynamicHeight ? 'min-h-16' : 'min-h-80',
          disabled || readOnly
            ? 'bg-muted/50 text-muted-foreground opacity-70'
            : 'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40',
          invalid &&
            'border-destructive focus-within:border-destructive focus-within:ring-destructive/30',
          className
        ),
      },
    },
    extensions: [
      Markdown,
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      suggestionExtension,
      Highlight,
    ],
    content: isMarkdownMode ? mdContent : formattedContent,
    contentType: isMarkdownMode ? 'markdown' : undefined,
  });

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editor?.chain().focus('end').run();
      },
      insertVariableTrigger() {
        // editor?.chain().focus().insertContent('{').run();
      },
    }),
    [editor]
  );

  const toggle = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(
      isMarkdownMode
        ? /* text */ buildPromptContent(editor.getMarkdown())
        : /* markdown */ editor.getText(),
      isMarkdownMode ? undefined : { contentType: 'markdown' }
    );
    toggleMarkdownEditor();
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
