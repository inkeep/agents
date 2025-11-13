import { ReactFlowProvider } from '@xyflow/react';
import type { FC } from 'react';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents'>> = ({ children }) => {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
};

export default Layout;
