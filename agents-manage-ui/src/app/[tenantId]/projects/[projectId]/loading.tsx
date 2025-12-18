import { BodyTemplate } from '@/components/layout/body-template';
import BaseSkeleton from '../(index)/loading';

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
      <BaseSkeleton />
    </BodyTemplate>
  );
}
