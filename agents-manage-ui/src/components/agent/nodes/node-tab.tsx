import type { FC, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NodeTabProps {
  isSelected: boolean;
  isDelegating?: boolean;
  children: ReactNode;
}

export const NodeTab: FC<NodeTabProps> = ({ isSelected, isDelegating, children }) => {
  return (
    <div
      className={cn(
        'px-2 py-0.5 rounded-t-md flex items-center gap-2 w-fit border border-b-0 font-medium font-mono text-xs uppercase',
        isSelected
          ? 'bg-primary border-primary text-white ring-2 ring-primary'
          : isDelegating
            ? 'bg-chart-2 border-chart-2 text-white ring-2 ring-chart-2'
            : 'bg-muted text-muted-foreground border-border'
      )}
    >
      {children}
    </div>
  );
};
