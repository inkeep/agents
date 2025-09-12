import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
}

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return (
    <div className={cn('flex items-start justify-between p-4 border-b', className)}>
      {/* Left section */}
      <div className="space-y-2">
        {/* Title skeleton */}
        <div className="h-5 w-24 bg-muted animate-pulse rounded" />
        {/* ID/Hash skeleton */}
        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Tool used badge skeleton */}
        <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />

        {/* Service name skeleton */}
        <div className="h-6 w-32 bg-muted animate-pulse rounded-full" />

        {/* Error badge skeleton */}
        <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
      </div>
    </div>
  );
}
