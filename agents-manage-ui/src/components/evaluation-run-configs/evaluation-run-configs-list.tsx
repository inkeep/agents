'use client';

import { ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { Badge } from '@/components/ui/badge';
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
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import { fetchEvaluationRunConfigs } from '@/lib/api/evaluation-run-configs';
import { DeleteEvaluationRunConfigConfirmation } from './delete-evaluation-run-config-confirmation';
import { EvaluationRunConfigFormDialog } from './evaluation-run-config-form-dialog';

interface EvaluationRunConfigsListProps {
  tenantId: string;
  projectId: string;
  runConfigs: EvaluationRunConfig[];
  refreshKey?: string | number;
}

export function EvaluationRunConfigsList({
  tenantId,
  projectId,
  runConfigs: initialRunConfigs,
  refreshKey,
}: EvaluationRunConfigsListProps) {
  const [runConfigs, setRunConfigs] = useState<EvaluationRunConfig[]>(initialRunConfigs);
  const [editingRunConfig, setEditingRunConfig] = useState<EvaluationRunConfig | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingRunConfig, setDeletingRunConfig] = useState<EvaluationRunConfig | undefined>();

  // Update local state when initial props change (from router.refresh)
  useEffect(() => {
    setRunConfigs(initialRunConfigs);
  }, [initialRunConfigs]);

  const refreshRunConfigs = async () => {
    try {
      console.log('Fetching fresh run configs...');
      const response = await fetchEvaluationRunConfigs(tenantId, projectId);
      console.log('Received run configs:', response.data.length, 'items');
      setRunConfigs(response.data);
    } catch (error) {
      console.error('Error refreshing run configs:', error);
    }
  };

  // Refresh when refreshKey changes (e.g., after creating a new config)
  useEffect(() => {
    console.log('refreshKey changed to:', refreshKey);
    if (refreshKey !== undefined && typeof refreshKey === 'number' && refreshKey > 0) {
      console.log('Calling refreshRunConfigs');
      refreshRunConfigs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleEdit = (runConfig: EvaluationRunConfig) => {
    setEditingRunConfig(runConfig);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (runConfig: EvaluationRunConfig) => {
    setDeletingRunConfig(runConfig);
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Evaluation Plans</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runConfigs.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No continuous tests yet. Click &quot;+ New continuous test&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              runConfigs.map((runConfig) => (
                <TableRow key={runConfig.id} noHover>
                  <TableCell className="font-medium">
                    <Link
                      href={`/${tenantId}/projects/${projectId}/evaluations/run-configs/${runConfig.id}`}
                      className="hover:underline"
                    >
                      {runConfig.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-1">
                      {runConfig.description || 'No description'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={runConfig.isActive ? 'default' : 'secondary'}>
                      {runConfig.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/evaluations/run-configs/${runConfig.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {runConfig.suiteConfigIds?.length || 0} evaluation plan(s)
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(runConfig.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(runConfig.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(runConfig)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(runConfig)}
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

      {editingRunConfig && (
        <EvaluationRunConfigFormDialog
          tenantId={tenantId}
          projectId={projectId}
          runConfigId={editingRunConfig.id}
          initialData={editingRunConfig}
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingRunConfig(undefined);
            } else {
              // Refresh when dialog opens to get latest data
              refreshRunConfigs();
            }
          }}
          onSuccess={refreshRunConfigs}
        />
      )}

      {deletingRunConfig && (
        <DeleteEvaluationRunConfigConfirmation
          tenantId={tenantId}
          projectId={projectId}
          runConfig={deletingRunConfig}
          isOpen={!!deletingRunConfig}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingRunConfig(undefined);
            } else {
              // Refresh after deletion
              refreshRunConfigs();
            }
          }}
          onSuccess={refreshRunConfigs}
        />
      )}
    </>
  );
}
