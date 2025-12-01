import { Skeleton } from '../ui/skeleton';

export function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-25 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
