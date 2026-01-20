'use client';

import type { ComponentProps, FC } from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends ComponentProps<'div'> {
  /** @default 0 */
  value?: number;
  /** @default 100 */
  max?: number;
  indicatorClassName?: string;
}

export const Progress: FC<ProgressProps> = ({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ...props
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className={cn('h-full bg-primary transition-all duration-300', indicatorClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};
