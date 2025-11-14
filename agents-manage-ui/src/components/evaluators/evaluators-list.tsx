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
import type { Evaluator } from '@/lib/api/evaluators';
import { DeleteEvaluatorConfirmation } from './delete-evaluator-confirmation';
import { EvaluatorFormDialog } from './evaluator-form-dialog';

interface EvaluatorsListProps {
  tenantId: string;
  projectId: string;
  evaluators: Evaluator[];
}

export function EvaluatorsList({ tenantId, projectId, evaluators }: EvaluatorsListProps) {
  const [editingEvaluator, setEditingEvaluator] = useState<Evaluator | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] = useState<Evaluator | undefined>();

  const handleEdit = (evaluator: Evaluator) => {
    setEditingEvaluator(evaluator);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (evaluator: Evaluator) => {
    setDeletingEvaluator(evaluator);
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluators.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No evaluators yet. Click &quot;+ New evaluator&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              evaluators.map((evaluator) => (
                <TableRow key={evaluator.id} noHover>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{evaluator.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-2">
                      {evaluator.description}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
                      {evaluator.model?.model || 'N/A'}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(evaluator.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(evaluator.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(evaluator)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(evaluator)}
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
    </>
  );
}

