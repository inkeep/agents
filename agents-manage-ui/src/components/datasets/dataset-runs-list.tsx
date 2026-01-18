'use client';

import { ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDateAgo } from '@/app/utils/format-date';
import { Button } from '@/components/ui/button';
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
import { DatasetRunConfigFormDialog } from './dataset-run-config-form-dialog';

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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const loadRuns = useCallback(async () => {
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
  }, [tenantId, projectId, datasetId]);

  useEffect(() => {
    // refreshKey triggers reload when incremented
    void refreshKey;
    loadRuns();
  }, [loadRuns, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
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
      <div className="rounded-lg border py-12">
        <div className="flex flex-col items-center gap-4">
          <span className="text-muted-foreground">No runs yet</span>
          <DatasetRunConfigFormDialog
            tenantId={tenantId}
            projectId={projectId}
            datasetId={datasetId}
            isOpen={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
            onSuccess={() => {
              loadRuns();
              router.refresh();
            }}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Add first run
              </Button>
            }
          />
        </div>
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
            <TableHead className="w-12" />
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
