'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '@/app/utils/format-date';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DatasetItem } from '@/lib/api/dataset-items';
import { DatasetItemFormDialog } from './dataset-item-form-dialog';
import { DeleteDatasetItemConfirmation } from './delete-dataset-item-confirmation';

interface DatasetItemCardProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  item: DatasetItem;
}

export function DatasetItemCard({ tenantId, projectId, datasetId, item }: DatasetItemCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const hasInput =
    item.input &&
    typeof item.input === 'object' &&
    'messages' in item.input &&
    Array.isArray(item.input.messages) &&
    item.input.messages.length > 0;
  const hasExpectedOutput =
    item.expectedOutput && Array.isArray(item.expectedOutput) && item.expectedOutput.length > 0;
  const hasSimulation = !!item.simulationAgent;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-sm font-medium">Item {item.id.slice(0, 8)}</CardTitle>
              <CardDescription className="mt-1">
                Created {formatDate(item.createdAt)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                aria-label="Edit item"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDeleteOpen(true)}
                aria-label="Delete item"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Input:</span>{' '}
              {hasInput &&
              item.input &&
              typeof item.input === 'object' &&
              'messages' in item.input ? (
                <span className="text-muted-foreground">
                  {item.input.messages.length} message{item.input.messages.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-muted-foreground italic">No input</span>
              )}
            </div>
            <div>
              <span className="font-medium">Expected Output:</span>{' '}
              {hasExpectedOutput && Array.isArray(item.expectedOutput) ? (
                <span className="text-muted-foreground">
                  {item.expectedOutput.length} message{item.expectedOutput.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-muted-foreground italic">None</span>
              )}
            </div>
            {hasSimulation && (
              <div>
                <span className="font-medium">Simulation:</span>{' '}
                <span className="text-muted-foreground">Configured</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DatasetItemFormDialog
        tenantId={tenantId}
        projectId={projectId}
        datasetId={datasetId}
        itemId={item.id}
        initialData={item}
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
      />

      <DeleteDatasetItemConfirmation
        tenantId={tenantId}
        projectId={projectId}
        datasetId={datasetId}
        itemId={item.id}
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />
    </>
  );
}
