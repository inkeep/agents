'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { SelectOption } from '@/components/form/generic-select';
import type { ApiKeyCreateResponse } from '@/lib/api/api-keys';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ApiKeyDisplay } from './api-key-display';
import { ApiKeyForm } from './form/api-key-form';

interface NewApiKeyDialogProps {
  tenantId: string;
  projectId: string;
  graphsOptions: SelectOption[];
}

export function NewApiKeyDialog({ tenantId, projectId, graphsOptions }: NewApiKeyDialogProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyCreateResponse | null>(null);

  const hasGraphs = graphsOptions.length > 0;

  const handleApiKeyCreated = (apiKeyData: ApiKeyCreateResponse) => {
    setCreatedApiKey(apiKeyData);
    setIsFormOpen(false);
  };

  const handleApiKeyDisplayClosed = () => {
    setCreatedApiKey(null);
  };

  return (
    <>
      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DialogTrigger asChild>
                <Button disabled={!hasGraphs}>
                  <Plus className="size-4" /> New API key
                </Button>
              </DialogTrigger>
            </div>
          </TooltipTrigger>
          {!hasGraphs && (
            <TooltipContent className="max-w-3xs">
              Please create a graph first, then you will be able to create an API key.
            </TooltipContent>
          )}
        </Tooltip>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription className="sr-only">Create a new API key.</DialogDescription>
          </DialogHeader>
          <div className="pt-6">
            <ApiKeyForm
              tenantId={tenantId}
              projectId={projectId}
              graphsOptions={graphsOptions}
              onApiKeyCreated={handleApiKeyCreated}
            />
          </div>
        </DialogContent>
      </Dialog>
      {/* API Key Display Alert Dialog */}
      <ApiKeyDisplay
        apiKey={createdApiKey?.key ?? ''}
        open={!!createdApiKey}
        onClose={handleApiKeyDisplayClosed}
      />
    </>
  );
}
