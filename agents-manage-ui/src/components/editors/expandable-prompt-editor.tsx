import { ExpandableField } from '@/components/form/expandable-field';
import { cn } from '@/lib/utils';
import { PromptEditor } from '@/components/editors/prompt-editor';

export function ExpandablePromptEditor({
  label,
  isRequired = false,
  className,
  ...props
}: {
  label: string;
  isRequired?: boolean;
} & React.ComponentProps<typeof PromptEditor>) {
  return (
    <ExpandableField
      name={props.id || 'expandable-textarea'}
      label={label}
      isRequired={isRequired}
      compactView={<PromptEditor className={cn('max-h-96', className)} {...props} />}
      expandedView={
        <PromptEditor autoFocus {...props} hasDynamicHeight={false} className={className} />
      }
    />
  );
}
