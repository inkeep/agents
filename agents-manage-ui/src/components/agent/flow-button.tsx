import type { ComponentProps, FC } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const FlowButton: FC<ComponentProps<typeof Button>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn('normal-case justify-start font-sans font-normal backdrop-blur-3xl', className)}
      {...props}
    >
      {children}
    </Button>
  );
};
