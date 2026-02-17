import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="h-7" style={{ width: 200 }} />
        </div>
        <Skeleton className="h-9" style={{ width: 80 }} />
      </div>

      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4" style={{ width: 100 }} />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5" style={{ width: 140 }} />
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
