'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';
import { ProjectSelector } from './project-selector';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeCheck, Bell, ChevronsUpDown, CreditCard, Plus, Sparkles } from 'lucide-react';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';

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

  const user = {
    name: 'Dimitri',
    email: 'dima@inkeep.com',
  };

  const selectedProject = projects.find((p) => p.projectId === projectId) as Project;
  const projectName = selectedProject.name || selectedProject.projectId;
  const foo = (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg uppercase">
                  {projectName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{projectName}</span>
                <span className="truncate text-xs">{tenantId}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
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

  return (
    <>
      {foo}
      <ProjectSelector projects={projects} selectedProjectId={projectId} tenantId={tenantId} />
    </>
  );
}
