import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatProps {
  stat?: number | null;
  statDescription?: string;
  isLoading?: boolean;
  unit?: string;
}

export function Stat({ stat, statDescription, isLoading, unit }: StatProps) {
  const formattedStat =
    stat !== null && stat !== undefined ? new Intl.NumberFormat().format(stat) : 'N/A';

  return (
    <div className="flex flex-col gap-2 h-full justify-end">
      {isLoading && !stat ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <div
          className={cn(
            'text-3xl xl:text-4xl font-mono font-bold text-foreground',
            isLoading ? 'opacity-50' : ''
          )}
        >
          {formattedStat} {unit}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        {statDescription && (
          <div className="flex-1 text-sm text-muted-foreground">{statDescription}</div>
        )}
      </div>
    </div>
  );
}
