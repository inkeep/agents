'use client';

import { BodyTemplate } from '@/components/layout/body-template';
import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';

export default function ProjectsLayout(props: LayoutProps<'/[tenantId]/projects'>) {
  const { projectId, tenantId, agentId } = useParams<{
    projectId?: string;
    tenantId: string;
    agentId?: string;
  }>();
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    const items: { label: string; href?: string }[] = [
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
    if (agentId) {
      items.push(
        { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: agentId }
      );
    }
    return items;
  }, [projectId, tenantId, agentId]);

  console.log({ projectId, tenantId, agentId, pathname });

  return <BodyTemplate breadcrumbs={breadcrumbs}>{props.children}</BodyTemplate>;
}
