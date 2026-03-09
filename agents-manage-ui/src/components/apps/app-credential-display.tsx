'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';

interface AppCredentialDisplayProps {
  appId: string;
  open: boolean;
  onClose: () => void;
}

export function AppCredentialDisplay({ appId, open, onClose }: AppCredentialDisplayProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AlertDialogContent onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Your App ID</AlertDialogTitle>
          <AlertDialogDescription>
            Your app has been created. Use this App ID in your widget configuration.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">App ID</div>
            </div>
            <CopyableSingleLineCode code={appId} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
