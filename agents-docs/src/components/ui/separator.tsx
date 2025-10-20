'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { FC, ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const Separator: FC<ComponentProps<typeof SeparatorPrimitive.Root>> = ({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}) => (
  <SeparatorPrimitive.Root
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className
    )}
    {...props}
  />
);

export { Separator };
