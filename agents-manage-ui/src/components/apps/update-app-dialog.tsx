'use client';

import { useParams } from 'next/navigation';
import type { SelectOption } from '@/components/form/generic-select';
import type { App } from '@/lib/api/apps';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppUpdateForm } from './form/app-update-form';

interface UpdateAppDialogProps {
  app: App;
  agentOptions: SelectOption[];
  setIsOpen: (isOpen: boolean) => void;
}

export function UpdateAppDialog({ app, agentOptions, setIsOpen }: UpdateAppDialogProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <Dialog open={true} onOpenChange={(open) => !open && setIsOpen(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit App</DialogTitle>
          <DialogDescription className="sr-only">Update your app configuration.</DialogDescription>
        </DialogHeader>
        <div className="pt-4">
          <AppUpdateForm
            tenantId={tenantId}
            projectId={projectId}
            app={app}
            agentOptions={agentOptions}
            onAppUpdated={() => setIsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
