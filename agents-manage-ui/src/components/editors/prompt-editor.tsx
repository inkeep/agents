'use client';

import type { ComponentPropsWithoutRef } from 'react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from '@tiptap/suggestion';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import type { Instance as TippyInstance } from 'tippy.js';
import tippy from 'tippy.js';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';
import { buildPromptContent, extractInvalidVariables } from './prompt-editor-utils';

type VariableSuggestionItem = {
  label: string;
  detail: string;
};

interface VariableListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type VariableListProps = SuggestionProps<VariableSuggestionItem>;

const VariableList = forwardRef<VariableListRef, VariableListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (!item) return;
    props.command(item);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (props.items.length === 0) return false;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const total = props.items.length;
        setSelectedIndex((index) => (index + total - 1) % total);
        return true;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const total = props.items.length;
        setSelectedIndex((index) => (index + 1) % total);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="min-w-56 rounded-md border border-input bg-popover text-popover-foreground shadow-lg">
      {props.items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No suggestions</p>
      ) : (
        <ul className="py-1">
          {props.items.map((item, index) => (
            <li key={item.label}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
                  index === selectedIndex ? 'bg-muted' : 'hover:bg-muted'
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectItem(index);
                }}
              >
                <span className="truncate">{item.label}</span>
                <span className="ml-3 text-xs text-muted-foreground">{item.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

VariableList.displayName = 'VariableList';

const VariableSuggestion = Extension.create<{
  suggestion: Partial<SuggestionOptions<VariableSuggestionItem>>;
}>({
  name: 'variableSuggestion',
  addOptions() {
    return {
      suggestion: {},
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<VariableSuggestionItem>({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const getEditorText = (editor: Editor) =>
  editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');

interface PromptEditorProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  hasDynamicHeight?: boolean;
}

export interface PromptEditorHandle {
  focus: () => void;
  insertVariableTrigger: () => void;
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  (
    {
      value = '',
      onChange,
      placeholder,
      autoFocus,
      readOnly,
      disabled,
      className,
      hasDynamicHeight = true,
      ...props
    },
    ref
  ) => {
    const suggestionsRef = useRef<string[]>([]);
    const [textValue, setTextValue] = useState(value);
    const variableSuggestions = useMonacoStore((state) => state.variableSuggestions);
    const invalidVariables = useMemo(
      () => extractInvalidVariables(textValue, suggestionsRef.current),
      [textValue, variableSuggestions]
    );

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
              editor
                .chain()
                .focus()
                .insertContentAt(range, `{{${props.label}}}`)
                .run();
            },
            render() {
              let component: ReactRenderer<VariableListRef>;
              let popup: TippyInstance[];

              return {
                onStart(startProps) {
                  component = new ReactRenderer(VariableList, {
                    props: startProps,
                    editor: startProps.editor,
                  });

                  if (!startProps.clientRect) return;

                  popup = tippy('body', {
                    getReferenceClientRect: startProps.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                  });
                },
                onUpdate(updateProps) {
                  component.updateProps(updateProps);

                  if (!updateProps.clientRect || !popup?.[0]) return;

                  popup[0].setProps({
                    getReferenceClientRect: updateProps.clientRect,
                  });
                },
                onKeyDown(keyDownProps) {
                  if (keyDownProps.event.key === 'Escape') {
                    popup?.[0]?.hide();
                    return true;
                  }

                  return component.ref?.onKeyDown(keyDownProps) ?? false;
                },
                onExit() {
                  popup?.[0]?.destroy();
                  component.destroy();
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

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          code: false,
          bold: false,
          italic: false,
          strike: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          dropcursor: false,
          gapcursor: false,
          horizontalRule: false,
        }),
        placeholderExtension,
        suggestionExtension,
      ],
      editorProps: {
        attributes: {
          class:
            'focus:outline-none whitespace-pre-wrap break-words text-sm leading-6 prose prose-sm max-w-none dark:prose-invert',
        },
      },
      editable: !(readOnly || disabled),
      content: buildPromptContent(value),
      onUpdate({ editor })  {
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
      if (!editor) return;
      editor.setEditable(!(readOnly || disabled));
    }, [disabled, editor, readOnly]);

    useEffect(() => {
      if (!editor || !autoFocus) return;
      editor.chain().focus('end').run();
    }, [autoFocus, editor]);

    useImperativeHandle(
      ref,
      () => ({
        focus()  {
          editor?.chain().focus('end').run();
        },
        insertVariableTrigger()  {
          editor?.chain().focus().insertContent('{').run();
        },
      }),
      [editor]
    );

    const invalid = props['aria-invalid'] === 'true' || props['aria-invalid'] === true;

    return (
      <div
        className={cn(
          'rounded-md border border-input shadow-xs transition-colors',
          disabled || readOnly
            ? 'bg-muted/50 text-muted-foreground opacity-70'
            : 'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40',
          invalid && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/30',
          hasDynamicHeight ? 'min-h-[4rem]' : 'min-h-[320px]',
          className
        )}
        {...props}
      >
        <div className={cn('px-3 py-2', !hasDynamicHeight && 'h-full flex flex-col')}>
          <EditorContent
            editor={editor}
            className={cn(
              'min-h-[4rem]',
              !hasDynamicHeight && 'flex-1',
              disabled && 'pointer-events-none select-none'
            )}
          />
          {invalidVariables.length > 0 && (
            <div className="pt-2 text-xs text-destructive">
              Unknown variables: {invalidVariables.join(', ')}
            </div>
          )}
        </div>
      </div>
    );
  }
);

PromptEditor.displayName = 'PromptEditor';
