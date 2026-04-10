'use client';

import { useParams } from 'next/navigation';
import type { SelectOption } from '@/components/form/generic-select';
import type { App } from '@/lib/api/apps';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AppUpdateForm } from './form/app-update-form';
import { APP_TYPE_OPTIONS } from './form/validation';

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

  const appType = APP_TYPE_OPTIONS.find((o) => o.value === app.type)?.label ?? 'App';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && setIsOpen(false)}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Edit {appType}</DialogTitle>
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
