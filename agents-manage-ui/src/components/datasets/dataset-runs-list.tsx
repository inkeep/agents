'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
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
import { formatDateAgo } from '@/lib/utils/format-date';
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

  useEffect(() => {
    void refreshKey;
    loadRuns();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    loadRuns,
    refreshKey,
  ]);

  const columns: ColumnDef<DatasetRun>[] = [
    {
      id: 'name',
      accessorFn: (row) => row.runConfigName || `Run ${row.id.slice(0, 8)}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.runConfigName || `Run ${row.original.id.slice(0, 8)}`}
        </span>
      ),
    },
    {
      id: 'createdAt',
      accessorFn: (row) => new Date(row.createdAt),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDateAgo(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'chevron',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: () => <ChevronRight className="h-4 w-4" />,
    },
  ];

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
      <DataTable
        columns={columns}
        data={runs}
        defaultSort={[{ id: 'createdAt', desc: true }]}
        onRowClick={(run) =>
          router.push(`/${tenantId}/projects/${projectId}/datasets/${datasetId}/runs/${run.id}`)
        }
        getRowId={(row) => row.id}
      />
    </div>
  );
}
