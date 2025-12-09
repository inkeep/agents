import { Braces } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useCallback, useRef, useState } from 'react';
import { PromptEditor, type PromptEditorHandle } from '@/components/editors/prompt-editor';
import { ExpandableField } from '@/components/form/expandable-field';
import { Button } from '@/components/ui/button';
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
  const editorRef = useRef<PromptEditorHandle>(null);
  const uri = `${open ? 'expanded-' : ''}${name}.template` as const;

  const handleAddVariable = useCallback(() => {
    editorRef.current?.insertVariableTrigger();
  }, []);

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
        aria-invalid={error ? 'true' : undefined}
        className={cn(!open && 'max-h-96', 'min-h-16', className)}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ExpandableField>
  );
}
