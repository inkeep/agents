'use client';

import { Extension } from '@tiptap/core';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from '@tiptap/suggestion';
import type { ComponentPropsWithoutRef, FC, RefObject } from 'react';
import { useState, useCallback, useImperativeHandle, useMemo } from 'react';
import { monacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';
import { buildPromptContent } from './prompt-editor-utils';
import Mention from '@tiptap/extension-mention';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { Button } from '@/components/ui/button';
import { TextInitial } from 'lucide-react';
import { MarkdownIcon } from '@/icons';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { suggestion } from './tiptap/suggestion';
import './prompt-editor.css';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type VariableSuggestionItem = {
  label: string;
  detail: string;
};

interface VariableListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface VariableListProps extends SuggestionProps<VariableSuggestionItem> {
  ref: RefObject<VariableListRef>;
}

const VariableList: FC<VariableListProps> = ({ items, command, children }) => {
  const [open, setOpen] = useState(true);

  const selectItem = useCallback(
    (event: any) => {
      const label = (event.currentTarget as HTMLElement).dataset.label;
      command({ label });
    },
    [command]
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      // Setting modal false, so hovering on sidebar will still expand it
      modal={false}
    >
      <DropdownMenuTrigger />
      <DropdownMenuContent sideOffset={1} align="start">
        {items.length ? (
          items.map((item) => (
            <DropdownMenuItem key={item.label} data-label={item.label} onSelect={selectItem}>
              <span className="truncate">{item.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{item.detail}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">No suggestions</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const VariableSuggestion = Extension.create<{
  suggestion: Partial<SuggestionOptions<VariableSuggestionItem>>;
}>({
  name: 'variableSuggestion',
  addProseMirrorPlugins() {
    return [
      Suggestion<VariableSuggestionItem>({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const buildVariableItems: SuggestionOptions['items'] = ({ query }) => {
  const { variableSuggestions } = monacoStore.getState();

  const normalized = query.toLowerCase();
  const entries = new Map<string, VariableSuggestionItem>();

  for (const label of variableSuggestions) {
    if (label.toLowerCase().includes(normalized)) {
      entries.set(label, { label, detail: 'Context variable' });
    }
  }

  return [...entries.values(), { label: '$env.', detail: 'Environment variable' }];
};

const createSuggestionRenderer: SuggestionOptions['render'] = () => {
  return {
    onStart(startProps) {
      console.log('on start');
      const component = new ReactRenderer(VariableList, {
        props: startProps,
        editor: startProps.editor,
      });
      // startProps.decorationNode?.append(popupElement);

      const popupElement = document.createElement('div');
      popupElement.append(component.element);
      popupElement.style.position = 'absolute';
      popupElement.style.zIndex = '9999';
      document.body.append(popupElement);

      const clientRect = startProps.clientRect?.();
      if (!clientRect) return;
      popupElement.style.left = `${clientRect.left}px`;
      popupElement.style.top = `${clientRect.bottom}px`;
    },
    onExit() {
      console.log('on exit');
    },
  };
};

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
  const contentType = useAgentStore((state) => (state.isMarkdownEditor ? undefined : 'markdown'));
  const formattedContent = useMemo(() => buildPromptContent(''), []);

  const suggestionExtension = useMemo(
    () =>
      VariableSuggestion.configure({
        suggestion: {
          char: '{',
          allowSpaces: true,
          items: buildVariableItems,
          command({ editor, range, props }) {
            editor.chain().focus().insertContentAt(range, `{{${props.label}}}`).run();
          },
          render: createSuggestionRenderer,
        },
      }),
    []
  );

  const editor = useEditor({
    immediatelyRender: false, // needs for SSR
    editorProps: {
      attributes: {
        class: cn(
          contentType && 'prose prose-sm dark:prose-invert',
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
      Highlight,
      suggestionExtension,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion,
      }),
    ],
    content: contentType ? mdContent : formattedContent,
    contentType,
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
    editor?.commands.setContent(
      contentType ? formattedContent : mdContent,
      contentType ? undefined : { contentType: 'markdown' }
    );
    toggleMarkdownEditor();
  }, [editor, contentType, toggleMarkdownEditor, formattedContent]);

  const IconToUse = contentType ? TextInitial : MarkdownIcon;

  return (
    <EditorContent editor={editor} className="relative">
      <Button
        variant="default"
        className="absolute end-2 top-2 z-1"
        size="icon-sm"
        title={`Switch to ${contentType ? 'Text' : 'Markdown'}`}
        onClick={toggle}
      >
        <IconToUse />
      </Button>
    </EditorContent>
  );
};
