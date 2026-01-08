'use client';

import { ChevronRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@/app/utils/format-date';
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
  const router = useRouter();
  const [runConfigs, setRunConfigs] = useState<EvaluationRunConfig[]>(initialRunConfigs);
  const [editingRunConfig, setEditingRunConfig] = useState<EvaluationRunConfig | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingRunConfig, setDeletingRunConfig] = useState<EvaluationRunConfig | undefined>();

  // Update local state when initial props change (from router.refresh)
  useEffect(() => {
    setRunConfigs(initialRunConfigs);
  }, [initialRunConfigs]);

  const refreshRunConfigs = useCallback(async () => {
    try {
      console.log('Fetching fresh run configs...');
      const response = await fetchEvaluationRunConfigs(tenantId, projectId);
      console.log('Received run configs:', response.data.length, 'items');
      setRunConfigs(response.data);
    } catch (error) {
      console.error('Error refreshing run configs:', error);
    }
  }, [tenantId, projectId]);

  // Refresh when refreshKey changes (e.g., after creating a new config)
  useEffect(() => {
    console.log('refreshKey changed to:', refreshKey);
    if (refreshKey !== undefined && typeof refreshKey === 'number' && refreshKey > 0) {
      console.log('Calling refreshRunConfigs');
      refreshRunConfigs();
    }
  }, [refreshKey, refreshRunConfigs]);

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
              <TableHead>Updated</TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runConfigs.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No continuous tests yet. Click &quot;+ New continuous test&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              runConfigs.map((runConfig) => (
                <TableRow
                  key={runConfig.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(
                      `/${tenantId}/projects/${projectId}/evaluations/run-configs/${runConfig.id}`
                    )
                  }
                >
                  <TableCell className="font-medium">{runConfig.name}</TableCell>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(runConfig.updatedAt)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
