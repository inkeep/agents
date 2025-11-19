'use client';

import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate, formatDateTimeTable } from '@/app/utils/format-date';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { DeleteEvaluationJobConfirmation } from './delete-evaluation-job-confirmation';
import { EvaluationJobFormDialog } from './evaluation-job-form-dialog';

interface EvaluationJobsListProps {
  tenantId: string;
  projectId: string;
  jobConfigs: EvaluationJobConfig[];
}

export function EvaluationJobsList({ tenantId, projectId, jobConfigs }: EvaluationJobsListProps) {
  const [editingJobConfig, setEditingJobConfig] = useState<EvaluationJobConfig | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingJobConfig, setDeletingJobConfig] = useState<EvaluationJobConfig | undefined>();
  const [datasetRunNames, setDatasetRunNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchRunNames = async () => {
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
    };

    if (jobConfigs.length > 0) {
      fetchRunNames();
    }
  }, [jobConfigs, tenantId, projectId]);

  const handleEdit = (jobConfig: EvaluationJobConfig) => {
    setEditingJobConfig(jobConfig);
    setIsEditDialogOpen(true);
  };

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
      const startFormatted = formatDate(filterCriteria.dateRange.startDate);
      const endFormatted = formatDate(filterCriteria.dateRange.endDate);
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
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobConfigs.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No batch evaluations yet. Click &quot;+ New batch evaluation&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              [...jobConfigs]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((jobConfig) => (
                <TableRow key={jobConfig.id} noHover>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/evaluations/jobs/${jobConfig.id}`}
                      className="hover:underline"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {formatFilters(jobConfig.jobFilters)}
                        </span>
                        <code className="text-xs text-muted-foreground font-mono mt-1">
                          {jobConfig.id}
                        </code>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(jobConfig.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(jobConfig)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(jobConfig)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingJobConfig && (
        <EvaluationJobFormDialog
          tenantId={tenantId}
          projectId={projectId}
          jobConfigId={editingJobConfig.id}
          initialData={editingJobConfig}
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingJobConfig(undefined);
            }
          }}
        />
      )}

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
