'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import type { SelectOption } from '@/components/form/generic-select';
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
}

type AppType = 'web_client' | 'api';

export function NewAppDialog({ agentOptions }: NewAppDialogProps) {
  const [selectedType, setSelectedType] = useState<AppType | null>(null);
  const [createdApp, setCreatedApp] = useState<AppCreateResponse | null>(null);

  const handleAppCreated = (result: AppCreateResponse) => {
    setCreatedApp(result);
    setSelectedType(null);
  };

  const handleCredentialDisplayClosed = () => {
    setCreatedApp(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus className="size-4" />
            New App
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {APP_TYPE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              className="flex flex-col items-start gap-0.5 cursor-pointer py-3"
              onClick={() => setSelectedType(opt.value)}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground font-normal">{opt.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!selectedType} onOpenChange={(open) => !open && setSelectedType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New App</DialogTitle>
            <DialogDescription className="sr-only">Configure your new app.</DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            {selectedType && (
              <AppCreateForm
                appType={selectedType}
                agentOptions={agentOptions}
                onAppCreated={handleAppCreated}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AppCredentialDisplay
        appId={createdApp ? `app_${createdApp.app.publicId}` : ''}
        appSecret={createdApp?.appSecret}
        open={!!createdApp}
        onClose={handleCredentialDisplayClosed}
      />
    </>
  );
}
