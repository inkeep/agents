import { ExpandableField } from '@/components/form/expandable-field';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Braces } from 'lucide-react';
import type { ComponentProps } from 'react';

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
  const ref = useRef(undefined);
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
          onClick={() => {
            console.log('111', ref.current?.addVariables);
            ref.current?.addVariables();
          }}
        >
          <Braces className="size-3.5" />
          Add variables
        </Button>
      }
    >
      <PromptEditor ref={ref} uri={`${props.id}.template`} hasDynamicHeight={!open} {...props} />
    </ExpandableField>
  );
}
