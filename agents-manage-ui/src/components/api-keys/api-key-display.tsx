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

interface ApiKeyDisplayProps {
  apiKey: string;
  open: boolean;
  onClose: () => void;
}

export function ApiKeyDisplay({ apiKey, open, onClose }: ApiKeyDisplayProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save your API key</AlertDialogTitle>
          <AlertDialogDescription>
            Your API key has been generated. Make sure to copy it now and store it in a secure
            location as{' '}
            <span className="text-foreground font-medium">it won&apos;t be shown again</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {apiKey && (
          <div className="min-w-0">
            <div className="space-y-6">
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">API Key</div>
                </div>
                <CopyableSingleLineCode code={apiKey} />
              </div>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
