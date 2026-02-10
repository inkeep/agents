import { Braces } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { ExpandableField } from '@/components/form/expandable-field';
import { Button } from '@/components/ui/button';
import { useMonacoActions, useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

type PromptEditorProps = ComponentProps<typeof PromptEditor> & {
  name: string;
  label: string;
  isRequired?: boolean;
  error?: string;
};

export function ExpandablePromptEditor({
  label,
  isRequired = false,
  className,
  error,
  name,
  ...props
}: PromptEditorProps) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const monaco = useMonacoStore((state) => state.monaco);
  const { getEditorByUri } = useMonacoActions();
  const $uri = props.uri ?? `${name}.template`;
  const uri = `${open ? 'expanded-' : ''}${$uri}` as const;

  function handleAddVariable() {
    const editor = getEditorByUri(uri);
    if (!monaco || !editor) {
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
  }

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
        uri.endsWith('.template') && (
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
        )
      }
    >
      <PromptEditor
        autoFocus={open}
        aria-invalid={error ? 'true' : undefined}
        className={cn(!open && 'max-h-96', 'min-h-16', className)}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        {...props}
        uri={uri}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </ExpandableField>
  );
}
