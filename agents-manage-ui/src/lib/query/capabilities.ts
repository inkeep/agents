'use client';

import { useQuery } from '@tanstack/react-query';
import { type Capabilities, getCapabilitiesAction } from '@/lib/actions/capabilities';

const capabilitiesQueryKeys = {
  current: ['capabilities'] as const,
};

const defaultCapabilities: Capabilities = {
  sandbox: {
    configured: false,
  },
};

export function useCapabilitiesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';

  return useQuery<Capabilities>({
    queryKey: capabilitiesQueryKeys.current,
    async queryFn() {
      const response = await getCapabilitiesAction();
      if (!response.success || !response.data) {
        throw new Error(response.error);
      }

      return response.data;
    },
    enabled,
    initialData: defaultCapabilities,
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to load capabilities',
    },
  });
}
