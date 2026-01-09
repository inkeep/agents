import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDatasetConfirmation } from './delete-dataset-confirmation';
import { RenameDatasetDialog } from './rename-dataset-dialog';

interface DatasetItemMenuProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  datasetName?: string;
}

export function DatasetItemMenu({
  tenantId,
  projectId,
  datasetId,
  datasetName,
}: DatasetItemMenuProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className=" p-0 hover:bg-accent hover:text-accent-foreground rounded-sm -mr-2"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsRenameOpen(true)}>
            <Pencil className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setIsDeleteOpen(true)}
            className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer"
          >
            <Trash2 className="size-4 text-destructive" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDatasetDialog
        tenantId={tenantId}
        projectId={projectId}
        datasetId={datasetId}
        currentName={datasetName || ''}
        isOpen={isRenameOpen}
        onOpenChange={setIsRenameOpen}
      />

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        {isDeleteOpen && (
          <DeleteDatasetConfirmation
            datasetId={datasetId}
            datasetName={datasetName}
            setIsOpen={setIsDeleteOpen}
          />
        )}
      </Dialog>
    </>
  );
}
