'use client';

import { useParams } from 'next/navigation';
import NextLink from 'next/link';
import { type ComponentProps, type FC, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';

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

export function ProjectSwitcher() {
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isMobile } = useSidebar();

  useEffect(() => {
    if (!tenantId) return;

    fetchProjectsAction(tenantId)
      .then((res) => {
        setIsLoading(false);
        setProjects(res.success && res.data ? res.data : []);
      })
      .catch((error) => {
        console.error('Error fetching projects:', error);
        setIsLoading(false);
        setProjects([]);
      });
  }, [tenantId]);

  if (isLoading) {
    return <Skeleton className="h-13" />;
  }
  if (!projects.length) {
    return <p className="px-2 text-sm text-muted-foreground">No projects yet</p>;
  }

  const selectedProject = projects.find((p) => p.projectId === projectId) as Project;
  const projectName = selectedProject.name || selectedProject.projectId;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
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
                    name={project.name || project.projectId}
                    description={project.description}
                    icon={project.projectId === projectId && Check}
                  />
                </NextLink>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setIsProjectDialogOpen(true);
              }}
            >
              <Plus />
              Create Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <NewProjectDialog
          tenantId={tenantId}
          open={isProjectDialogOpen}
          onOpenChange={setIsProjectDialogOpen}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
