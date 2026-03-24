import { useEffect, useRef } from 'react';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

export function useDefaultSubAgentNodeIdRef() {
  'use memo';

  const form = useFullAgentFormContext();
  const defaultSubAgentNodeIdRef = useRef<string | undefined>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    defaultSubAgentNodeIdRef.current = form.getValues('defaultSubAgentNodeId');

    // make sure to unsubscribe;
    return form.subscribe({
      name: ['defaultSubAgentNodeId'],
      formState: { values: true },
      callback(data) {
        defaultSubAgentNodeIdRef.current = data.values.defaultSubAgentNodeId;
      },
    });
  }, []);

  return defaultSubAgentNodeIdRef;
}
