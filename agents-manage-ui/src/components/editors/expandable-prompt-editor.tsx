import { Braces } from 'lucide-react';
import { type ComponentProps, type FC, type RefObject, useRef } from 'react';
import { ExpandableField } from '@/components/form/expandable-field';
import { PromptEditor as LegacyPromptEditor } from '@/components/form/prompt-editor';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PromptEditor } from '@/components/editors/prompt-editor';

// Extract inner type from RefObject<T>
type RefValue<T> = T extends RefObject<infer R> ? R : never;

const PromptEditorWithAddVariables: FC<ComponentProps<typeof LegacyPromptEditor>> = (props) => {
  const codemirrorRef = useRef<RefValue<typeof props.ref>>(null);
  const variablesText = 'Add variables';
  const tooltip = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute bottom-[9px] h-6 w-6 hover:text-foreground transition-all backdrop-blur-sm bg-white/90 hover:bg-white/95 dark:bg-card dark:hover:bg-accent border border-border shadow-md dark:shadow-lg z-1"
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
    </>
  );

  return (
    <div className="h-full relative">
      <LegacyPromptEditor ref={codemirrorRef} {...props}>
        {tooltip}
      </LegacyPromptEditor>
    </div>
  );
};

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
