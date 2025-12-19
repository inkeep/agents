import { BodyTemplate } from '@/components/layout/body-template';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Base loading skeleton for this route segment.
 * Scoped to the current level and not inherited by child segments.
 *
 * ✅ [projectId]/mcp-servers
 * ❌ [projectId]/mcp-servers/new
 */
export default function Loading() {
  return (
    <BodyTemplate breadcrumbs={[]}>
      <Skeleton className="h-7 mb-2" style={{ width: 70 }} />
      <Skeleton className="h-5 mb-8" style={{ width: 420 }} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    </BodyTemplate>
  );
}
