import type { FC } from 'react';

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/skills'>> = ({
  children,
  modal,
}) => {
  return (
    <>
      {children}
      {modal}
    </>
  );
};

export default Layout;
