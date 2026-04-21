'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import type { SelectOption } from '@/components/form/generic-select';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import type { AppCreateResponse } from '@/lib/api/apps';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AppCredentialDisplay } from './app-credential-display';
import { AppCreateForm } from './form/app-create-form';
import { APP_TYPE_OPTIONS } from './form/validation';

interface NewAppDialogProps {
  agentOptions: SelectOption[];
  credentialOptions: SelectOption[];
  hasSupportCopilotEntitlement: boolean;
}

type AppType = 'web_client' | 'api' | 'support_copilot';

export function NewAppDialog({
  agentOptions,
  credentialOptions,
  hasSupportCopilotEntitlement,
}: NewAppDialogProps) {
  const { PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();
  const isCloudDeployment = PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  const supportCopilotEnabled = isCloudDeployment && hasSupportCopilotEntitlement;
  const appTypeOptions = APP_TYPE_OPTIONS.filter(
    (opt) => opt.value !== 'support_copilot' || supportCopilotEnabled
  );

  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AppType | null>(null);
  const [createdApp, setCreatedApp] = useState<AppCreateResponse | null>(null);

  const handleAppCreated = (result: AppCreateResponse) => {
    setCreatedApp(result);
    setIsOpen(false);
    setSelectedType(null);
  };

  const handleCredentialDisplayClosed = () => {
    setCreatedApp(null);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSelectedType(null);
    }
  };

  const handleSelectType = (type: AppType) => {
    setSelectedType(type);
    setIsOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus className="size-4" /> New App <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {appTypeOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              className="flex flex-col items-start gap-0.5 py-2"
              onClick={() => handleSelectType(opt.value)}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              New {APP_TYPE_OPTIONS.find((o) => o.value === selectedType)?.label}
            </DialogTitle>
            <DialogDescription className="sr-only">Configure your new app.</DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            {selectedType && (
              <AppCreateForm
                appType={selectedType}
                agentOptions={agentOptions}
                credentialOptions={credentialOptions}
                onAppCreated={handleAppCreated}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AppCredentialDisplay
        appId={createdApp ? createdApp.app.id : ''}
        open={!!createdApp}
        onClose={handleCredentialDisplayClosed}
      />
    </>
  );
}
