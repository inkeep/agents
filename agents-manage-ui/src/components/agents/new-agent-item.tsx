'use client';

import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
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
import { ImportAgentSection } from './import-agent-section';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  FieldLabel,
  Field,
  FieldContent,
  FieldTitle,
  FieldDescription,
} from '@/components/ui/field';

interface NewAgentItemProps {
  tenantId: string;
  projectId: string;
}

interface NewAgentDialogContentProps extends NewAgentItemProps {
  onSuccess?: () => void;
  open: boolean;
}

const NewAgentDialogContent = ({
  tenantId,
  projectId,
  onSuccess,
  open,
}: NewAgentDialogContentProps) => {
  const newAgentId = useId();
  const importAgentId = useId();
  const [value, setValue] = useState('new');

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New Agent</DialogTitle>
        <DialogDescription>
          Create a blank agent or copy an existing agent.
        </DialogDescription>
      </DialogHeader>
      <RadioGroup value={value} onValueChange={setValue}>
        <FieldLabel htmlFor={newAgentId}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Create blank agent</FieldTitle>
              <FieldDescription>
                Start from scratch with a new agent shell and continue editing in the builder.
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem value="new" id={newAgentId} />
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor={importAgentId}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Import from existing project</FieldTitle>
              <FieldDescription>
                Search another project in this workspace and choose an existing agent.
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem value="import" id={importAgentId} />
          </Field>
        </FieldLabel>
      </RadioGroup>
      {value === 'new' ? (
        <AgentForm tenantId={tenantId} projectId={projectId} onSuccess={onSuccess} />
      ) : (
        <ImportAgentSection tenantId={tenantId} isOpen={open} />
      )}
    </DialogContent>
  );
};

// New agent dialog in empty state
export function NewAgentDialog({ tenantId, projectId }: NewAgentItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Agent
        </Button>
      </DialogTrigger>
      <NewAgentDialogContent
        open={open}
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
        open={open}
        tenantId={tenantId}
        projectId={projectId}
        onSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
}
