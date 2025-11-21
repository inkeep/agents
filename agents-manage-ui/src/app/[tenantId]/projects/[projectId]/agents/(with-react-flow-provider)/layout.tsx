'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setOpen } = useSidebar();
  useEffect(() => {
    // Always collapse sidebar
    setOpen(false);
  }, [setOpen]);

  return <ReactFlowProvider>{children}</ReactFlowProvider>;
};

export default Layout;
