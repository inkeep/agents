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
import type { Agent } from '@/lib/types/agent-full';
import { DeleteAgentConfirmation } from './delete-agent-confirmation';
import { EditAgentDialog } from './edit-agent-dialog';

interface AgentItemMenuProps extends Pick<Agent, 'id' | 'name' | 'description'> {
  projectId: string;
  tenantId: string;
}

export function AgentItemMenu({ id, name, description, projectId, tenantId }: AgentItemMenuProps) {
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
            Rename
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
      {isDeleteOpen && (
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DeleteAgentConfirmation agentId={id} agentName={name} setIsOpen={setIsDeleteOpen} />
        </Dialog>
      )}
      {isEditOpen && (
        <EditAgentDialog
          tenantId={tenantId}
          projectId={projectId}
          agentData={{ id, name, description: description || '' }}
          isOpen={isEditOpen}
          setIsOpen={setIsEditOpen}
        />
      )}
    </>
  );
}
