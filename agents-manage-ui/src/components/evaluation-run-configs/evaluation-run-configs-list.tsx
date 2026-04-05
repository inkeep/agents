'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import { fetchEvaluationRunConfigs } from '@/lib/api/evaluation-run-configs';
import { formatDate } from '@/lib/utils/format-date';
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
  const [runConfigsState, setRunConfigsState] = useState<{
    source: EvaluationRunConfig[];
    value: EvaluationRunConfig[];
  }>({
    source: initialRunConfigs,
    value: initialRunConfigs,
  });
  const [editingRunConfig, setEditingRunConfig] = useState<EvaluationRunConfig | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deletingRunConfig, setDeletingRunConfig] = useState<EvaluationRunConfig | undefined>();
  const runConfigs =
    runConfigsState.source === initialRunConfigs ? runConfigsState.value : initialRunConfigs;

  async function refreshRunConfigs() {
    try {
      const response = await fetchEvaluationRunConfigs(tenantId, projectId);
      setRunConfigsState({
        source: initialRunConfigs,
        value: response.data,
      });
    } catch (error) {
      console.error('Error refreshing run configs:', error);
    }
  }

  useEffect(() => {
    if (refreshKey !== undefined && typeof refreshKey === 'number' && refreshKey > 0) {
      refreshRunConfigs();
    }
  }, [
    refreshKey,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    refreshRunConfigs,
  ]);

  const columns: ColumnDef<EvaluationRunConfig>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {row.original.description || 'No description'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      sortingFn: 'basic',
      cell: ({ row }) => (
        <Badge className="uppercase" variant={row.original.isActive ? 'primary' : 'code'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'updatedAt',
      accessorFn: (row) => new Date(row.updatedAt),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: ({ row }) => (
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
                setEditingRunConfig(row.original);
                setIsEditDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setDeletingRunConfig(row.original);
              }}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
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
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    },
  ];

  return (
    <>
      <div className="rounded-lg border">
        <DataTable
          columns={columns}
          data={runConfigs}
          defaultSort={[{ id: 'name', desc: false }]}
          getRowId={(row) => row.id}
          onRowClick={(runConfig) =>
            router.push(
              `/${tenantId}/projects/${projectId}/evaluations/run-configs/${runConfig.id}`
            )
          }
          emptyState={
            <div className="flex flex-col items-center gap-4">
              <span>No continuous tests yet</span>
              <EvaluationRunConfigFormDialog
                tenantId={tenantId}
                projectId={projectId}
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSuccess={refreshRunConfigs}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Add first continuous test
                  </Button>
                }
              />
            </div>
          }
        />
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
              refreshRunConfigs();
            }
          }}
          onSuccess={refreshRunConfigs}
        />
      )}
    </>
  );
}
