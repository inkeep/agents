import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const MainContent = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('p-6', className)} {...props}>
        {children}
      </div>
    );
  }
);

MainContent.displayName = 'MainContent';
