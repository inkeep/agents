'use client';

import {
  Activity,
  BookOpen,
  Component,
  Key,
  Layers,
  Library,
  LifeBuoy,
  Lock,
  type LucideIcon,
  Settings,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type * as React from 'react';
import { MCPIcon } from '@/components/icons/mcp-icon';
import { Logo } from '@/components/logo';
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
} from '@/components/ui/sidebar';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import type { NavItemProps } from './nav-item';

const bottomNavItems: NavItemProps[] = [
  {
    title: 'Support',
    url: 'mailto:support@inkeep.com',
    icon: LifeBuoy,
  },
  {
    title: 'Documentation',
    url: `${DOCS_BASE_URL}/`,
    icon: BookOpen,
    isExternal: true,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const { tenantId, projectId } = params;

  const topNavItems: NavItemProps[] =
    projectId && projectId !== 'undefined'
      ? [
          {
            title: 'Graphs',
            url: `/${tenantId}/projects/${projectId}/graphs`,
            icon: Workflow,
          },
          {
            title: 'Graph API Keys',
            url: `/${tenantId}/projects/${projectId}/api-keys`,
            icon: Key,
          },
          {
            title: 'MCP Servers',
            url: `/${tenantId}/projects/${projectId}/mcp-servers`,
            icon: MCPIcon as LucideIcon,
          },
          {
            title: 'Data Components',
            url: `/${tenantId}/projects/${projectId}/data-components`,
            icon: Component,
          },
          {
            title: 'Artifact Components',
            url: `/${tenantId}/projects/${projectId}/artifact-components`,
            icon: Library,
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
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between w-full gap-2">
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5 flex-1">
                <Link href={tenantId ? `/${tenantId}/projects` : '/'}>
                  <Logo className="!w-[110px] !h-[32px]" />
                </Link>
              </SidebarMenuButton>
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex flex-col justify-between">
        {topNavItems.length > 0 && <NavGroup items={topNavItems} />}
        <NavGroup items={bottomNavItems} />
      </SidebarContent>
      {tenantId && projectId && (
        <SidebarFooter>
          <ProjectSwitcher />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
