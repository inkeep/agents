import { Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
import { DuplicateAgentDialog } from './duplicate-agent-section';
import { EditAgentDialog } from './edit-agent-dialog';

interface AgentItemMenuProps extends Pick<Agent, 'id' | 'name' | 'description'> {
  projectId: string;
  tenantId: string;
}

export function AgentItemMenu({
  id,
  name,
  description = '',
  projectId,
  tenantId,
}: AgentItemMenuProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="-mr-2">
            <MoreVertical className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 shadow-lg border border-border bg-popover/95 backdrop-blur-sm"
        >
          <DropdownMenuItem className=" cursor-pointer" onClick={() => setIsEditOpen(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => setIsDuplicateOpen(true)}>
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setIsDeleteOpen(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DeleteAgentConfirmation agentId={id} agentName={name} setIsOpen={setIsDeleteOpen} />
      </Dialog>
      <EditAgentDialog
        tenantId={tenantId}
        projectId={projectId}
        agentData={{ id, name, description }}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
      />
      <DuplicateAgentDialog
        tenantId={tenantId}
        sourceProjectId={projectId}
        sourceAgentId={id}
        sourceAgentName={name}
        isOpen={isDuplicateOpen}
        setIsOpen={setIsDuplicateOpen}
      />
    </>
  );
}
