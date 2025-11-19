'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useProjectActions, useProjectStore } from '@/features/project/state/use-project-store';
import { fetchProjectAction } from '@/lib/actions/projects';

export function useProjectData() {
  const { tenantId, projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read project from store
  const project = useProjectStore((state) => state.project);
  const { setProject: setProjectStore } = useProjectActions();

  const storedProjectId = project?.projectId;

  useEffect(() => {
    async function fetchProject() {
      if (!tenantId || !projectId) {
        setLoading(false);
        return;
      }

      // If project is already in store and matches current projectId, skip fetch
      if (storedProjectId && storedProjectId === projectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use server action to fetch project data
        const result = await fetchProjectAction(tenantId as string, projectId as string);

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch project');
        }

        // Update store with fetched project data
        // This ensures the store is populated even if refreshAgentGraph hasn't been called yet
        if (result.data) {
          setProjectStore(result.data);
        }
      } catch (err) {
        console.error('Error fetching project:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    // Only fetch if project is not in store or doesn't match current projectId
    if (!storedProjectId || storedProjectId !== projectId) {
      fetchProject();
    } else {
      setLoading(false);
    }
  }, [tenantId, projectId, storedProjectId, setProjectStore]);

  return { project, loading, error };
}
