'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DisconnectInstallationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountLogin: string;
  onConfirm: () => void;
  isDisconnecting?: boolean;
}

export function DisconnectInstallationDialog({
  open,
  onOpenChange,
  accountLogin,
  onConfirm,
  isDisconnecting = false,
}: DisconnectInstallationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Disconnect GitHub Installation
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to disconnect <strong>{accountLogin}</strong>? This will remove
            access to all repositories from this installation and delete any project-level
            repository access configurations.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          <p>
            <strong>Note:</strong> This will not uninstall the GitHub App from your GitHub
            organization. You can do that separately from your GitHub settings if needed.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDisconnecting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDisconnecting}>
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
