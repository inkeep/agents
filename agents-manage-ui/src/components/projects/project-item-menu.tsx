import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteProjectConfirmation } from './delete-project-confirmation';
import { EditProjectDialog } from './edit-project-dialog';
import type { ProjectFormData } from './form/validation';

interface ProjectItemMenuProps {
  projectName?: string;
  projectData: ProjectFormData;
  tenantId: string;
}

export function ProjectItemMenu({ projectName, projectData, tenantId }: ProjectItemMenuProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

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
        <DropdownMenuContent
          align="end"
          className="w-48 shadow-lg border border-border bg-popover/95 backdrop-blur-sm"
        >
          <DropdownMenuItem className=" cursor-pointer" onClick={() => setIsEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="size-4 text-destructive" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isEditOpen && (
        <EditProjectDialog
          isOpen={isEditOpen}
          setIsOpen={setIsEditOpen}
          tenantId={tenantId}
          projectData={projectData}
        />
      )}

      {isDeleteOpen && (
        <DeleteProjectConfirmation
          projectId={projectData.id}
          projectName={projectName}
          setIsOpen={setIsDeleteOpen}
          isOpen={isDeleteOpen}
        />
      )}
    </>
  );
}
