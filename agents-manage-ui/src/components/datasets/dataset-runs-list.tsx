'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDateAgo } from '@/app/utils/format-date';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const router = useRouter();
  const [runs, setRuns] = useState<DatasetRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRuns() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchDatasetRuns(tenantId, projectId, datasetId);
        setRuns(response.data || []);
      } catch (err) {
        console.error('Error loading dataset runs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      } finally {
        setLoading(false);
      }
    }

    loadRuns();
  }, [tenantId, projectId, datasetId, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i} noHover>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm font-medium text-destructive">Error</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm font-medium">No runs yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new run to start running and evaluating your test cases.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="cursor-pointer"
              onClick={() =>
                router.push(
                  `/${tenantId}/projects/${projectId}/datasets/${datasetId}/runs/${run.id}`
                )
              }
            >
              <TableCell className="font-medium">
                {run.runConfigName || `Run ${run.id.slice(0, 8)}`}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateAgo(run.createdAt)}
              </TableCell>
              <TableCell>
                <ChevronRight className="h-4 w-4" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
