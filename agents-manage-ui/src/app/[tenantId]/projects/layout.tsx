'use client';

import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';

export default function ProjectsLayout(props: LayoutProps<'/[tenantId]/projects'>) {
  // const { tenantId, projectId } = props;
  const { projectId, tenantId, agentId } = useParams<{
    projectId?: string;
    tenantId: string;
    agentId?: string;
  }>();
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    const items = [
      {
        label: 'Projects',
        href: `/${tenantId}/projects`,
      },
    ];
    if (projectId) {
      items.push({
        label: projectId,
        href: `/${tenantId}/projects/${projectId}`,
      });
    }
    return items;
  }, [projectId, tenantId]);

  console.log({ projectId, tenantId, agentId, pathname });

  return (
    <BodyTemplate breadcrumbs={breadcrumbs}>
      <MainContent>{props.children}</MainContent>
    </BodyTemplate>
  );
}
