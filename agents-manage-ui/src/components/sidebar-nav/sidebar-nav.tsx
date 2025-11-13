'use client';

import {
  Activity,
  BookOpen,
  Component,
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
import type * as React from 'react';
import { MCPIcon } from '@/components/icons/mcp-icon';
import { NavGroup } from '@/components/sidebar-nav/nav-group';
import { ProjectSwitcher } from '@/components/sidebar-nav/project-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { InkeepLogo } from '@/icons';
import { cn } from '@/lib/utils';
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

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId?: string }>();
  const { open } = useSidebar();

  const topNavItems: NavItemProps[] = projectId
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
        {
          title: 'Traces',
          url: `/${tenantId}/projects/${projectId}/traces`,
          icon: Activity,
        },
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
        {
          title: 'Settings',
          url: `/${tenantId}/projects/${projectId}/settings`,
          icon: Settings,
        },
      ]
    : [
        {
          title: 'Projects',
          url: `/${tenantId}/projects`,
          icon: Layers,
        },
      ];

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1">
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
            <ThemeToggle className={cn(!open && 'hidden')} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="justify-between">
        <NavGroup items={topNavItems} />
        <NavGroup items={bottomNavItems} />
      </SidebarContent>
      {projectId && (
        <SidebarFooter>
          <ProjectSwitcher />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
