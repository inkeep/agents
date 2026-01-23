'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type ComponentProps, type FC, useCallback, useState } from 'react';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectsInvalidation, useProjectsQuery } from '@/lib/query/projects';

const ProjectItem: FC<{
  name: string;
  description: string;
  icon: FC<ComponentProps<'svg'>> | false;
  showIcon: boolean;
}> = ({ name, description, icon: Icon, showIcon }) => {
  return (
    <>
      {showIcon && (
        <Avatar className="h-8 w-8 rounded-lg">
          <AvatarFallback className="rounded-lg uppercase">{name.slice(0, 2)}</AvatarFallback>
        </Avatar>
      )}
      <div className="grid flex-1 gap-0.5 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground group-hover/project-switcher:text-sidebar-accent-foreground group-data-[state=open]/project-switcher:text-sidebar-accent-foreground">
          {description}
        </span>
      </div>
      {Icon && <Icon className="ml-auto size-4" />}
    </>
  );
};

export const ProjectSwitcher: FC = () => {
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isMobile, state } = useSidebar();
  const { data: projects, isFetching } = useProjectsQuery({ tenantId });
  const invalidateProjects = useProjectsInvalidation(tenantId);

  const handleCreateProject = useCallback(() => {
    setIsProjectDialogOpen(true);
  }, []);

  if (isFetching) {
    return <Skeleton className="h-12" />;
  }

  const projectName = projects.find((p) => p.projectId === projectId)?.name ?? 'Project not found';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="group/project-switcher data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <ProjectItem
            name={projectName}
            description={tenantId}
            icon={ChevronsUpDown}
            showIcon={state === 'collapsed'}
          />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg max-h-[min(var(--radix-dropdown-menu-content-available-height),300px)]"
        side={isMobile ? 'bottom' : 'right'}
        align="end"
        sideOffset={4}
      >
        {projects.map((project) => (
          <DropdownMenuItem key={project.projectId} asChild>
            <NextLink href={`/${tenantId}/projects/${project.projectId}/agents`}>
              <ProjectItem
                name={project.name}
                description={project.description}
                icon={project.projectId === projectId && Check}
                showIcon={false}
              />
            </NextLink>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="font-mono uppercase" onSelect={handleCreateProject}>
          <Plus />
          Create project
        </DropdownMenuItem>
      </DropdownMenuContent>
      <NewProjectDialog
        tenantId={tenantId}
        open={isProjectDialogOpen}
        onOpenChange={setIsProjectDialogOpen}
        onSuccess={invalidateProjects}
      />
    </DropdownMenu>
  );
};
