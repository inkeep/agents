'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setSidebarOpen } = useAgentActions();

  useEffect(() => {
    setSidebarOpen({ isSidebarTemporarilyOpen: false });
  }, [setSidebarOpen]);

  return <ReactFlowProvider>{children}</ReactFlowProvider>;
};

export default Layout;
