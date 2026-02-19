import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-25 w-full rounded-lg" />
    </div>
  );
}
