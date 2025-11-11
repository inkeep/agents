import { Braces } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { ExpandableField } from '@/components/form/expandable-field';
import { Button } from '@/components/ui/button';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

type PromptEditorProps = ComponentProps<typeof PromptEditor> & {
  name: string;
};

export function ExpandablePromptEditor({
  label,
  isRequired = false,
  className,
  error,
  name,
  ...props
}: {
  label: string;
  isRequired?: boolean;
  error?: string;
} & PromptEditorProps) {
  const [open, onOpenChange] = useState(false);
  const monaco = useMonacoStore((state) => state.monaco);
  const uri = `${open ? 'small' : 'full'}-${name}.template` as const;

  const handleAddVariable = useCallback(() => {
    if (!monaco) {
      return;
    }
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    const [editor] = monaco.editor.getEditors().filter((editor) => editor.getModel() === model);
    if (!editor) {
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
  }, [monaco, uri]);

  const id = `${name}-label`;

  return (
    <ExpandableField
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      uri={uri}
      label={label}
      isRequired={isRequired}
      hasError={!!error}
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
        uri={uri}
        autoFocus={open}
        aria-invalid={error ? 'true' : undefined}
        className={cn(!open && 'max-h-96', className)}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ExpandableField>
  );
}
