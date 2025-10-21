import { ExpandableField } from '@/components/form/expandable-field';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Braces } from 'lucide-react';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import type { ComponentProps } from 'react';
import type * as Monaco from 'monaco-editor';
import { MonacoEditor } from '@/components/editors/monaco-editor';

type PromptEditorProps = ComponentProps<typeof PromptEditor>;

export function ExpandablePromptEditor({
  label,
  isRequired = false,
  className,
  ...props
}: {
  label: string;
  isRequired?: boolean;
} & PromptEditorProps) {
  const [open, onOpenChange] = useState(false);
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const monaco = useMonacoStore((state) => state.monaco);
  const handleOnMount: NonNullable<ComponentProps<typeof MonacoEditor>['onMount']> = useCallback(
    (editorInstance) => {
      setEditor(editorInstance);
    },
    []
  );

  const handleAddVariable = useCallback(() => {
    if (!editor || !monaco) {
      return;
    }
    const selection = editor.getSelection();
    const pos = selection ? selection.getStartPosition() : editor.getPosition();
    if (!pos) return;

    const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    editor.executeEdits('insert-template-variable', [{ range, text: '{' }]);
    editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
    editor.focus();
    editor.trigger('insert-template-variable', 'editor.action.triggerSuggest', {});
  }, [editor, monaco]);

  return (
    <ExpandableField
      open={open}
      onOpenChange={onOpenChange}
      name={props.id || 'expandable-textarea'}
      label={label}
      isRequired={isRequired}
      actions={
        <Button
          size="sm"
          variant="link"
          className="text-xs rounded-sm h-6"
          type="button"
          onClick={handleAddVariable}
        >
          <Braces className="size-3.5" />
          Add variables
        </Button>
      }
    >
      <PromptEditor
        onMount={handleOnMount}
        // uri={`${props.id}.template`}
        hasDynamicHeight={!open}
        {...props}
      />
    </ExpandableField>
  );
}
