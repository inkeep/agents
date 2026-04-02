'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FC, useMemo, useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DatasetItem } from '@/lib/api/dataset-items';
import { formatDateTimeTable } from '@/lib/utils/format-date';
import { DatasetItemFormDialog } from './dataset-item-form-dialog';
import { DeleteDatasetItemConfirmation } from './delete-dataset-item-confirmation';

interface DatasetItemsTableProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  items: DatasetItem[];
}

const ReadOnlyEditor: FC<{
  name: string;
  value: unknown;
}> = ({ name, value }) => {
  return (
    <ExpandableJsonEditor
      name={name}
      value={JSON.stringify(value, null, 2)}
      readOnly
      editorOptions={{
        wordWrap: 'off',
        scrollbar: {
          alwaysConsumeMouseWheel: true,
        },
      }}
    />
  );
};

export function DatasetItemsTable({
  tenantId,
  projectId,
  datasetId,
  items,
}: DatasetItemsTableProps) {
  const [editingItemId, setEditingItemId] = useState<string | undefined>();
  const [deletingItemId, setDeletingItemId] = useState<string | undefined>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const editingItem = editingItemId ? items.find((item) => item.id === editingItemId) : undefined;
  const deletingItem = deletingItemId
    ? items.find((item) => item.id === deletingItemId)
    : undefined;

  const columns: ColumnDef<DatasetItem>[] = [
    {
      id: 'updatedAt',
      accessorFn: (row) => new Date(row.updatedAt),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTimeTable(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: 'input',
      header: 'Input',
      enableSorting: false,
      cell: ({ row }) => <ReadOnlyEditor name={`input_${row.index}`} value={row.original.input} />,
    },
    {
      id: 'expectedOutput',
      header: 'Expected Output',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.expectedOutput ? (
          <ReadOnlyEditor name={`output_${row.index}`} value={row.original.expectedOutput} />
        ) : (
          <span className="text-sm text-muted-foreground italic">None</span>
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
            <DropdownMenuItem onClick={() => setEditingItemId(row.original.id)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeletingItemId(row.original.id)}
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
          data={items}
          defaultSort={[{ id: 'updatedAt', desc: true }]}
          getRowId={(row) => row.id}
          emptyState={
            <div className="flex flex-col items-center gap-4">
              <span>No items yet</span>
              <DatasetItemFormDialog
                tenantId={tenantId}
                projectId={projectId}
                datasetId={datasetId}
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Add first item
                  </Button>
                }
              />
            </div>
          }
        />
      </div>

      {editingItem && (
        <DatasetItemFormDialog
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          itemId={editingItem.id}
          initialData={editingItem}
          isOpen={!!editingItem}
          onOpenChange={(open) => !open && setEditingItemId(undefined)}
        />
      )}

      {deletingItem && (
        <DeleteDatasetItemConfirmation
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          itemId={deletingItem.id}
          isOpen={!!deletingItem}
          onOpenChange={(open) => !open && setDeletingItemId(undefined)}
        />
      )}
    </>
  );
}
