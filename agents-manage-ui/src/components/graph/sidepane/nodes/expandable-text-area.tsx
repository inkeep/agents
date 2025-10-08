import { Braces } from 'lucide-react';
import { type ComponentProps, type FC, type RefObject, useRef } from 'react';
import { ExpandableField } from '@/components/form/expandable-field';
import { PromptEditor } from '@/components/form/prompt-editor';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Extract inner type from RefObject<T>
type RefValue<T> = T extends RefObject<infer R> ? R : never;

const PromptEditorWithAddVariables: FC<
  ComponentProps<typeof PromptEditor> & {
    tooltipClassName: string;
  }
> = ({ tooltipClassName, ...props }) => {
  const codemirrorRef = useRef<RefValue<typeof props.ref>>(null as any);
  const variablesText = 'Add variables';
  return (
    <div className="h-full relative">
      <PromptEditor ref={codemirrorRef} {...props} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'absolute bottom-2.5 h-6 w-6 hover:text-foreground transition-all backdrop-blur-sm bg-white/90 hover:bg-white/95 dark:bg-card dark:hover:bg-accent border border-border shadow-md dark:shadow-lg',
              tooltipClassName
            )}
            type="button"
            onClick={() => {
              codemirrorRef.current?.insertTemplateVariable();
            }}
          >
            <Braces className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{variablesText}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{variablesText}</TooltipContent>
      </Tooltip>
    </div>
  );
};

export function ExpandableTextArea({
  label,
  isRequired = false,
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
      compactView={<PromptEditorWithAddVariables {...props} tooltipClassName="right-10" />}
      expandedView={
        <PromptEditorWithAddVariables
          {...props}
          autoFocus
          className="[&>.cm-editor]:h-full"
          tooltipClassName="right-2.5"
        />
      }
    />
  );
}
