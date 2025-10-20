'use client';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { FC, ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent: FC<ComponentProps<typeof PopoverPrimitive.Content>> = ({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      side="bottom"
      className={cn(
        'z-50 min-w-[220px] max-w-[98vw] rounded-lg border bg-fd-popover p-2 text-sm text-fd-popover-foreground shadow-lg focus-visible:outline-none data-[state=closed]:animate-fd-popover-out data-[state=open]:animate-fd-popover-in',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);

const PopoverClose = PopoverPrimitive.PopoverClose;

export { Popover, PopoverTrigger, PopoverContent, PopoverClose, PopoverAnchor };
