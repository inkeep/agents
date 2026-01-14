'use client';

import { Info, User, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type CredentialScope, CredentialScopeEnum } from '../form/validation';

interface ScopeSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  onConfirm: (scope: CredentialScope) => void;
  /** Whether auth is disabled - pass this prop for Shadow DOM compatibility instead of using useRuntimeConfig */
  isAuthDisabled?: boolean;
}

export function ScopeSelectionDialog({
  open,
  onOpenChange,
  serverName,
  onConfirm,
  isAuthDisabled = false,
}: ScopeSelectionDialogProps) {
  const [selectedScope, setSelectedScope] = useState<CredentialScope>(CredentialScopeEnum.project);
  const isUserScopeDisabled = isAuthDisabled;

  const handleConfirm = () => {
    onConfirm(selectedScope);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Credential Scope</DialogTitle>
          <DialogDescription>
            How should <span className="font-medium">{serverName}</span> handle authentication?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <button
            type="button"
            onClick={() => setSelectedScope(CredentialScopeEnum.project)}
            className={`flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-colors ${
              selectedScope === CredentialScopeEnum.project
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Users className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Project (Shared)</div>
              <p className="text-sm text-muted-foreground mt-1">
                You'll authenticate now and everyone on the team will use this shared credential.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isUserScopeDisabled) {
                setSelectedScope(CredentialScopeEnum.user);
              }
            }}
            disabled={isUserScopeDisabled}
            className={`flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-colors ${
              isUserScopeDisabled
                ? 'opacity-50 cursor-not-allowed border-border bg-muted/30'
                : selectedScope === CredentialScopeEnum.user
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
            }`}
          >
            <User className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">User (Per-user)</div>
              <p className="text-sm text-muted-foreground mt-1">
                Each team member connects their own account. No authentication required now.
              </p>
            </div>
          </button>

          {isUserScopeDisabled && (
            <Alert variant="default" className="bg-muted/50">
              <Info className="h-4 w-4" />
              <AlertDescription>
                User-scoped credentials require authentication to be enabled.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
