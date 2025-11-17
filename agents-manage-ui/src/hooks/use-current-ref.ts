'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Hook to get the current ref (branch/tag/commit) from URL params
 * Returns the ref parameter from the URL (base name only, without tenant/project prefix)
 *
 * The ref parameter is used by the API middleware to determine which
 * branch/tag/commit to use. The tenant/project prefix is automatically
 * inferred from the URL path.
 *
 * @returns The ref name if specified, otherwise undefined (API will default to 'main')
 */
export function useCurrentRef(): string | undefined {
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  // Return the ref if specified, otherwise undefined to let API use default
  return ref || undefined;
}

/**
 * Hook to get API request options with the current ref included
 * Use this to ensure all API requests include the current branch context
 *
 * @example
 * const refOptions = useRefOptions();
 * const agents = await fetchAgents(tenantId, projectId, refOptions);
 */
export function useRefOptions(): { queryParams: { ref?: string } } {
  const ref = useCurrentRef();

  return {
    queryParams: {
      ref,
    },
  };
}
