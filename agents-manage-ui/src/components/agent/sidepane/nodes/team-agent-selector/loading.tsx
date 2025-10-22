import { Skeleton } from '@/components/ui/skeleton';

interface TeamAgentSelectorLoadingProps {
  title: string;
}

export function TeamAgentSelectorLoading({ title }: TeamAgentSelectorLoadingProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <div className="flex flex-col gap-2">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="w-full p-3 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 rounded flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
