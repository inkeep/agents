'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type ComponentProps, type FC, useCallback, useEffect, useState } from 'react';
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
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';

const ProjectItem: FC<{
  name: string;
  description: string;
  icon: FC<ComponentProps<'svg'>> | false;
}> = ({ name, description, icon: Icon }) => {
  return (
    <>
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarFallback className="rounded-lg uppercase">{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs">{description}</span>
      </div>
      {Icon && <Icon className="ml-auto size-4" />}
    </>
  );
};

export const ProjectSwitcher: FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isMobile } = useSidebar();

  const handleCreateProject = useCallback(() => {
    setIsProjectDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    fetchProjectsAction(tenantId)
      .then((res) => (res.success && res.data ? res.data : []))
      .catch((error) => {
        console.error('Error fetching projects:', error);
        return [] as Project[];
      })
      .then((projects) => {
        setIsLoading(false);
        setProjects(projects);
      });
  }, [tenantId]);

  if (isLoading) {
    return <Skeleton className="h-12" />;
  }

  const projectName = projects.find((p) => p.projectId === projectId)?.name ?? 'Project not found';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <ProjectItem name={projectName} description={tenantId} icon={ChevronsUpDown} />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
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
              />
            </NextLink>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="font-mono uppercase" onSelect={handleCreateProject}>
          <Plus />
          Create Project
        </DropdownMenuItem>
      </DropdownMenuContent>
      <NewProjectDialog
        tenantId={tenantId}
        open={isProjectDialogOpen}
        onOpenChange={setIsProjectDialogOpen}
      />
    </DropdownMenu>
  );
};
