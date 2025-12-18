'use client';

import { BodyTemplate } from '@/components/layout/body-template';
import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const SEGMENT_LABELS: Record<string, string> = {
  projects: 'Projects',
  agents: 'Agents',
  'api-keys': 'API keys',
  settings: 'Settings',
  'mcp-servers': 'MCP servers',
  credentials: 'Credentials',
  'external-agents': 'External agents',
  components: 'Components',
  artifacts: 'Artifacts',
  traces: 'Traces',
  // conversations: 'Conversations',
  // 'ai-calls': 'AI calls',
  // 'tool-calls': 'Tool calls',
  // new: 'New',
  edit: 'Edit',
  providers: 'Providers',
  bearer: 'Bearer',
};

export default function ProjectsLayout(props: LayoutProps<'/[tenantId]/projects'>) {
  const { projectId, tenantId, agentId } = useParams<{
    projectId?: string;
    tenantId: string;
    agentId?: string;
  }>();
  const pathname = usePathname();

  type Item = { label: string; href?: string };
  const breadcrumbs: Item[] = useMemo(() => {
    const [tenantId, ...segments] = pathname.split('/').slice(1);
    let url = `/${tenantId}`;

    return segments.map((name, index, array) => {
      const isLast = index === array.length - 1;
      url += `/${name}`;

      const label = [0, 2, 4].includes(index) ? SEGMENT_LABELS[name] : name;

      if (!label) {
        throw new Error(`Label "${name}" is not defined`);
      }

      return {
        label,
        href: isLast ? undefined : url,
      };
    });

    // const items: { label: string; href?: string }[] = [
    //   {
    //     label: 'Projects',
    //     href: `/${tenantId}/projects`,
    //   },
    // ];
    // if (projectId) {
    //   items.push({
    //     label: projectId,
    //     href: `/${tenantId}/projects/${projectId}`,
    //   });
    // }
    // if (agentId) {
    //   items.push(
    //     { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
    //     { label: agentId }
    //   );
    // }
    // return items;
  }, [pathname]);

  // console.log({ projectId, tenantId, agentId, pathname });

  return (
    <BodyTemplate breadcrumbs={breadcrumbs} className={cn(agentId && 'p-0')}>
      {props.children}
    </BodyTemplate>
  );
}
