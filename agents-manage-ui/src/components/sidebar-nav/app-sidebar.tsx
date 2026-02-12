'use client';

import {
  Activity,
  BarChart3,
  BookOpen,
  Component,
  Globe,
  Key,
  Layers,
  Library,
  LifeBuoy,
  Lock,
  LucideHexagon,
  Plug,
  Settings,
  Users,
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
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { useAuthSession } from '@/hooks/use-auth';
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
  const { user } = useAuthSession();

  const isWorkAppsEnabled = process.env.NEXT_PUBLIC_ENABLE_WORK_APPS === 'true';

  const topNavItems: NavItemProps[] = projectId
    ? []
    : [
        {
          title: STATIC_LABELS.projects,
          url: `/${tenantId}/projects`,
          icon: Layers,
        },
        {
          title: STATIC_LABELS.stats,
          url: `/${tenantId}/stats`,
          icon: BarChart3,
        },
        ...(isWorkAppsEnabled
          ? [
              {
                title: STATIC_LABELS['work-apps'],
                url: `/${tenantId}/work-apps`,
                icon: Plug,
              },
            ]
          : []),
      ];

  const orgNavItems: NavItemProps[] = [
    {
      title: STATIC_LABELS.settings,
      url: `/${tenantId}/settings`,
      icon: Settings,
    },
  ];

  const configureNavItems: NavItemProps[] = projectId
    ? [
        {
          title: STATIC_LABELS.agents,
          url: `/${tenantId}/projects/${projectId}/agents`,
          icon: Workflow,
        },
        {
          title: STATIC_LABELS.skills,
          url: `/${tenantId}/projects/${projectId}/skills`,
          icon: LucideHexagon,
        },
        {
          title: STATIC_LABELS['api-keys'],
          url: `/${tenantId}/projects/${projectId}/api-keys`,
          icon: Key,
        },
        {
          title: STATIC_LABELS.settings,
          url: `/${tenantId}/projects/${projectId}/settings`,
          icon: Settings,
        },
        {
          title: 'Members',
          url: `/${tenantId}/projects/${projectId}/members`,
          icon: Users,
        },
      ]
    : [];

  const registerNavItems: NavItemProps[] = projectId
    ? [
        {
          title: STATIC_LABELS['mcp-servers'],
          url: `/${tenantId}/projects/${projectId}/mcp-servers`,
          icon: MCPIcon,
        },
        {
          title: STATIC_LABELS.credentials,
          url: `/${tenantId}/projects/${projectId}/credentials`,
          icon: Lock,
        },
        {
          title: STATIC_LABELS['external-agents'],
          url: `/${tenantId}/projects/${projectId}/external-agents`,
          icon: Globe,
        },
      ]
    : [];

  const uiNavItems: NavItemProps[] = projectId
    ? [
        {
          title: STATIC_LABELS.components,
          url: `/${tenantId}/projects/${projectId}/components`,
          icon: Component,
        },
        {
          title: STATIC_LABELS.artifacts,
          url: `/${tenantId}/projects/${projectId}/artifacts`,
          icon: Library,
        },
      ]
    : [];

  const monitorNavItems: NavItemProps[] = projectId
    ? [
        {
          title: STATIC_LABELS.traces,
          url: `/${tenantId}/projects/${projectId}/traces`,
          icon: Activity,
        },
        // Disabling test suites
        // {
        //   title: 'Test Suites',
        //   url: `/${tenantId}/projects/${projectId}/datasets`,
        //   icon: Database,
        // },
        {
          title: STATIC_LABELS.evaluations,
          url: `/${tenantId}/projects/${projectId}/evaluations`,
          icon: BarChart3,
        },
      ]
    : [];

  const handleHover: NonNullable<ComponentProps<'div'>['onMouseEnter']> = useCallback(
    throttle(200, (event) => {
      const isBlur = event.type === 'mouseleave';

      if (isBlur) {
        const blurToElement = event.relatedTarget;
        const insideMainContent =
          blurToElement &&
          blurToElement instanceof HTMLElement &&
          !!blurToElement.closest('#main-content');

        if (!insideMainContent) {
          return;
        }
      }
      setOpen(!isBlur);
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
          <div className="flex flex-col gap-1.5">
            <NavGroup items={topNavItems} />
            {user && <NavGroup label="Organization" items={orgNavItems} />}
          </div>
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
