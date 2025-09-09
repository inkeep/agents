import { cn } from '@/lib/utils';

interface NodeTabProps {
  selected: boolean;
  children: React.ReactNode;
}

export function NodeTab({ selected, children }: NodeTabProps) {
  return (
    <div
      className={cn(
        ' px-2 py-0.5 rounded-t-md flex items-center gap-2 w-fit border border-b-0 font-medium font-mono text-xs uppercase',
        selected
          ? 'bg-primary border-primary text-white ring-2 ring-primary'
          : 'bg-muted text-muted-foreground border-border'
      )}
    >
      {children}
    </div>
  );
}
