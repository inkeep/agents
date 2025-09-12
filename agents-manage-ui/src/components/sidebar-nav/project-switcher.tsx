'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';
import { ProjectSelector } from './project-selector';

export function ProjectSwitcher() {
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const params = useParams();
  const tenantId = params.tenantId;
  const projectId = params.projectId;

  useEffect(() => {
    if (!tenantId) return;

    fetchProjectsAction(tenantId as string)
      .then((res) => {
        setIsLoading(false);
        if (res.success && res.data) {
          const projectResults = res.data;
          setProjects(projectResults);
        } else {
          setProjects([]);
        }
      })
      .catch((error) => {
        console.error('Error fetching projects:', error);
        setIsLoading(false);
        setProjects([]);
      });
  }, [tenantId]);

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <Skeleton className="h-14 w-full" />
      ) : projects.length === 0 ? (
        <div className="flex flex-col gap-2 px-2">
          <p className="text-sm text-muted-foreground">No projects yet</p>
          <NewProjectDialog tenantId={tenantId as string} />
        </div>
      ) : (
        <ProjectSelector
          projects={projects}
          selectedProjectId={projectId as string}
          tenantId={tenantId as string}
        />
      )}
    </div>
  );
}
