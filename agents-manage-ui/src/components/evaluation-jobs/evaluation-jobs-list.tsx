'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';
import type {
  EvaluationJobConfig,
  EvaluationJobFilterCriteria,
} from '@/lib/api/evaluation-job-configs';
import { formatDate } from '@/lib/utils/format-date';
import { DeleteEvaluationJobConfirmation } from './delete-evaluation-job-confirmation';
import { EvaluationJobFormDialog } from './evaluation-job-form-dialog';

interface EvaluationJobsListProps {
  tenantId: string;
  projectId: string;
  jobConfigs: EvaluationJobConfig[];
}

export function EvaluationJobsList({ tenantId, projectId, jobConfigs }: EvaluationJobsListProps) {
  const router = useRouter();
  const [deletingJobConfig, setDeletingJobConfig] = useState<EvaluationJobConfig | undefined>();
  const [datasetRunNames, setDatasetRunNames] = useState<Record<string, string>>({});
  const [isLoadingNames, setIsLoadingNames] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    const fetchRunNames = async () => {
      setIsLoadingNames(true);
      const runIds = new Set<string>();
      jobConfigs.forEach((config) => {
        const criteria = config.jobFilters as EvaluationJobFilterCriteria;
        if (criteria?.datasetRunIds) {
          criteria.datasetRunIds.forEach((id) => {
            runIds.add(id);
          });
        }
      });

      const names: Record<string, string> = {};
      for (const runId of runIds) {
        try {
          const response = await fetchDatasetRun(tenantId, projectId, runId);
          names[runId] = response.data?.runConfigName || `Run ${runId.slice(0, 8)}`;
        } catch {
          names[runId] = `Run ${runId.slice(0, 8)}`;
        }
      }
      setDatasetRunNames(names);
      setIsLoadingNames(false);
    };

    if (jobConfigs.length > 0) {
      fetchRunNames();
    } else {
      setIsLoadingNames(false);
    }
  }, [jobConfigs, tenantId, projectId]);

  const formatFilters = useCallback(
    (filters: EvaluationJobConfig['jobFilters']): string => {
      if (!filters) return 'No filters';
      const filterCriteria = filters as EvaluationJobFilterCriteria;
      const parts: string[] = [];

      if (
        filterCriteria.datasetRunIds &&
        Array.isArray(filterCriteria.datasetRunIds) &&
        filterCriteria.datasetRunIds.length > 0
      ) {
        const runNames = filterCriteria.datasetRunIds
          .map((id) => datasetRunNames[id] || `Run ${id.slice(0, 8)}`)
          .join(', ');
        parts.push(runNames);
      }

      if (filterCriteria.dateRange?.startDate && filterCriteria.dateRange?.endDate) {
        const startDate = new Date(filterCriteria.dateRange.startDate);
        const endDate = new Date(filterCriteria.dateRange.endDate);

        const startFormatted = startDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const endFormatted = endDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        parts.push(`${startFormatted} - ${endFormatted}`);
      }

      return parts.length > 0 ? parts.join(' • ') : 'No filters';
    },
    [datasetRunNames]
  );

  const columns: ColumnDef<EvaluationJobConfig>[] = [
    {
      id: 'name',
      accessorFn: (row) => formatFilters(row.jobFilters),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) =>
        isLoadingNames ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <span className="font-medium">{formatFilters(row.original.jobFilters)}</span>
        ),
    },
    {
      id: 'updatedAt',
      accessorFn: (row) => new Date(row.updatedAt),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      sortingFn: 'datetime',
      cell: ({ row }) =>
        isLoadingNames ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: ({ row }) =>
        isLoadingNames ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingJobConfig(row.original);
                }}
                variant="destructive"
              >
                <Trash2 className="text-inherit" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
    {
      id: 'chevron',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: () =>
        isLoadingNames ? (
          <Skeleton className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ),
    },
  ];

  return (
    <>
      <div className="rounded-lg border">
        <DataTable
          columns={columns}
          data={jobConfigs}
          defaultSort={[{ id: 'updatedAt', desc: true }]}
          getRowId={(row) => row.id}
          onRowClick={(jobConfig) =>
            router.push(`/${tenantId}/projects/${projectId}/evaluations/jobs/${jobConfig.id}`)
          }
          emptyState={
            <div className="flex flex-col items-center gap-4">
              <span>No batch evaluations yet</span>
              <EvaluationJobFormDialog
                tenantId={tenantId}
                projectId={projectId}
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Add first batch evaluation
                  </Button>
                }
              />
            </div>
          }
        />
      </div>

      {deletingJobConfig && (
        <DeleteEvaluationJobConfirmation
          tenantId={tenantId}
          projectId={projectId}
          jobConfig={deletingJobConfig}
          isOpen={!!deletingJobConfig}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingJobConfig(undefined);
            }
          }}
        />
      )}
    </>
  );
}
