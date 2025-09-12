import { Skeleton } from '@/components/ui/skeleton';

interface MCPSelectorLoadingProps {
  title: string;
}

export function MCPSelectorLoading({ title }: MCPSelectorLoadingProps) {
  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">{title}</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full h-[72px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
