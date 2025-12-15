import { Braces } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { useCallback, useRef, useState } from 'react';
import { PromptEditor, type PromptEditorHandle } from '@/components/editors/prompt-editor';
import { ExpandableField } from '@/components/form/expandable-field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { extractInvalidVariables } from '@/components/editors/prompt-editor-utils';

type PromptEditorProps = ComponentPropsWithoutRef<typeof PromptEditor> & {
  name: string;
};

const engFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

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
  const editorRef = useRef<PromptEditorHandle>(null);

  const handleAddVariable = useCallback(() => {
    editorRef.current?.insertVariableTrigger();
  }, []);

  const id = `${name}-label`;
  const variableSuggestions = useMonacoStore((state) => state.variableSuggestions);

  const allErrors =
    error ||
    ((invalidVariables: string[]) => {
      if (invalidVariables.length) {
        return `Unknown variables: ${engFormatter.format(invalidVariables)}`;
      }
    })(extractInvalidVariables(props.value ?? '', variableSuggestions));

  return (
    <ExpandableField
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      isRequired={isRequired}
      hasError={!!error}
      onLabelClick={() => editorRef.current?.focus()}
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
        ref={editorRef}
        autoFocus={open}
        aria-invalid={allErrors ? 'true' : undefined}
        className={cn(!open && 'max-h-96', 'min-h-16', className)}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        {...props}
      />
      {allErrors && <p className="text-sm text-red-600">{allErrors}</p>}
    </ExpandableField>
  );
}
