'use client';

import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '@/app/utils/format-date';
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
import { EvaluatorViewDialog } from './evaluator-view-dialog';

interface EvaluatorsListProps {
  tenantId: string;
  projectId: string;
  evaluators: Evaluator[];
}

export function EvaluatorsList({ tenantId, projectId, evaluators }: EvaluatorsListProps) {
  const [editingEvaluator, setEditingEvaluator] = useState<Evaluator | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] = useState<Evaluator | undefined>();
  const [viewingEvaluator, setViewingEvaluator] = useState<Evaluator | undefined>();

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
              <TableHead className="max-w-md">Description</TableHead>
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
                    <button
                      type="button"
                      onClick={() => setViewingEvaluator(evaluator)}
                      className="font-medium text-foreground hover:underline text-left"
                    >
                      {evaluator.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal">
                    {evaluator.description}
                  </TableCell>
                  <TableCell>
                    <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
                      {evaluator.model?.model || 'N/A'}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(evaluator.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(evaluator.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(evaluator)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(evaluator)}
                          className="!text-destructive"
                        >
                          <Trash2 className="text-inherit" />
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

      {viewingEvaluator && (
        <EvaluatorViewDialog
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
