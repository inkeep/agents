import { Plus } from 'lucide-react';
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
import { NewAgentForm } from './new-agent-form';

interface NewAgentItemProps {
  tenantId: string;
  projectId: string;
}

interface NewAgentDialogContentProps extends NewAgentItemProps {}

const NewAgentDialogContent = ({ tenantId, projectId }: NewAgentDialogContentProps) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New Agent</DialogTitle>
        <DialogDescription className="sr-only">Create a new agent.</DialogDescription>
      </DialogHeader>
      <div className="pt-6">
        <NewAgentForm tenantId={tenantId} projectId={projectId} />
      </div>
    </DialogContent>
  );
};

// New agent dialog in empty state
export function NewAgentDialog({ tenantId, projectId }: NewAgentItemProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Agent
        </Button>
      </DialogTrigger>
      <NewAgentDialogContent tenantId={tenantId} projectId={projectId} />
    </Dialog>
  );
}

// New agent dialog in agents list
export function NewAgentItem({ tenantId, projectId }: NewAgentItemProps) {
  return (
    <Dialog>
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
      <NewAgentDialogContent tenantId={tenantId} projectId={projectId} />
    </Dialog>
  );
}
