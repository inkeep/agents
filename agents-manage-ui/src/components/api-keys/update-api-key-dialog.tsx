'use client';

import { useParams } from 'next/navigation';
import { useCurrentRef } from '@/hooks/use-current-ref';
import type { ApiKey } from '@/lib/api/api-keys';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { ApiKeyUpdateForm } from './form/api-key-update-form';

interface ApiKeyUpdateDialogProps {
  apiKey: ApiKey;
  setIsOpen: (isOpen: boolean) => void;
}

export function ApiKeyUpdateDialog({ apiKey, setIsOpen }: ApiKeyUpdateDialogProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const ref = useCurrentRef();
  const handleApiKeyUpdated = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && setIsOpen(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update API key</DialogTitle>
          <DialogDescription className="sr-only">Update your API key.</DialogDescription>
        </DialogHeader>
        <div className="pt-6">
          <ApiKeyUpdateForm
            tenantId={tenantId}
            projectId={projectId}
            apiKey={apiKey}
            onApiKeyUpdated={handleApiKeyUpdated}
            ref={ref}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
