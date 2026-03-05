import { useEffect, useRef } from 'react';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

export function useDefaultSubAgentIdRef() {
  'use memo';

  const form = useFullAgentFormContext();
  const defaultSubAgentIdRef = useRef<string | undefined>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    defaultSubAgentIdRef.current = form.getValues('defaultSubAgentId');

    // make sure to unsubscribe;
    return form.subscribe({
      name: ['defaultSubAgentId'],
      formState: { values: true },
      callback(data) {
        defaultSubAgentIdRef.current = data.values.defaultSubAgentId;
      },
    });
  }, []);

  return defaultSubAgentIdRef;
}
