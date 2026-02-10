'use client';

import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FC, useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocalDateTimeTable } from '@/components/ui/local-datetime';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DatasetItem } from '@/lib/api/dataset-items';
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

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Updated At</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Expected Output</TableHead>
              <TableHead>Simulation Agent</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={5} className="py-12">
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-muted-foreground">No items yet</span>
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
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => {
                const hasSimulationAgent = !!(
                  item.simulationAgent &&
                  typeof item.simulationAgent === 'object' &&
                  !Array.isArray(item.simulationAgent) &&
                  (item.simulationAgent.prompt || item.simulationAgent.model)
                );

                return (
                  <TableRow key={item.id} noHover>
                    <TableCell className="text-sm text-muted-foreground">
                      <LocalDateTimeTable dateString={item.updatedAt} />
                    </TableCell>
                    <TableCell>
                      <ReadOnlyEditor name={`input_${index}`} value={item.input} />
                    </TableCell>
                    <TableCell>
                      {item.expectedOutput ? (
                        <ReadOnlyEditor name={`output_${index}`} value={item.expectedOutput} />
                      ) : (
                        <span className="text-sm text-muted-foreground italic">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasSimulationAgent ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Configured
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingItemId(item.id)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingItemId(item.id)}
                            className="!text-destructive"
                          >
                            <Trash2 className="text-inherit" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
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
