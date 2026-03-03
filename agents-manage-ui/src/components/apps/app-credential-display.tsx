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
  appSecret?: string;
  open: boolean;
  onClose: () => void;
}

export function AppCredentialDisplay({
  appId,
  appSecret,
  open,
  onClose,
}: AppCredentialDisplayProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {appSecret ? 'Save your app credentials' : 'Your App ID'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {appSecret ? (
              <>
                Your app credentials have been generated. Make sure to copy the secret now and store
                it in a secure location as{' '}
                <span className="text-foreground font-medium">it won&apos;t be shown again</span>.
              </>
            ) : (
              'Your app has been created. Use this App ID in your widget configuration.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">App ID</div>
            </div>
            <CopyableSingleLineCode code={appId} />
          </div>
          {appSecret && (
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">App Secret</div>
              </div>
              <CopyableSingleLineCode code={appSecret} />
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
