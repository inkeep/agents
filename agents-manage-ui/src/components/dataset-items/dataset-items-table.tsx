'use client';

import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
import type { DatasetItem } from '@/lib/api/dataset-items';
import { DatasetItemFormDialog } from './dataset-item-form-dialog';
import { DeleteDatasetItemConfirmation } from './delete-dataset-item-confirmation';

interface DatasetItemsTableProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  items: DatasetItem[];
}

export function DatasetItemsTable({
  tenantId,
  projectId,
  datasetId,
  items,
}: DatasetItemsTableProps) {
  const [editingItemId, setEditingItemId] = useState<string | undefined>();
  const [deletingItemId, setDeletingItemId] = useState<string | undefined>();

  const editingItem = editingItemId ? items.find((item) => item.id === editingItemId) : undefined;
  const deletingItem = deletingItemId
    ? items.find((item) => item.id === deletingItemId)
    : undefined;

  const formatInput = (input: DatasetItem['input']): string => {
    if (!input) return '';
    if (typeof input === 'string') {
      try {
        return JSON.stringify(JSON.parse(input), null, 2);
      } catch {
        return input;
      }
    }
    return JSON.stringify(input, null, 2);
  };

  const formatExpectedOutput = (expectedOutput: DatasetItem['expectedOutput']): string => {
    if (!expectedOutput) return '';
    if (typeof expectedOutput === 'string') {
      try {
        return JSON.stringify(JSON.parse(expectedOutput), null, 2);
      } catch {
        return expectedOutput;
      }
    }
    if (Array.isArray(expectedOutput)) {
      return JSON.stringify(expectedOutput, null, 2);
    }
    return JSON.stringify(expectedOutput, null, 2);
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Item id</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Expected Output</TableHead>
              <TableHead>Simulation Agent</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No items yet. Click &quot;+ New item&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const hasSimulationAgent = !!(
                  item.simulationAgent &&
                  typeof item.simulationAgent === 'object' &&
                  item.simulationAgent !== null &&
                  !Array.isArray(item.simulationAgent) &&
                  (item.simulationAgent.prompt || item.simulationAgent.model)
                );

                return (
                  <TableRow key={item.id} noHover>
                    <TableCell>
                      <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono">
                        {item.id}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeTable(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeTable(item.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <code className="block text-xs bg-muted rounded border p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {formatInput(item.input)}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        {item.expectedOutput ? (
                          <code className="block text-xs bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800 p-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {formatExpectedOutput(item.expectedOutput)}
                          </code>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">None</span>
                        )}
                      </div>
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
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingItemId(item.id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingItemId(item.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
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
