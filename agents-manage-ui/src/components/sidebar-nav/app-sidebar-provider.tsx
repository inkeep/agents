'use client';

import { type FC, type ReactNode, useCallback, useState } from 'react';
import { AppSidebar } from '@/components/sidebar-nav/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';

export const AppSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isSidebarHoverExpanded, setIsSidebarHoverExpanded] = useState(false);
  const isPinnedExpanded = useAgentStore(
    (state) => state.isSidebarPinnedOpen && state.isSidebarSessionOpen
  );
  const { setSidebarOpen } = useAgentActions();
  const isOpen = isPinnedExpanded || isSidebarHoverExpanded;

  const handleOpen = useCallback(
    (open: boolean) => {
      setSidebarOpen({
        isSidebarSessionOpen: open,
        isSidebarPinnedOpen: open,
      });
      setIsSidebarHoverExpanded(open);
    },
    [setSidebarOpen]
  );

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'calc(var(--spacing) * 62)',
        '--header-height': 'calc(var(--spacing) * 12)',
      } as React.CSSProperties}
      open={isOpen}
      onOpenChange={handleOpen}
    >
      <AppSidebar open={isOpen} setOpen={setIsSidebarHoverExpanded} />
      {children}
    </SidebarProvider>
  );
};
