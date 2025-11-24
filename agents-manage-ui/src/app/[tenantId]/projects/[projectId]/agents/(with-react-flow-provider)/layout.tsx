'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { CopilotProvider } from '@/components/agent/copilot/copilot-context';
import { useAgentActions } from '@/features/agent/state/use-agent-store';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setSidebarOpen } = useAgentActions();

  useEffect(() => {
    setSidebarOpen({ isSidebarSessionOpen: false });
    return () => {
      setSidebarOpen({ isSidebarSessionOpen: true });
    };
  }, [setSidebarOpen]);

  return (
    <ReactFlowProvider>
      <CopilotProvider>{children}</CopilotProvider>
    </ReactFlowProvider>
  );
};

export default Layout;
