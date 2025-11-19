'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchProjectAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';
import { useCurrentRef } from './use-current-ref';

export function useProjectData() {
  const { tenantId, projectId } = useParams();

  const ref = useCurrentRef();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      if (!tenantId || !projectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use server action to fetch project data
        const result = await fetchProjectAction(tenantId as string, projectId as string, ref);

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch project');
        }

        setProject(result.data || null);
      } catch (err) {
        console.error('Error fetching project:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setProject(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [tenantId, projectId, ref]);

  return { project, loading, error };
}
