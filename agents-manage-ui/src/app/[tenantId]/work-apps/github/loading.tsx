import { Skeleton } from '@/components/ui/skeleton';

export default function GitHubSettingsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-48" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
