import { cn } from '@/lib/utils';

export function Bubble({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        // `mt-2 py-3 px-4 border text-foreground rounded-lg max-w-full text-sm`,
        'text-sm text-gray-600 dark:text-white/60 my-2',
        className
      )}
      // onClick={onClick}
      // role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}

export function CodeBubble({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-xs text-muted-foreground border bg-muted/80 dark:bg-muted/50 rounded-sm p-0.5 px-1.5 font-mono',
        className
      )}
    >
      {children}
    </div>
  );
}
