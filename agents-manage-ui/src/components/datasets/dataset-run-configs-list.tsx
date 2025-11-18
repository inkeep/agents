'use client';

import { Calendar, MoreVertical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDate } from '@/app/utils/format-date';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deleteDatasetRunConfigAction,
  fetchDatasetRunConfigAction,
  fetchDatasetRunConfigsAction,
} from '@/lib/actions/dataset-run-configs';
import type { DatasetRunConfig } from '@/lib/api/dataset-run-configs';
import { DatasetRunConfigFormDialog } from './dataset-run-config-form-dialog';

interface DatasetRunConfigsListProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  refreshKey?: number | string;
}

export function DatasetRunConfigsList({
  tenantId,
  projectId,
  datasetId,
  refreshKey,
}: DatasetRunConfigsListProps) {
  const [runConfigs, setRunConfigs] = useState<DatasetRunConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<DatasetRunConfig | null>(null);

  const loadRunConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchDatasetRunConfigsAction(tenantId, projectId, datasetId);
      if (result.success && result.data) {
        setRunConfigs(result.data);
      } else if (!result.success) {
        setError(result.error || 'Failed to load run configurations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRunConfigs();
  }, [tenantId, projectId, datasetId, refreshKey]);

  const handleDeleteClick = (configId: string) => {
    setDeletingConfigId(configId);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingConfigId) return;

    setIsDeleting(true);
    try {
      const result = await deleteDatasetRunConfigAction(tenantId, projectId, deletingConfigId);
      if (result.success) {
        toast.success('Run configuration deleted');
        setDeletingConfigId(null);
        await loadRunConfigs();
      } else {
        toast.error(result.error || 'Failed to delete run configuration');
      }
    } catch (error) {
      console.error('Error deleting run configuration:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditClick = async (configId: string) => {
    setEditingConfigId(configId);
    try {
      const result = await fetchDatasetRunConfigAction(tenantId, projectId, configId);
      if (result.success && result.data) {
        setEditingConfig(result.data);
      } else if (!result.success) {
        toast.error(result.error || 'Failed to load run configuration');
        setEditingConfigId(null);
      }
    } catch (error) {
      console.error('Error fetching run configuration:', error);
      toast.error('Failed to load run configuration');
      setEditingConfigId(null);
    }
  };

  const handleEditSuccess = async () => {
    setEditingConfigId(null);
    setEditingConfig(null);
    await loadRunConfigs();
  };

  const deletingConfig = deletingConfigId
    ? runConfigs.find((c) => c.id === deletingConfigId)
    : null;

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Loading run configurations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={loadRunConfigs} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (runConfigs.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <p className="text-sm text-muted-foreground mb-4">No run configurations yet</p>
        <p className="text-xs text-muted-foreground">
          Create a run configuration to schedule automatic test suite runs
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {runConfigs.map((config) => (
          <Card key={config.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{config.name}</CardTitle>
                  {config.description && <CardDescription>{config.description}</CardDescription>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditClick(config.id)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDeleteClick(config.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(config.createdAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog
        open={deletingConfigId !== null}
        onOpenChange={(open) => !open && setDeletingConfigId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Run Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingConfig?.name}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingConfigId && editingConfig && (
        <DatasetRunConfigFormDialog
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          runConfigId={editingConfigId}
          initialData={{
            name: editingConfig.name,
            description: editingConfig.description,
            agentIds: [], // TODO: Fetch agentIds from relations
            evaluationRunConfigs:
              'evaluationRunConfigs' in editingConfig &&
              Array.isArray(editingConfig.evaluationRunConfigs)
                ? (editingConfig.evaluationRunConfigs as { id: string; enabled: boolean }[])
                : undefined,
          }}
          isOpen={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditingConfigId(null);
              setEditingConfig(null);
            }
          }}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
