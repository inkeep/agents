'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Evaluator } from '@/lib/api/evaluators';
import { formatDate } from '@/lib/utils/format-date';
import { DeleteEvaluatorConfirmation } from './delete-evaluator-confirmation';
import { EvaluatorFormDialog } from './evaluator-form-dialog';
import { EvaluatorViewDialog } from './evaluator-view-dialog';

interface EvaluatorsListProps {
  tenantId: string;
  projectId: string;
  evaluators: Evaluator[];
}

export function EvaluatorsList({ tenantId, projectId, evaluators }: EvaluatorsListProps) {
  const [editingEvaluator, setEditingEvaluator] = useState<Evaluator | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] = useState<Evaluator | undefined>();
  const [viewingEvaluator, setViewingEvaluator] = useState<Evaluator | undefined>();

  const columns: ColumnDef<Evaluator>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setViewingEvaluator(row.original)}
          className="font-medium text-foreground hover:underline text-left"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      meta: { className: 'max-w-md' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-normal">
          {row.original.description}
        </span>
      ),
    },
    {
      id: 'model',
      accessorFn: (row) => row.model?.model || 'N/A',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
          {row.original.model?.model || 'N/A'}
        </code>
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
            <Button variant="ghost" size="sm">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setEditingEvaluator(row.original);
                setIsEditDialogOpen(true);
              }}
            >
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeletingEvaluator(row.original)}
              variant="destructive"
            >
              <Trash2 className="text-inherit" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <div className="rounded-lg border">
        <DataTable
          columns={columns}
          data={evaluators}
          defaultSort={[{ id: 'name', desc: false }]}
          getRowId={(row) => row.id}
          emptyState={
            <div className="flex flex-col items-center gap-4">
              <span>No evaluators yet</span>
              <EvaluatorFormDialog
                tenantId={tenantId}
                projectId={projectId}
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Add first evaluator
                  </Button>
                }
              />
            </div>
          }
        />
      </div>

      {editingEvaluator && (
        <EvaluatorFormDialog
          tenantId={tenantId}
          projectId={projectId}
          evaluatorId={editingEvaluator.id}
          initialData={editingEvaluator}
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingEvaluator(undefined);
            }
          }}
        />
      )}

      {deletingEvaluator && (
        <DeleteEvaluatorConfirmation
          tenantId={tenantId}
          projectId={projectId}
          evaluator={deletingEvaluator}
          isOpen={!!deletingEvaluator}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingEvaluator(undefined);
            }
          }}
        />
      )}

      {viewingEvaluator && (
        <EvaluatorViewDialog
          tenantId={tenantId}
          projectId={projectId}
          evaluator={viewingEvaluator}
          isOpen={!!viewingEvaluator}
          onOpenChange={(open) => {
            if (!open) {
              setViewingEvaluator(undefined);
            }
          }}
        />
      )}
    </>
  );
}
