'use client';

import { useEffect } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';

export function useInitialCollapsedSidebar() {
  const { setSidebarOpen } = useAgentActions();

  useEffect(() => {
    setSidebarOpen({ isSidebarSessionOpen: false });

    return () => {
      setSidebarOpen({ isSidebarSessionOpen: true });
    };
  }, []);
}
