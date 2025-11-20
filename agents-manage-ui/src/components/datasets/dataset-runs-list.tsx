'use client';

import { ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateAgo } from '@/app/utils/format-date';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DatasetRun } from '@/lib/api/dataset-runs';
import { fetchDatasetRuns } from '@/lib/api/dataset-runs';

interface DatasetRunsListProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  refreshKey?: number;
}

export function DatasetRunsList({
  tenantId,
  projectId,
  datasetId,
  refreshKey = 0,
}: DatasetRunsListProps) {
  const [runs, setRuns] = useState<DatasetRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRuns() {
      try {
        console.log('Loading dataset runs...');
        setLoading(true);
        setError(null);
        const response = await fetchDatasetRuns(tenantId, projectId, datasetId);
        console.log('Dataset runs loaded:', response.data?.length, 'items');
        setRuns(response.data || []);
      } catch (err) {
        console.error('Error loading dataset runs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      } finally {
        setLoading(false);
      }
    }

    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, projectId, datasetId, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No runs yet</CardTitle>
          <CardDescription>
            Create a new run to start running and evaluating your test cases.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.id} className="hover:bg-accent/50 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-base font-medium">
                  {run.runConfigName || `Run ${run.id.slice(0, 8)}`}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3" />
                  {formatDateAgo(run.createdAt)}
                </CardDescription>
              </div>
              <Link
                href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}/runs/${run.id}`}
              >
                <Button variant="ghost" size="sm">
                  View
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
