'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { SelectOption } from '@/components/form/generic-select';
import type { AppCreateResponse } from '@/lib/api/apps';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { AppCredentialDisplay } from './app-credential-display';
import { AppCreateForm } from './form/app-create-form';
import { APP_TYPE_OPTIONS } from './form/validation';

interface NewAppDialogProps {
  agentOptions: SelectOption[];
}

type AppType = 'web_client' | 'api';

export function NewAppDialog({ agentOptions }: NewAppDialogProps) {
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> New App
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedType ? 'New App' : 'Select App Type'}</DialogTitle>
            <DialogDescription className="sr-only">
              {selectedType ? 'Configure your new app.' : 'Choose the type of app to create.'}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            {!selectedType ? (
              <div className="grid gap-3">
                {APP_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="flex flex-col items-start rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                    onClick={() => setSelectedType(opt.value)}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-sm text-muted-foreground">{opt.description}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedType(null)}
                    className="text-muted-foreground"
                  >
                    &larr; Back
                  </Button>
                </div>
                <AppCreateForm
                  appType={selectedType}
                  agentOptions={agentOptions}
                  onAppCreated={handleAppCreated}
                />
              </>
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
