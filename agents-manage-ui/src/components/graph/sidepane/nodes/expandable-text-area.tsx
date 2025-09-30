import { ExpandableField } from '@/components/form/expandable-field';
import { Textarea } from '@/components/ui/textarea';
import { useCursorToEnd } from '@/hooks/use-cursor-to-end';
import { Button } from '@/components/ui/button';
import { Braces } from 'lucide-react';
import { TooltipTrigger, Tooltip, TooltipContent } from '@/components/ui/tooltip';

function ExpandedTextArea({ ...props }) {
  const textareaRef = useCursorToEnd<HTMLTextAreaElement>();

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      className="w-full max-h-full resize-none h-full"
      autoFocus
    />
  );
}

export function ExpandableTextArea({
  label,
  isRequired = false,
  ...props
}: { label: string; isRequired?: boolean } & React.ComponentProps<typeof Textarea>) {
  return (
    <ExpandableField
      name={props.id || 'expandable-textarea'}
      label={label}
      isRequired={isRequired}
      compactView={
        <>
          <Textarea {...props} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-2.5 right-10 h-6 w-6 hover:text-foreground transition-all backdrop-blur-sm bg-white/90 hover:bg-white/95 dark:bg-card dark:hover:bg-accent border border-border shadow-md dark:shadow-lg"
                type="button"
              >
                <Braces className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Add variables &#123;</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Add variables{' '}
              <span className="font-mono bg-foreground text-background rounded py-0.5 px-1 ms-1">
                &#123;
              </span>
            </TooltipContent>
          </Tooltip>
        </>
      }
      expandedView={<ExpandedTextArea {...props} />}
    />
  );
}
