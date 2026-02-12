'use client';

import { ChevronRight, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  const handleDelete = (jobConfig: EvaluationJobConfig) => {
    setDeletingJobConfig(jobConfig);
  };

  const formatFilters = (filters: EvaluationJobConfig['jobFilters']): string => {
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
      const startFormatted = formatDate(filterCriteria.dateRange.startDate, { local: true });
      const endFormatted = formatDate(filterCriteria.dateRange.endDate, { local: true });

      parts.push(`${startFormatted} - ${endFormatted}`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'No filters';
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12" />
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobConfigs.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={4} className="py-12">
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-muted-foreground">No batch evaluations yet</span>
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
                </TableCell>
              </TableRow>
            ) : isLoadingNames ? (
              [...jobConfigs].map((jobConfig) => (
                <TableRow key={jobConfig.id} noHover>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              [...jobConfigs]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map((jobConfig) => (
                  <TableRow
                    key={jobConfig.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(
                        `/${tenantId}/projects/${projectId}/evaluations/jobs/${jobConfig.id}`
                      )
                    }
                  >
                    <TableCell className="font-medium">
                      {formatFilters(jobConfig.jobFilters)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(jobConfig.updatedAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDelete(jobConfig)}
                            className="!text-destructive"
                          >
                            <Trash2 className="text-inherit" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
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
