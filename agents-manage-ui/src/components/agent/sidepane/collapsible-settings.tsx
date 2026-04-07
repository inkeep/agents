import { ChevronRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CollapsibleSettingsProps extends Omit<ComponentProps<typeof Collapsible>, 'title'> {
  title: ReactNode;
}

export function CollapsibleSettings({
  title,
  children,
  className,
  ...props
}: CollapsibleSettingsProps) {
  return (
    <Collapsible
      className={cn('border rounded-md bg-muted/30 dark:bg-muted/20', className)}
      {...props}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center justify-start gap-1.5 p-0 h-auto font-normal text-xs text-foreground/80 dark:text-foreground/90 hover:text-foreground hover:bg-transparent! transition-colors group w-full py-2 px-4"
        >
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-8 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
