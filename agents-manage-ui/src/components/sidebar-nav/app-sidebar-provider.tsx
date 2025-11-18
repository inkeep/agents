'use client';

import { type FC, type ReactNode, useState } from 'react';
import { AppSidebar } from '@/components/sidebar-nav/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

export const AppSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarOpenInternal, setSidebarOpenInternal] = useState(false);
  const isOpen = isSidebarOpen || isSidebarOpenInternal;

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'calc(var(--spacing) * 62)',
        '--header-height': 'calc(var(--spacing) * 12)',
      }}
      open={isOpen}
      onOpenChange={setIsSidebarOpen}
    >
      <AppSidebar open={isOpen} setOpen={setSidebarOpenInternal} />
      {children}
    </SidebarProvider>
  );
};
