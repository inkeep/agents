import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import type { FC, ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent: FC<ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      {...props}
      className={cn(
        'overflow-hidden [--radix-collapsible-content-height:0px] data-[state=closed]:animate-fd-collapsible-up data-[state=open]:animate-fd-collapsible-down',
        className
      )}
    >
      {children}
    </CollapsiblePrimitive.CollapsibleContent>
  );
};

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
