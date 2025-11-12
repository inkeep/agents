'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';
import { ProjectSelector } from './project-selector';

export function ProjectSwitcher() {
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

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
  return <ProjectSelector projects={projects} selectedProjectId={projectId} tenantId={tenantId} />;
}
