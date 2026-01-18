import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ children, ...props }, ref) => {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      forceMount
      ref={ref}
      {...props}
      className={cn(
        'overflow-hidden [--radix-collapsible-content-height:0px] data-[state=closed]:hidden data-[state=closed]:animate-[collapse-out_200ms_cubic-bezier(0.3,0.0,0.8,0.15)] data-[state=open]:animate-[collapse-in_250ms_cubic-bezier(0.05,0.7,0.1,1.0)]',
        props.className
      )}
    >
      {children}
    </CollapsiblePrimitive.CollapsibleContent>
  );
});

CollapsibleContent.displayName = CollapsiblePrimitive.CollapsibleContent.displayName;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
