'use client';

import { User, Users } from 'lucide-react';
import { useState } from 'react';
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
}

export function ScopeSelectionDialog({
  open,
  onOpenChange,
  serverName,
  onConfirm,
}: ScopeSelectionDialogProps) {
  const [selectedScope, setSelectedScope] = useState<CredentialScope>(CredentialScopeEnum.project);

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
            <Users className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Project (Shared)</div>
              <p className="text-sm text-muted-foreground mt-1">
                You'll authenticate now and everyone on the team will use this shared credential.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScope(CredentialScopeEnum.user)}
            className={`flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-colors ${
              selectedScope === CredentialScopeEnum.user
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <User className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">User (Per-user)</div>
              <p className="text-sm text-muted-foreground mt-1">
                Each team member connects their own account. No authentication required now.
              </p>
            </div>
          </button>
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
