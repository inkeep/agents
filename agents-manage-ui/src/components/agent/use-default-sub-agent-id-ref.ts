import { useEffect, useRef } from 'react';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useWatch } from 'react-hook-form';

export function useDefaultSubAgentIdRef() {
  const { control } = useFullAgentFormContext();
  const defaultSubAgentId = useWatch({ control, name: 'defaultSubAgentId' });
  const defaultSubAgentIdRef = useRef(defaultSubAgentId);

  useEffect(() => {
    defaultSubAgentIdRef.current = defaultSubAgentId;
  }, [defaultSubAgentId]);

  return defaultSubAgentIdRef;
}
