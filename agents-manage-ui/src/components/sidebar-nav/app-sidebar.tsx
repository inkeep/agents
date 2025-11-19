'use client';

import {
  Activity,
  BarChart3,
  BookOpen,
  Component,
  Database,
  Globe,
  Key,
  Layers,
  Library,
  LifeBuoy,
  Lock,
  Settings,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ComponentProps, type Dispatch, type FC, useCallback } from 'react';
import { MCPIcon } from '@/components/icons/mcp-icon';
import { NavGroup } from '@/components/sidebar-nav/nav-group';
import { ProjectSwitcher } from '@/components/sidebar-nav/project-switcher';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { InkeepLogo } from '@/icons';
import { cn } from '@/lib/utils';
import { throttle } from '@/lib/utils/throttle';
import type { NavItemProps } from './nav-item';

const bottomNavItems: NavItemProps[] = [
  {
    title: 'Support',
    url: 'mailto:support@inkeep.com',
    icon: LifeBuoy,
  },
  {
    title: 'Documentation',
    url: DOCS_BASE_URL,
    icon: BookOpen,
    isExternal: true,
  },
];

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  open: boolean;
  setOpen: Dispatch<boolean>;
}

export const AppSidebar: FC<AppSidebarProps> = ({ open, setOpen, ...props }) => {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId?: string }>();

  const topNavItems: NavItemProps[] = projectId
    ? []
    : [
        {
          title: 'Projects',
          url: `/${tenantId}/projects`,
          icon: Layers,
        },
      ];

  const configureNavItems: NavItemProps[] = projectId
    ? [
        {
          title: 'Agents',
          url: `/${tenantId}/projects/${projectId}/agents`,
          icon: Workflow,
        },
        {
          title: 'API Keys',
          url: `/${tenantId}/projects/${projectId}/api-keys`,
          icon: Key,
        },
        {
          title: 'Settings',
          url: `/${tenantId}/projects/${projectId}/settings`,
          icon: Settings,
        },
      ]
    : [];

  const registerNavItems: NavItemProps[] = projectId
    ? [
        {
          title: 'MCP Servers',
          url: `/${tenantId}/projects/${projectId}/mcp-servers`,
          icon: MCPIcon,
        },
        {
          title: 'External Agents',
          url: `/${tenantId}/projects/${projectId}/external-agents`,
          icon: Globe,
        },
        {
          title: 'Credentials',
          url: `/${tenantId}/projects/${projectId}/credentials`,
          icon: Lock,
        },
      ]
    : [];

  const uiNavItems: NavItemProps[] = projectId
    ? [
        {
          title: 'Components',
          url: `/${tenantId}/projects/${projectId}/components`,
          icon: Component,
        },
        {
          title: 'Artifacts',
          url: `/${tenantId}/projects/${projectId}/artifacts`,
          icon: Library,
        },
      ]
    : [];

  const monitorNavItems: NavItemProps[] = projectId
    ? [
        {
          title: 'Traces',
          url: `/${tenantId}/projects/${projectId}/traces`,
          icon: Activity,
        },
        {
          title: 'Test Suites',
          url: `/${tenantId}/projects/${projectId}/datasets`,
          icon: Database,
        },
        {
          title: 'Evaluations',
          url: `/${tenantId}/projects/${projectId}/evaluations`,
          icon: BarChart3,
        },
      ]
    : [];

  const handleHover: NonNullable<ComponentProps<'div'>['onMouseEnter']> = useCallback(
    throttle(200, (event) => {
      setOpen(event.type === 'mouseenter');
    }),
    []
  );

  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      onMouseEnter={handleHover}
      onMouseLeave={handleHover}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenuButton asChild>
          <Link href={`/${tenantId}/projects`}>
            <InkeepLogo
              role="img"
              aria-label="Inkeep Logo"
              className={cn(
                'transition-all text-[#231F20] dark:text-white h-auto!',
                open ? 'w-28!' : 'w-19.5!'
              )}
            />
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent className="justify-between">
        {projectId ? (
          <div className="flex flex-col gap-1.5">
            <NavGroup items={configureNavItems} />
            <NavGroup label="Register" items={registerNavItems} />
            <NavGroup label="UI" items={uiNavItems} />
            <NavGroup label="Monitor" items={monitorNavItems} />
          </div>
        ) : (
          <NavGroup items={topNavItems} />
        )}
        <NavGroup items={bottomNavItems} />
      </SidebarContent>
      {projectId && (
        <SidebarFooter>
          <ProjectSwitcher />
        </SidebarFooter>
      )}
    </Sidebar>
  );
};
