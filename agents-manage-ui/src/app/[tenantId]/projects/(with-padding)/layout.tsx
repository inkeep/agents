import type { FC } from 'react';

const WithPaddingLayout: FC<LayoutProps<'/[tenantId]/projects'>> = ({ children }) => {
  return <div className="p-6 grow">{children}</div>;
};

export default WithPaddingLayout;
