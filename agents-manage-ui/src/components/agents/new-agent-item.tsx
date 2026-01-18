'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { AgentForm } from './agent-form';

interface NewAgentItemProps {
  tenantId: string;
  projectId: string;
}

interface NewAgentDialogContentProps extends NewAgentItemProps {
  onSuccess?: () => void;
}

const NewAgentDialogContent = ({ tenantId, projectId, onSuccess }: NewAgentDialogContentProps) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New Agent</DialogTitle>
        <DialogDescription className="sr-only">Create a new agent.</DialogDescription>
      </DialogHeader>
      <div className="pt-6">
        <AgentForm tenantId={tenantId} projectId={projectId} onSuccess={onSuccess} />
      </div>
    </DialogContent>
  );
};

// New agent dialog in empty state
export function NewAgentDialog({ tenantId, projectId }: NewAgentItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild={true}>
        <Button>
          <Plus className="size-4" /> New Agent
        </Button>
      </DialogTrigger>
      <NewAgentDialogContent
        tenantId={tenantId}
        projectId={projectId}
        onSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
}

// New agent dialog in agents list
export function NewAgentItem({ tenantId, projectId }: NewAgentItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Card className="h-full bg-transparent border shadow-none hover:bg-background hover:ring-2 hover:ring-accent/50 dark:hover:ring-accent/30 transition-all duration-300 cursor-pointer group border-dashed">
          <CardContent className="flex flex-row items-center justify-center text-center gap-2 flex-1">
            <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Create agent
            </h3>
          </CardContent>
        </Card>
      </DialogTrigger>
      <NewAgentDialogContent
        tenantId={tenantId}
        projectId={projectId}
        onSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
}
