import type { FC, ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const MainContent: FC<ComponentProps<'div'>> = ({ children, className, ...props }) => {
  return (
    <div className={cn('p-6', className)} {...props}>
      {children}
    </div>
  );
};
