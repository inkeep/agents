import { type HandleProps, Handle as ReactFlowHandle } from '@xyflow/react';
import { cn } from '@/lib/utils';

export function Handle({ className, ...props }: HandleProps) {
  return (
    <ReactFlowHandle
      {...props}
      className={cn(
        '!h-3 !w-3 !border-2 !border-border !bg-card dark:!bg-muted !shadow-sm',
        className
      )}
    />
  );
}
