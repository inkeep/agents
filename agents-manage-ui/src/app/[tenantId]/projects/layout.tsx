import type { FC } from 'react';

const ProjectsLayout: FC<LayoutProps<'/[tenantId]/projects'>> = ({ children, modal }) => {
  return (
    <>
      {children}
      {modal}
    </>
  );
};

export default ProjectsLayout;
