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
  agentsOptions: SelectOption[];
  ref?: string;
}

export function NewApiKeyDialog({ tenantId, projectId, agentsOptions, ref }: NewApiKeyDialogProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyCreateResponse | null>(null);

  const hasAgents = agentsOptions.length > 0;

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
                <Button disabled={!hasAgents}>
                  <Plus className="size-4" /> New API key
                </Button>
              </DialogTrigger>
            </div>
          </TooltipTrigger>
          {!hasAgents && (
            <TooltipContent className="max-w-3xs">
              Please create an agent first, then you will be able to create an API key.
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
              agentsOptions={agentsOptions}
              onApiKeyCreated={handleApiKeyCreated}
              ref={ref}
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
