'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { CopilotProvider } from '@/components/agent/copilot/copilot-context';
import { useSidebar } from '@/components/ui/sidebar';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  const { setOpen, open: initialOpen } = useSidebar();

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignore all deps
  useEffect(() => {
    // Always collapse sidebar
    setOpen(false);
    return () => {
      // Set initial open when leaving agents page
      setOpen(initialOpen);
    };
  }, []);

  return (
    <ReactFlowProvider>
      <CopilotProvider>{children}</CopilotProvider>
    </ReactFlowProvider>
  );
};

export default Layout;
