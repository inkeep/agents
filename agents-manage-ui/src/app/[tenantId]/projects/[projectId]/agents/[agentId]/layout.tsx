'use client';

import { ReactFlowProvider } from '@xyflow/react';
import type { FC } from 'react';
import { CopilotProvider } from '@/contexts/copilot';
import { useInitialCollapsedSidebar } from '@/hooks/use-initial-collapsed-sidebar';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = ({
  children,
}) => {
  useInitialCollapsedSidebar();

  return (
    <ReactFlowProvider>
      <CopilotProvider>{children}</CopilotProvider>
    </ReactFlowProvider>
  );
};

export default Layout;
