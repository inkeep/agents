'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setOpen } = useSidebar();

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount.
  // Note: when the `open` prop is controlled via SidebarProvider (programmatic usage),
  // the `setOpen` callback is recreated whenever `open` changes, so we intentionally
  // avoid adding it to the dependency array.
  useEffect(() => {
    setOpen(false);
  }, []);

  return <ReactFlowProvider>{children}</ReactFlowProvider>;
};

export default Layout;
