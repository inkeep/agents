'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setOpen } = useSidebar();

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount, explicitly ignore `setOpen`
  useEffect(() => {
    setOpen(false);
  }, []);

  return <ReactFlowProvider>{children}</ReactFlowProvider>;
};

export default Layout;
