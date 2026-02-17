'use client';

import { type FC, type ReactNode, useState } from 'react';
import { AppSidebar } from '@/components/sidebar-nav/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';

export const AppSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  'use memo';
  const [isSidebarHoverExpanded, setIsSidebarHoverExpanded] = useState(false);
  const isPinnedExpanded = useAgentStore(
    (state) => state.isSidebarPinnedOpen && state.isSidebarSessionOpen
  );
  const { setSidebarOpen } = useAgentActions();
  const isOpen = isPinnedExpanded || isSidebarHoverExpanded;

  const handleOpen = (open: boolean) => {
    const newOpen =
      open ||
      // If the sidebar is expanded via hover and the user clicks the toggle,
      // keep the sidebar open (persist the expanded state).
      !isPinnedExpanded;
    setSidebarOpen({
      isSidebarSessionOpen: newOpen,
      isSidebarPinnedOpen: newOpen,
    });
    setIsSidebarHoverExpanded(newOpen);
  };

  return (
    <SidebarProvider
      style={{
        // @ts-expect-error
        '--sidebar-width': 'calc(var(--spacing) * 62)',
        '--header-height': 'calc(var(--spacing) * 12)',
      }}
      open={isOpen}
      onOpenChange={handleOpen}
    >
      <AppSidebar open={isOpen} setOpen={setIsSidebarHoverExpanded} />
      {children}
    </SidebarProvider>
  );
};
