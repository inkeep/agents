'use client';

import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
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
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { DeleteEvaluationJobConfirmation } from './delete-evaluation-job-confirmation';
import { EvaluationJobFormDialog } from './evaluation-job-form-dialog';

interface EvaluationJobsListProps {
  tenantId: string;
  projectId: string;
  jobConfigs: EvaluationJobConfig[];
}

export function EvaluationJobsList({
  tenantId,
  projectId,
  jobConfigs,
}: EvaluationJobsListProps) {
  const [editingJobConfig, setEditingJobConfig] = useState<EvaluationJobConfig | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingJobConfig, setDeletingJobConfig] = useState<EvaluationJobConfig | undefined>();

  const handleEdit = (jobConfig: EvaluationJobConfig) => {
    setEditingJobConfig(jobConfig);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (jobConfig: EvaluationJobConfig) => {
    setDeletingJobConfig(jobConfig);
  };

  const formatFilters = (filters: EvaluationJobConfig['jobFilters']): string => {
    if (!filters) return 'No filters';
    const parts: string[] = [];
    if (filters.datasetRunIds && filters.datasetRunIds.length > 0) {
      parts.push(`${filters.datasetRunIds.length} dataset run(s)`);
    }
    if (filters.conversationIds && filters.conversationIds.length > 0) {
      parts.push(`${filters.conversationIds.length} conversation(s)`);
    }
    if (filters.dateRange) {
      parts.push('Date range');
    }
    return parts.length > 0 ? parts.join(', ') : 'No filters';
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>ID</TableHead>
              <TableHead>Filters</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobConfigs.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No evaluation jobs yet. Click &quot;+ New job&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              jobConfigs.map((jobConfig) => (
                <TableRow key={jobConfig.id} noHover>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/evaluations/jobs/${jobConfig.id}`}
                      className="inline-block"
                    >
                      <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono hover:bg-muted/80 transition-colors cursor-pointer">
                        {jobConfig.id}
                      </code>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatFilters(jobConfig.jobFilters)}
                    </span>
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

