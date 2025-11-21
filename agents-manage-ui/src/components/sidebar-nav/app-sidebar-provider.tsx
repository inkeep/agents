'use client';

import { type FC, type ReactNode, useCallback, useState } from 'react';
import { AppSidebar } from '@/components/sidebar-nav/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';

export const AppSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const isSidebarOpen = useAgentStore((state) => state.isSidebarOpen);
  const { setIsSidebarOpen } = useAgentActions();
  const [isSidebarHoverOpen, setIsSidebarHoverOpen] = useState(false);
  const isOpen = isSidebarOpen || isSidebarHoverOpen;

  const handleOpen = useCallback((isOpen: boolean) => {
    setIsSidebarOpen(isOpen);
    setIsSidebarHoverOpen(isOpen);
  }, []);

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'calc(var(--spacing) * 62)',
        '--header-height': 'calc(var(--spacing) * 12)',
      }}
      open={isOpen}
      onOpenChange={handleOpen}
    >
      <AppSidebar open={isOpen} setOpen={setIsSidebarHoverOpen} />
      {children}
    </SidebarProvider>
  );
};
