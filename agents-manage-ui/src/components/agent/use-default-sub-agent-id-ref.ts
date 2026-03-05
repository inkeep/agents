import { useEffect, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

export function useDefaultSubAgentIdRef() {
  const { control } = useFullAgentFormContext();
  const defaultSubAgentId = useWatch({ control, name: 'defaultSubAgentId' });
  const defaultSubAgentIdRef = useRef(defaultSubAgentId);

  useEffect(() => {
    defaultSubAgentIdRef.current = defaultSubAgentId;
  }, [defaultSubAgentId]);

  return defaultSubAgentIdRef;
}
